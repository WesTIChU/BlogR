/* global Buffer, URL, clearTimeout, console, process, setTimeout */

import dns from 'node:dns/promises'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { resolve } from 'node:path'
import {
  buildStatusData,
  deriveStatus,
  STALE_AFTER_MS
} from '../shared/blog-health-status.js'
import { normalizeBlogHealthUrl } from '../shared/blog-health-url.js'

const CONCURRENCY = 5
const MAX_REDIRECTS = 5
const REQUEST_TIMEOUT_MS = 12_000
const DNS_TIMEOUT_MS = 5_000
const DELAY_MS = 150
const BODY_SAMPLE_LIMIT = 64 * 1024
const USER_AGENT = 'BlogR-Link-Health-Audit/1.0 (+https://blogr.directory)'
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

const blogs = JSON.parse(await readFile(resolve('data/blogs.json'), 'utf8'))

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const stripBrackets = (value) => value.replace(/^\[|\]$/g, '')

const isNonPublicIp = (value) => {
  const normalized = stripBrackets(value).toLowerCase()
  if (net.isIP(normalized) === 4) {
    const [first, second, third] = normalized.split('.').map(Number)
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    )
  }
  if (net.isIP(normalized) !== 6) return false
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  return (
    (mappedIpv4 && isNonPublicIp(mappedIpv4[1])) ||
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  )
}

const isBlockedHostname = (value) => {
  const hostname = stripBrackets(value).toLowerCase().replace(/\.$/, '')
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.home.arpa') ||
    hostname === 'metadata.google.internal'
  )
}

const normalizeUrl = (value) => {
  try {
    return normalizeBlogHealthUrl(value)
  } catch (error) {
    throw Object.assign(error, {
      code: error.message.includes('credentials')
        ? 'URL_CREDENTIALS'
        : 'UNSUPPORTED_PROTOCOL'
    })
  }
}

const resolvePublicHost = async (url) => {
  const hostname = stripBrackets(url.hostname)
  if (isBlockedHostname(hostname) || isNonPublicIp(hostname)) {
    throw Object.assign(new Error('Private or internal destination blocked'), {
      code: 'PRIVATE_DESTINATION'
    })
  }
  if (net.isIP(hostname))
    return [{ address: hostname, family: net.isIP(hostname) }]

  let timer
  try {
    const addresses = await Promise.race([
      dns.lookup(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            Object.assign(new Error('DNS lookup timed out'), {
              code: 'DNS_TIMEOUT'
            })
          )
        }, DNS_TIMEOUT_MS)
      })
    ])
    if (
      !addresses.length ||
      addresses.some(({ address }) => isNonPublicIp(address))
    ) {
      throw Object.assign(
        new Error('DNS resolved to a private or internal address'),
        {
          code: 'PRIVATE_DESTINATION'
        }
      )
    }
    return addresses
  } catch (error) {
    if (error.code === 'PRIVATE_DESTINATION') throw error
    throw Object.assign(new Error(error.message || 'DNS lookup failed'), {
      code: error.code === 'DNS_TIMEOUT' ? 'DNS_TIMEOUT' : 'DNS_ERROR',
      cause: error
    })
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const readResponse = (response) =>
  new Promise((resolvePromise) => {
    const chunks = []
    let size = 0
    response.on('data', (chunk) => {
      if (size < BODY_SAMPLE_LIMIT) {
        const remaining = BODY_SAMPLE_LIMIT - size
        const sample = chunk.subarray(0, remaining)
        chunks.push(sample)
        size += sample.length
      }
    })
    response.on('end', () =>
      resolvePromise({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      })
    )
    response.on('error', () =>
      resolvePromise({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      })
    )
  })

const requestOnce = (url, method, addresses) =>
  new Promise((resolvePromise, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const hostname = stripBrackets(url.hostname)
    const request = client.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || undefined,
        path: `${url.pathname || '/'}${url.search}`,
        method,
        headers: {
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'user-agent': USER_AGENT
        },
        lookup: (_host, _options, callback) => {
          if (_options.all) {
            callback(null, addresses)
            return
          }
          const address = addresses[0]
          callback(null, address.address, address.family)
        }
      },
      async (response) => resolvePromise(await readResponse(response))
    )
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(
        Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' })
      )
    })
    request.on('error', reject)
    request.end()
  })

const classifyError = (error) => {
  if (error.code === 'PRIVATE_DESTINATION') {
    return { status: 'Unknown', failureKind: 'review' }
  }
  if (
    [
      'REDIRECT_LOOP',
      'REDIRECT_LIMIT',
      'REDIRECT_WITHOUT_LOCATION',
      'URL_ERROR'
    ].includes(error.code)
  ) {
    return { status: 'Unknown', failureKind: 'review' }
  }
  if (error.code === 'DNS_ERROR' || error.code === 'ENOTFOUND') {
    return { status: 'Potentially unreachable', failureKind: 'dns' }
  }
  if (
    error.code === 'DNS_TIMEOUT' ||
    error.code === 'TIMEOUT' ||
    error.code === 'ETIMEDOUT'
  ) {
    return { status: 'Temporarily unavailable', failureKind: 'timeout' }
  }
  if (
    error.code?.startsWith('ERR_TLS') ||
    error.code?.startsWith('CERT_') ||
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(
      error.code
    )
  ) {
    return {
      status: 'Potentially unreachable',
      failureKind: 'tls',
      tlsError: { code: error.code || 'TLS_ERROR', message: error.message }
    }
  }
  if (
    error.code === 'UNSUPPORTED_PROTOCOL' ||
    error.code === 'URL_CREDENTIALS'
  ) {
    return { status: 'Unknown', failureKind: 'review' }
  }
  return { status: 'Potentially unreachable', failureKind: 'connection' }
}

const botProtection = (result) => {
  const headers = Object.fromEntries(
    Object.entries(result.headers || {}).map(([key, value]) => [
      key.toLowerCase(),
      String(value)
    ])
  )
  const body = result.body.toLowerCase()
  return (
    headers['cf-mitigated'] ||
    headers['x-sucuri-id'] ||
    headers['x-captcha'] ||
    body.includes('cloudflare ray id') ||
    body.includes('cf-chl-') ||
    body.includes('verify you are human') ||
    body.includes('checking your browser')
  )
}

const classifyResponse = (result, redirects) => {
  if ([401, 403, 429].includes(result.status) || botProtection(result)) {
    return { status: 'Restricted or bot-blocked', failureKind: 'protected' }
  }
  if (result.status >= 200 && result.status < 400) {
    return {
      status: redirects.length ? 'Redirected' : 'Healthy',
      failureKind: null
    }
  }
  if (result.status === 408 || result.status === 425 || result.status >= 500) {
    return { status: 'Temporarily unavailable', failureKind: 'timeout' }
  }
  if ([404, 410].includes(result.status)) {
    return { status: 'Potentially unreachable', failureKind: 'not-found' }
  }
  return { status: 'Unknown', failureKind: 'review' }
}

const recommendedAction = (status) => {
  switch (status) {
    case 'Healthy':
      return 'No action needed.'
    case 'Redirected':
      return 'Manually review the final URL before updating the catalogue.'
    case 'Restricted or bot-blocked':
      return 'Verify manually; do not remove based on this automated result.'
    case 'Temporarily unavailable':
      return 'Retry later before taking any catalogue action.'
    case 'Potentially unreachable':
      return 'Manually verify availability and consider removal only after confirmation.'
    default:
      return 'Manual review required.'
  }
}

const checkBlog = async (blog, normalizedUrl) => {
  const checkedAt = new Date().toISOString()
  const redirects = []
  let currentUrl = normalizedUrl
  const visited = new Set()

  try {
    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount += 1
    ) {
      const currentKey = currentUrl.toString()
      if (visited.has(currentKey)) {
        throw Object.assign(new Error('Redirect loop detected'), {
          code: 'REDIRECT_LOOP'
        })
      }
      visited.add(currentKey)
      const addresses = await resolvePublicHost(currentUrl)
      let result = await requestOnce(currentUrl, 'HEAD', addresses)
      if ([405, 501].includes(result.status)) {
        result = await requestOnce(currentUrl, 'GET', addresses)
      }

      if (!REDIRECT_STATUSES.has(result.status)) {
        const classification = classifyResponse(result, redirects)
        return {
          name: blog.name,
          category: blog.category,
          originalUrl: blog.url,
          finalUrl: currentUrl.toString(),
          status: classification.status,
          failureKind: classification.failureKind,
          httpStatus: result.status,
          checkedAt,
          redirects,
          error: null,
          redirectType: redirects.some(({ unrelated }) => unrelated)
            ? 'unrelated'
            : redirects.length
              ? 'ordinary'
              : null,
          recommendedAction: recommendedAction(classification.status)
        }
      }

      const location = result.headers.location
      if (!location) {
        throw Object.assign(
          new Error('Redirect response had no Location header'),
          {
            code: 'REDIRECT_WITHOUT_LOCATION'
          }
        )
      }
      const nextUrl = normalizeUrl(new URL(location, currentUrl).toString())
      const redirectTarget = new URL(nextUrl)
      const unrelated = redirectTarget.hostname !== currentUrl.hostname
      redirects.push({
        from: currentUrl.toString(),
        to: nextUrl.toString(),
        httpStatus: result.status,
        unrelated
      })
      if (redirectCount === MAX_REDIRECTS) {
        throw Object.assign(new Error(`More than ${MAX_REDIRECTS} redirects`), {
          code: 'REDIRECT_LIMIT'
        })
      }
      currentUrl = nextUrl
    }
  } catch (error) {
    const classification = classifyError(error)
    return {
      name: blog.name,
      category: blog.category,
      originalUrl: blog.url,
      finalUrl: currentUrl.toString(),
      status: classification.status,
      failureKind: classification.failureKind,
      httpStatus: null,
      checkedAt,
      redirects,
      error: { code: error.code || 'CHECK_ERROR', message: error.message },
      tlsError: classification.tlsError || null,
      recommendedAction: recommendedAction(classification.status)
    }
  }
}

const uniqueBlogs = new Map()
for (const blog of blogs) {
  let key
  try {
    key = normalizeUrl(blog.url).toString()
  } catch {
    key = `invalid:${blog.url}`
  }
  if (!uniqueBlogs.has(key)) uniqueBlogs.set(key, blog)
}

const checkedByUrl = new Map()
const uniqueEntries = [...uniqueBlogs.entries()]
let nextIndex = 0
const worker = async () => {
  while (true) {
    const index = nextIndex++
    if (index >= uniqueEntries.length) return
    const [key, blog] = uniqueEntries[index]
    await sleep(index ? DELAY_MS : 0)
    let result
    try {
      result = await checkBlog(blog, normalizeUrl(blog.url))
    } catch (error) {
      const classification = classifyError(error)
      result = {
        name: blog.name,
        category: blog.category,
        originalUrl: blog.url,
        finalUrl: blog.url,
        status: classification.status,
        failureKind: classification.failureKind,
        httpStatus: null,
        checkedAt: new Date().toISOString(),
        redirects: [],
        error: { code: error.code || 'URL_ERROR', message: error.message },
        tlsError: classification.tlsError || null,
        recommendedAction: recommendedAction(classification.status)
      }
    }
    checkedByUrl.set(key, result)
    process.stdout.write(
      `Checked ${checkedByUrl.size}/${uniqueEntries.length}: ${blog.name}\n`
    )
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker))

const results = blogs.map((blog) => {
  let key
  try {
    key = normalizeUrl(blog.url).toString()
  } catch {
    key = `invalid:${blog.url}`
  }
  return { ...checkedByUrl.get(key), name: blog.name, category: blog.category }
})

const counts = Object.fromEntries(
  [...new Set(results.map(({ status }) => status))].map((status) => [
    status,
    results.filter((result) => result.status === status).length
  ])
)
const report = {
  generatedAt: new Date().toISOString(),
  catalogueCount: blogs.length,
  uniqueUrlCount: uniqueEntries.length,
  concurrency: CONCURRENCY,
  maxRedirects: MAX_REDIRECTS,
  results,
  summary: counts
}

const historyPath = resolve('reports/blog-health-history.json')
let history = []
try {
  history = JSON.parse(await readFile(historyPath, 'utf8'))
  if (!Array.isArray(history)) history = []
} catch {
  history = []
}

const previousStatusData = new Map(
  (history.at(-1)?.statusData || []).map((entry) => [entry.url, entry])
)
const statusData = buildStatusData(
  [...checkedByUrl.values()],
  previousStatusData,
  new Date(report.generatedAt)
)
report.statusData = statusData
report.publicStatusLegend = [
  'online',
  'warning',
  'repeatedly-unreachable',
  'unknown'
]

history.push({
  checkedAt: report.generatedAt,
  statusData,
  results
})

const markdown = [
  '# Blog Health Audit',
  '',
  `Generated: ${report.generatedAt}`,
  `Catalogue entries: ${report.catalogueCount}`,
  `Unique URLs checked: ${report.uniqueUrlCount}`,
  `Status data is stale after ${STALE_AFTER_MS / 60 / 60 / 1000} hours.`,
  '',
  '## Summary',
  '',
  ...Object.entries(counts).map(
    ([status, count]) => `- **${status}:** ${count}`
  ),
  '',
  '## Websites requiring manual review',
  '',
  ...results
    .filter((result) => result.status !== 'Healthy')
    .map(
      (result) =>
        `- **${result.name}** (${result.status}) - ${result.originalUrl} -> ${result.finalUrl}. ${result.recommendedAction}`
    ),
  '',
  '## Detailed results',
  '',
  '| Blog | Category | Original URL | Final URL | Status | HTTP | Redirects | Checked at | Recommended action |',
  '| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |',
  ...results.map(
    (result) =>
      `| ${result.name.replaceAll('|', '\\|')} | ${result.category} | ${result.originalUrl} | ${result.finalUrl} | ${result.status} | ${result.httpStatus ?? '-'} | ${result.redirects.length} | ${result.checkedAt} | ${result.recommendedAction.replaceAll('|', '\\|')} |`
  ),
  ''
].join('\n')

await mkdir(resolve('reports'), { recursive: true })
await writeFile(
  resolve('reports/blog-health.json'),
  `${JSON.stringify(report, null, 2)}\n`
)
await writeFile(resolve('reports/blog-health.md'), markdown)
await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`)

const publicStatusByUrl = new Map()
for (const entry of statusData) {
  try {
    const url = normalizeBlogHealthUrl(entry.url).toString()
    publicStatusByUrl.set(url, {
      url,
      status: entry.status,
      checkedAt: entry.checkedAt
    })
  } catch {
    // Invalid catalogue URLs have no safe public status key.
  }
}
await mkdir(resolve('docs/public'), { recursive: true })
await writeFile(
  resolve('docs/public/health-status.json'),
  `${JSON.stringify([...publicStatusByUrl.values()], null, 2)}\n`
)

console.log(
  `Audited ${results.length} catalogue entries across ${uniqueEntries.length} unique URLs.`
)
console.log(JSON.stringify(counts, null, 2))
