/* global URL, clearTimeout, console, process, setTimeout */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deriveStatus } from '../shared/blog-health-status.js'
import { normalizeBlogHealthUrl } from '../shared/blog-health-url.js'
import { classifyCommunityResponse } from '../shared/community-health.js'

const CONCURRENCY = 3
const REQUEST_TIMEOUT_MS = 12_000
const RETRIES = 2
const RETRY_DELAY_MS = 500
const USER_AGENT = 'BlogR-Community-Availability/1.0 (+https://blogr.directory)'
const SOURCE_PATH = resolve('docs/communities/online-communities.md')
const PUBLIC_PATH = resolve('docs/public/community-health-status.json')
const HISTORY_PATH = resolve('reports/community-health-history.json')

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const source = await readFile(SOURCE_PATH, 'utf8')
const entries = Array.from(
  source.matchAll(/<a href="([^"]+)"[^>]*><strong>(.*?)<\/strong><\/a>/g),
  ([, url, name]) => ({
    name,
    url: normalizeBlogHealthUrl(url).toString()
  })
)

const request = async (url) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: controller.signal
    })
    return {
      status: response.status,
      redirected: response.redirected,
      finalUrl: response.url,
      headers: Object.fromEntries(response.headers),
      body: (await response.text()).slice(0, 16 * 1024)
    }
  } finally {
    clearTimeout(timeout)
  }
}

const check = async (entry) => {
  let lastError
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    const checkedAt = new Date().toISOString()
    try {
      const response = await request(entry.url)
      const classification = classifyCommunityResponse(response)
      return {
        ...entry,
        checkedAt,
        httpStatus: response.status,
        finalUrl: response.finalUrl,
        ...classification,
        error: null
      }
    } catch (error) {
      lastError = error
      if (attempt < RETRIES) await sleep(RETRY_DELAY_MS)
    }
  }
  return {
    ...entry,
    checkedAt: new Date().toISOString(),
    httpStatus: null,
    finalUrl: entry.url,
    status: 'Potentially unreachable',
    failureKind: lastError?.name === 'AbortError' ? 'timeout' : 'connection',
    error: {
      code: lastError?.code || lastError?.name || 'CHECK_ERROR',
      message: lastError?.message || 'Request failed'
    }
  }
}

let history = []
try {
  history = JSON.parse(await readFile(HISTORY_PATH, 'utf8'))
  if (!Array.isArray(history)) history = []
} catch {
  history = []
}

const previous = new Map(
  (history.at(-1)?.statusData || []).map((entry) => [entry.url, entry])
)
const results = []
let nextIndex = 0
const worker = async () => {
  while (nextIndex < entries.length) {
    const entry = entries[nextIndex++]
    results.push(await check(entry))
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const generatedAt = new Date().toISOString()
const statusData = results.map((result) => {
  const derived = deriveStatus(
    result,
    previous.get(result.url),
    new Date(result.checkedAt)
  )
  return {
    url: result.url,
    status: derived.status,
    checkedAt: result.checkedAt,
    httpStatus: result.httpStatus,
    finalUrl: result.finalUrl,
    consecutiveFailures: derived.consecutiveFailures
  }
})

history.push({ checkedAt: generatedAt, statusData, results })
await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`)
await writeFile(PUBLIC_PATH, `${JSON.stringify(statusData, null, 2)}\n`)
console.log(`Audited ${results.length} community URLs.`)
