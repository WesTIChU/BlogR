/* global URL, clearTimeout, console, process, setTimeout */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deriveStatus } from '../shared/blog-health-status.js'
import { normalizeCommunityCatalogue } from '../shared/community-catalogue.js'
import { checkCommunity } from '../shared/community-health-check.js'

const CONCURRENCY = 3
const MAX_REDIRECTS = 5
const REQUEST_TIMEOUT_MS = 12_000
const RETRIES = 2
const RETRY_DELAY_MS = 500
const USER_AGENT = 'BlogR-Community-Availability/1.0 (+https://blogr.directory)'
const CATALOGUE_PATH = resolve('data/communities.json')
const PUBLIC_PATH = resolve('docs/public/community-health-status.json')
const HISTORY_PATH = resolve('reports/community-health-history.json')

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const catalogue = normalizeCommunityCatalogue(
  JSON.parse(await readFile(CATALOGUE_PATH, 'utf8'))
)

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
  while (nextIndex < catalogue.length) {
    const entry = catalogue[nextIndex++]
    let result
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      result = await checkCommunity(entry, {
        maxRedirects: MAX_REDIRECTS,
        requestOptions: {
          timeoutMs: REQUEST_TIMEOUT_MS,
          bodySampleLimit: 16 * 1024,
          userAgent: USER_AGENT
        }
      })
      if (result.failureKind !== 'connection' || attempt === RETRIES) break
      await sleep(RETRY_DELAY_MS)
    }
    results.push(result)
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
