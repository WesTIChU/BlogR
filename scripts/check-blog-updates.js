import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const CONCURRENCY = 4
const USER_AGENT = 'BlogR-Update-Checker/1.0 (+https://blogr.directory)'
const FEED_PATHS = [
  'feed/',
  'feed.xml',
  'rss.xml',
  'atom.xml',
  'index.xml',
  '/feed/',
  '/feed.xml',
  '/rss.xml',
  '/atom.xml',
  '/index.xml'
]

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

export function canonicalUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported')
  }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = ''
  }
  return url.toString()
}

const decodeEntities = (value) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_match, code) => {
      const value = code.toLowerCase().startsWith('x')
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10)
      return Number.isFinite(value) ? String.fromCodePoint(value) : ''
    })
    .replace(
      /&(nbsp|ndash|mdash|hellip|lsquo|rsquo|ldquo|rdquo|bull|copy|reg|trade);/gi,
      (_match, name) =>
        ({
          nbsp: ' ',
          ndash: '–',
          mdash: '—',
          hellip: '…',
          lsquo: '‘',
          rsquo: '’',
          ldquo: '“',
          rdquo: '”',
          bull: '•',
          copy: '©',
          reg: '®',
          trade: '™'
        })[name.toLowerCase()] ?? ''
    )
    .replace(/&amp;/gi, '&')

const tagAttributes = (tag) => {
  const attributes = {}
  for (const match of tag.matchAll(
    /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  )) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3])
  }
  return attributes
}

const tagValues = (xml, names) => {
  const pattern = names.join('|')
  return [
    ...xml.matchAll(
      new RegExp(`<(${pattern})\\b[^>]*>([\\s\\S]*?)<\\/\\1\\s*>`, 'gi')
    )
  ].map(([, , value]) => decodeEntities(value.replace(/<[^>]+>/g, '').trim()))
}

const rawTagValues = (xml, names) => {
  const pattern = names.join('|')
  return [
    ...xml.matchAll(
      new RegExp(`<(${pattern})\\b[^>]*>([\\s\\S]*?)<\\/\\1\\s*>`, 'gi')
    )
  ].map(([, , value]) => value.trim())
}

const plainText = (value) => {
  let text = value
  for (let pass = 0; pass < 2; pass++) {
    text = text
      .replace(/<!\[CDATA\[|\]\]>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(
        /<(script|style|iframe|object|embed|video|audio|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        ' '
      )
      .replace(/<(img|source|track|br)\b[^>]*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
    text = decodeEntities(text)
  }
  return text.replace(/\s+/g, ' ').trim()
}

const articlePreview = (entry, atom) => {
  const names = atom
    ? ['summary', 'content']
    : ['description', 'content:encoded']
  for (const value of rawTagValues(entry, names)) {
    const text = plainText(value)
    if (text) {
      const characters = Array.from(text)
      return characters.length > 200
        ? `${characters.slice(0, 199).join('')}…`
        : text
    }
  }
  return null
}

const validPostTime = (value, now) => {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (
    !Number.isFinite(timestamp) ||
    timestamp > now.getTime() + 5 * 60 * 1000
  ) {
    return null
  }
  return timestamp
}

const firstValidTime = (values, now) => {
  for (const value of values) {
    const timestamp = validPostTime(value, now)
    if (timestamp !== null) return timestamp
  }
  return null
}

const firstTagValue = (xml, names) => tagValues(xml, names)[0] ?? null

const isLikelyArticleUrl = (value) => {
  try {
    const url = new URL(value, 'https://blogr.invalid')
    return !/(^|\/)(feeds?|comments?|rss|atom)(\/|$)/i.test(url.pathname)
  } catch {
    return false
  }
}

const entryUrl = (entry, atom) => {
  const candidates = []
  if (atom) {
    for (const match of entry.matchAll(/<link\b([^>]*)>/gi)) {
      const attributes = tagAttributes(match[1])
      if (attributes.href) {
        candidates.push({
          value: attributes.href,
          preferred: attributes.rel?.toLowerCase() === 'alternate'
        })
      }
    }
  } else {
    for (const value of tagValues(entry, ['link', 'guid'])) {
      candidates.push({ value, preferred: true })
    }
  }
  return (
    candidates.find(
      ({ value, preferred }) => preferred && isLikelyArticleUrl(value)
    )?.value ??
    candidates.find(({ value }) => isLikelyArticleUrl(value))?.value ??
    null
  )
}

const absoluteHttpUrl = (value, feedUrl) => {
  if (!value) return null
  try {
    const url = new URL(value, feedUrl ?? undefined)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

export function parseFeedDetails(xml, now = new Date(), feedUrl = null) {
  if (!/<(?:rss\b|feed\b|rdf:RDF\b)/i.test(xml)) {
    throw new Error('Response is not an RSS or Atom feed')
  }

  const entries = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry\s*>/gi)
  ]
  const atom = /<feed\b/i.test(xml)
  const dates = []
  const publications = []
  for (const [, entry] of entries) {
    // Feed-level updated timestamps are deliberately excluded. For Atom,
    // entry.published and entry.updated are both post activity timestamps.
    // For RSS, pubDate is publication and the item-level modification fields
    // are considered when present.
    const activityValues = atom
      ? [...tagValues(entry, ['published']), ...tagValues(entry, ['updated'])]
      : [
          ...tagValues(entry, ['pubDate']),
          ...tagValues(entry, ['dc:date', 'date']),
          ...tagValues(entry, [
            'updated',
            'modified',
            'dcterms:modified',
            'lastmod'
          ])
        ]
    const timestamp = Math.max(
      ...activityValues
        .map((value) => validPostTime(value, now))
        .filter((value) => value !== null)
    )
    if (Number.isFinite(timestamp)) dates.push(timestamp)

    const publicationValues = atom
      ? tagValues(entry, ['published'])
      : tagValues(entry, ['pubDate', 'dc:date', 'date'])
    const publicationTimestamp = firstValidTime(publicationValues, now)
    if (publicationTimestamp === null) continue
    const title = firstTagValue(entry, ['title'])
    const url = absoluteHttpUrl(entryUrl(entry, atom), feedUrl)
    const summary = articlePreview(entry, atom)
    publications.push({
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
      ...(summary ? { summary } : {}),
      publishedAt: new Date(publicationTimestamp).toISOString()
    })
  }
  if (!entries.length)
    throw new Error('Feed contains no RSS items or Atom entries')
  const latestPublication =
    publications.sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    )[0] ?? null
  return {
    lastPublished: dates.length
      ? new Date(Math.max(...dates)).toISOString().slice(0, 10)
      : null,
    latestArticle: latestPublication
  }
}

export function parseFeed(xml, now = new Date()) {
  return parseFeedDetails(xml, now).lastPublished
}

const readBody = async (response) => {
  if (!response.body) return response.text()
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('Response exceeded size limit')
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(
    chunks.reduce(
      (result, chunk) => {
        result.set(chunk, result.offset)
        result.offset += chunk.length
        return result
      },
      Object.assign(new Uint8Array(size), { offset: 0 })
    )
  )
}

export async function requestText(url, signal) {
  const response = await fetch(url, {
    headers: {
      accept:
        'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.1',
      'user-agent': USER_AGENT
    },
    redirect: 'follow',
    signal
  })
  const body = await readBody(response)
  return { body, status: response.status, url: response.url || url }
}

const requestWithTimeout = async (url) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await requestText(url, controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

export function discoverFeedUrls(pageUrl, html) {
  const discovered = []
  for (const [, rawTag] of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attributes = tagAttributes(rawTag)
    const type = attributes.type ?? ''
    const rel = attributes.rel ?? ''
    if (
      attributes.href &&
      (/(^|\s)alternate(\s|$)/i.test(rel) || /rss|atom|xml/i.test(type)) &&
      /rss|atom|xml/i.test(type + rel + attributes.href)
    ) {
      try {
        discovered.push(new URL(attributes.href, pageUrl).toString())
      } catch {
        // Ignore malformed feed links and continue with fallbacks.
      }
    }
  }
  for (const path of FEED_PATHS) {
    try {
      discovered.push(new URL(path, pageUrl).toString())
    } catch {
      // The blog URL is validated by scanBlog.
    }
  }
  return [...new Set(discovered)]
}

const failureResult = (previous, status, feedUrl = null) => ({
  lastPublished: previous?.lastPublished ?? null,
  status,
  feedUrl: feedUrl ?? previous?.feedUrl ?? null
})

export async function scanBlog(blog, previous = null, now = new Date()) {
  const url = canonicalUrl(blog.url)
  const candidates = []
  let pageResponse
  try {
    pageResponse = await requestWithTimeout(url)
    if (pageResponse.status >= 200 && pageResponse.status < 300) {
      const trimmed = pageResponse.body.trim()
      if (/<(?:rss|feed|rdf:RDF)\b/i.test(trimmed)) {
        const parsed = parseFeedDetails(trimmed, now, pageResponse.url)
        if (parsed.lastPublished) {
          return {
            lastPublished: parsed.lastPublished,
            ...(parsed.latestArticle
              ? { latestArticle: parsed.latestArticle }
              : {}),
            status: 'success',
            feedUrl: pageResponse.url
          }
        }
      }
      candidates.push(...discoverFeedUrls(pageResponse.url, pageResponse.body))
    }
  } catch {
    // Feed fallbacks can still work when the homepage is unavailable.
  }

  if (!candidates.length) candidates.push(...discoverFeedUrls(url, ''))
  let foundFeed = false
  let lastFeedUrl = null
  for (const candidate of candidates) {
    try {
      const response = await requestWithTimeout(candidate)
      if (response.status === 429 || response.status >= 500) {
        await sleep(25)
        continue
      }
      if (response.status < 200 || response.status >= 300) continue
      foundFeed = true
      lastFeedUrl = response.url || candidate
      const parsed = parseFeedDetails(response.body, now, lastFeedUrl)
      if (parsed.lastPublished) {
        return {
          lastPublished: parsed.lastPublished,
          ...(parsed.latestArticle
            ? { latestArticle: parsed.latestArticle }
            : {}),
          status: 'success',
          feedUrl: lastFeedUrl
        }
      }
    } catch {
      // Try the next discovered or fallback feed.
    }
  }
  return failureResult(
    previous,
    foundFeed ? 'unknown' : 'unavailable',
    lastFeedUrl
  )
}

const comparable = (entry) =>
  JSON.stringify({
    lastPublished: entry.lastPublished ?? null,
    latestArticle: entry.latestArticle ?? null,
    status: entry.status,
    feedUrl: entry.feedUrl ?? null
  })

export function mergeResult(previous, result, checkedAt) {
  const merged = {
    lastPublished: result.lastPublished ?? previous?.lastPublished ?? null,
    lastChecked: previous?.lastChecked ?? checkedAt,
    status: result.status,
    feedUrl: result.feedUrl ?? previous?.feedUrl ?? null
  }
  if (result.latestArticle !== undefined) {
    merged.latestArticle = result.latestArticle
  } else if (previous?.latestArticle !== undefined) {
    merged.latestArticle = previous.latestArticle
  }
  if (!previous || comparable(previous) !== comparable(merged)) {
    merged.lastChecked = checkedAt
  }
  return merged
}

const runPool = async (items, worker) => {
  const results = []
  let next = 0
  const runners = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await worker(items[index])
      }
    }
  )
  await Promise.all(runners)
  return results
}

export async function checkBlogs({ blogs, previous = {}, now = new Date() }) {
  const checkedAt = now.toISOString()
  const results = await runPool(blogs, async (blog) => {
    let key
    try {
      key = canonicalUrl(blog.url)
      const result = await scanBlog(blog, previous[key], now)
      return [key, mergeResult(previous[key], result, checkedAt)]
    } catch {
      key = blog.url
      const result = failureResult(previous[key], 'unavailable')
      return [key, mergeResult(previous[key], result, checkedAt)]
    }
  })
  return Object.fromEntries(results)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const blogs = JSON.parse(await readFile(resolve('data/blogs.json'), 'utf8'))
  let previous = {}
  try {
    previous = JSON.parse(
      await readFile(resolve('data/blog-updates.json'), 'utf8')
    )
  } catch {
    // First scan.
  }
  const updates = await checkBlogs({ blogs, previous })
  await writeFile(
    resolve('data/blog-updates.json'),
    `${JSON.stringify(updates, null, 2)}\n`
  )
  const values = Object.values(updates)
  console.log(
    `Scanned ${values.length} blogs: ${values.filter(({ status }) => status === 'success').length} reliable update dates, ${values.filter(({ status }) => status === 'unavailable').length} without a usable feed, ${values.filter(({ status }) => status === 'unknown').length} failed or indeterminate.`
  )
}
