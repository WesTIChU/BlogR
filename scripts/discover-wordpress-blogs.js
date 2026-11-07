import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  normalizeCandidateUrl,
  reconcileCandidateTracking
} from './wordpress-candidate-tracking.js'

const API_ROOT = 'https://public-api.wordpress.com/rest/v1.1/read/tags'
const DEFAULT_TAG = 'travel'
const DEFAULT_MAX = 200
const DEFAULT_DELAY_MS = 750
const DEFAULT_TIMEOUT_MS = 15_000
const userAgent = 'BlogR-WordPress-Discover/1.0 (+https://blogr.directory)'

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const hasFlag = (name) => process.argv.includes(name)

const tag = argument('--tag', DEFAULT_TAG).trim().replace(/^#/, '')
const max = Math.max(1, Number(argument('--max', DEFAULT_MAX)) || DEFAULT_MAX)
const delayMs = Math.max(
  0,
  Number(argument('--delay-ms', DEFAULT_DELAY_MS)) || DEFAULT_DELAY_MS
)
const timeoutMs = Math.max(
  1_000,
  Number(argument('--timeout-ms', DEFAULT_TIMEOUT_MS)) || DEFAULT_TIMEOUT_MS
)
const suppliedPath = argument('--supplied', null)
const reportPath = argument(
  '--report',
  `reports/wordpress-discover-${tag.toLowerCase()}.json`
)
const dryRun = !hasFlag('--publish')
const mode = argument('--mode', dryRun ? 'dry-run' : 'import-approved')
const trackingPath = argument(
  '--tracking',
  'reports/wordpress-candidate-tracking.json'
)
const inputReportPath = argument('--input-report', null)
const includeProcessed = hasFlag('--include-processed')
const approvedPath = argument('--approved', null)

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))

const fetchJson = async (url) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': userAgent },
      signal: controller.signal
    })
    if (!response.ok)
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

const normalizeUrl = normalizeCandidateUrl

const readSupplied = async () => {
  if (!suppliedPath) return []
  const source = await readFile(resolve(suppliedPath), 'utf8')
  const values = source.trim().startsWith('[')
    ? JSON.parse(source)
    : source.split(/\r?\n/)
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : value.url))
    .filter(Boolean)
}

const discoverPosts = async () => {
  const posts = []
  const seenPosts = new Set()
  let page = 1
  let pagesScanned = 0
  let stopped = 'empty-page'
  let before = null

  while (posts.length < max) {
    const url = new URL(`${API_ROOT}/${encodeURIComponent(tag)}/posts/`)
    url.searchParams.set('number', String(Math.min(100, max - posts.length)))
    // The public endpoint currently ignores offset/page-style pagination. Its
    // date cursor is stable and public, so use the oldest returned post as the
    // next boundary instead of pretending that page numbers are reliable.
    if (before) url.searchParams.set('before', before)
    pagesScanned += 1

    let payload
    try {
      payload = await fetchJson(url)
    } catch (error) {
      stopped = `request-failed: ${error.message}`
      break
    }

    const pagePosts = Array.isArray(payload.posts) ? payload.posts : []
    const countBefore = posts.length
    for (const post of pagePosts) {
      const postUrl = normalizeUrl(post.URL)
      const siteUrl = normalizeUrl(post.site_URL)
      if (!postUrl || !siteUrl || seenPosts.has(postUrl)) continue
      seenPosts.add(postUrl)
      posts.push({
        source: 'wordpress-discover',
        tag,
        postUrl,
        siteUrl,
        siteName: post.site_name || null,
        title: post.title || null,
        publishedAt: post.date || null,
        modifiedAt: post.modified || null,
        postId: post.ID,
        siteId: post.site_ID
      })
      if (posts.length >= max) break
    }

    if (!pagePosts.length) break
    if (posts.length === countBefore) {
      stopped = 'cursor-made-no-progress'
      break
    }
    const dates = pagePosts
      .map(({ date }) => date)
      .filter(Boolean)
      .sort()
    const nextBefore = dates[0]
    if (!nextBefore || nextBefore === before) {
      stopped = 'cursor-unavailable'
      break
    }
    before = nextBefore
    page += 1
    if (posts.length < max) await sleep(delayMs)
  }

  if (posts.length >= max) stopped = 'max-candidates'
  return { posts, pagesScanned, stopped }
}

const main = async () => {
  const supplied = await readSupplied()
  const suppliedCandidates = supplied.map((url) => ({
    source: 'supplied',
    suppliedUrl: url,
    siteUrl: normalizeUrl(url),
    siteName: null,
    title: null,
    publishedAt: null,
    modifiedAt: null
  }))
  let discovery
  if (inputReportPath) {
    const report = JSON.parse(await readFile(resolve(inputReportPath), 'utf8'))
    discovery = {
      posts: report.candidates || [],
      pagesScanned: report.pagesScanned || 0,
      stopped: `loaded-report: ${inputReportPath}`
    }
  } else {
    discovery = await discoverPosts()
  }
  const candidates = [...suppliedCandidates, ...discovery.posts]
  const uniqueSites = new Map()
  for (const candidate of candidates) {
    if (!candidate.siteUrl) {
      candidate.discoveryStatus = 'invalid-url'
      continue
    }
    const existing = uniqueSites.get(candidate.siteUrl)
    if (existing) {
      existing.sources = [
        ...new Set([...(existing.sources || []), candidate.source])
      ]
      existing.postCount = (existing.postCount || 0) + 1
    } else {
      uniqueSites.set(candidate.siteUrl, {
        ...candidate,
        sources: candidate.sources || [candidate.source].filter(Boolean),
        postCount: candidate.postUrl ? 1 : 0,
        discoveryStatus: 'candidate'
      })
    }
  }

  const catalogueFiles = [
    'data/blogs.json',
    'data/websites.json',
    'data/communities.json'
  ]
  const catalogueEntries = (
    await Promise.all(
      catalogueFiles.map((path) =>
        readFile(resolve(path), 'utf8').then(JSON.parse)
      )
    )
  ).flat()
  const listedUrls = new Set(
    catalogueEntries.map(({ url }) => normalizeUrl(url)).filter(Boolean)
  )
  let previousTracking = {}
  try {
    previousTracking = JSON.parse(await readFile(resolve(trackingPath), 'utf8'))
  } catch {}
  const tracking = reconcileCandidateTracking({
    candidates: [...uniqueSites.values()],
    listedUrls,
    previous: previousTracking.records || previousTracking,
    now: new Date().toISOString()
  })
  const trackingSummary = Object.values(tracking).reduce((summary, entry) => {
    summary[entry.decision] = (summary[entry.decision] || 0) + 1
    return summary
  }, {})
  await mkdir(resolve(trackingPath, '..'), { recursive: true })
  await writeFile(
    resolve(trackingPath),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), records: tracking }, null, 2)}\n`
  )
  const unprocessedCandidates = [...uniqueSites.values()].filter(
    (candidate) =>
      includeProcessed ||
      tracking[normalizeUrl(candidate.siteUrl)]?.decision === 'new'
  )
  let importedCount = 0
  if (mode === 'import-approved' && approvedPath) {
    const payload = JSON.parse(await readFile(resolve(approvedPath), 'utf8'))
    const approved = Array.isArray(payload)
      ? payload
      : payload.added || payload.approved || []
    const blogsPath = resolve('data/blogs.json')
    const blogs = JSON.parse(await readFile(blogsPath, 'utf8'))
    const blogUrls = new Set(blogs.map(({ url }) => normalizeUrl(url)))
    const importedAt = new Date().toISOString()
    for (const entry of approved) {
      const url = normalizeUrl(entry.url)
      if (
        !url ||
        !entry.name ||
        !entry.description ||
        !entry.category ||
        !entry.subcategory ||
        blogUrls.has(url)
      )
        continue
      blogs.push({
        name: entry.name,
        url,
        description: entry.description,
        category: entry.category,
        topics: entry.topics || [],
        recentlyAdded: true,
        favourite: false,
        noLongerUpdated: false,
        addedDate: importedAt.slice(0, 10),
        addedAt: importedAt,
        country: entry.country || null,
        subcategory: entry.subcategory,
        clicks: 0,
        webringId: entry.webringId || `br-${randomBytes(16).toString('hex')}`
      })
      blogUrls.add(url)
      importedCount += 1
    }
    if (importedCount)
      await writeFile(blogsPath, `${JSON.stringify(blogs, null, 2)}\n`)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    tag,
    maxCandidates: max,
    dryRun,
    api: `${API_ROOT}/${encodeURIComponent(tag)}/posts/`,
    pagesScanned: discovery.pagesScanned,
    stopReason: discovery.stopped,
    suppliedCount: supplied.length,
    suppliedUniqueCount: new Set(supplied.map(normalizeUrl).filter(Boolean))
      .size,
    discoveredPostCount: discovery.posts.length,
    uniqueCandidateSiteCount: uniqueSites.size,
    mode,
    trackingPath,
    trackingSummary,
    skippedProcessed: !includeProcessed,
    unprocessedCandidateSiteCount: unprocessedCandidates.length,
    importedCount,
    candidates: includeProcessed
      ? [...uniqueSites.values()]
      : unprocessedCandidates
  }

  await mkdir(resolve(reportPath, '..'), { recursive: true })
  await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    `WordPress Discover: ${report.discoveredPostCount} posts across ${report.pagesScanned} page(s), ${report.uniqueCandidateSiteCount} unique site candidates.`
  )
  console.log(
    `Supplied URLs: ${report.suppliedCount} (${report.suppliedUniqueCount} unique). Stopped: ${report.stopReason}.`
  )
  console.log(`Report: ${resolve(reportPath)}`)
  console.log(
    `Mode: ${mode}. Candidate tracking updated; imported ${importedCount} approved catalogue record(s).`
  )
}

await main()
