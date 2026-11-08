import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  normalizeCandidateUrl,
  reconcileCandidateTracking
} from './wordpress-candidate-tracking.js'

// The Latest tab is currently served by this public, unauthenticated endpoint.
// It is deliberately used instead of scraping the Discover page.
export const LATEST_API =
  'https://public-api.wordpress.com/rest/v1.1/freshly-pressed'
const TAG_API = 'https://public-api.wordpress.com/rest/v1.1/read/tags'
const DEFAULT_MAX_POSTS = 200
const DEFAULT_BATCH_SIZE = 100
const DEFAULT_DELAY_MS = 750
const DEFAULT_TIMEOUT_MS = 15_000
const userAgent = 'BlogR-WordPress-Discover/1.0 (+https://blogr.directory)'

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const hasFlag = (name) => process.argv.includes(name)
const numberArgument = (name, fallback, minimum = 1) =>
  Math.max(minimum, Number(argument(name, fallback)) || fallback)

const source = argument('--source', 'tag')
const tag = argument('--tag', 'travel').trim().replace(/^#/, '')
const maxPosts = numberArgument(
  '--max-posts',
  numberArgument('--max', DEFAULT_MAX_POSTS)
)
const batchSize = Math.min(
  100,
  numberArgument('--batch-size', DEFAULT_BATCH_SIZE)
)
const delayMs = numberArgument('--delay-ms', DEFAULT_DELAY_MS, 0)
const timeoutMs = numberArgument('--timeout-ms', DEFAULT_TIMEOUT_MS, 1_000)
const mode = argument('--mode', hasFlag('--publish') ? 'import' : 'discover')
const resume = hasFlag('--resume')
const incremental = hasFlag('--incremental')
const trackingPath = argument(
  '--tracking',
  'reports/wordpress-candidate-tracking.json'
)
const checkpointPath = argument(
  '--checkpoint',
  'reports/wordpress-latest-checkpoint.json'
)
const reportPath = argument(
  '--report',
  source === 'latest'
    ? mode === 'review'
      ? 'reports/wordpress-latest-review.json'
      : mode === 'import'
        ? 'reports/wordpress-latest-approval.json'
        : 'reports/wordpress-discover-latest.json'
    : `reports/wordpress-discover-${tag.toLowerCase()}.json`
)
const inputReportPath = argument('--input-report', null)
const approvedPath = argument('--approved', null)
const suppliedPath = argument('--supplied', null)

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

export const postSiteUrl = (post) =>
  normalizeCandidateUrl(
    post.site_URL || post.site_url || post.author?.URL || post.URL
  )

export const candidateFromPost = (post, discoverySource = 'Latest') => ({
  source:
    discoverySource === 'Latest'
      ? 'wordpress-discover-latest'
      : 'wordpress-discover',
  discoverySource,
  postUrl: normalizeCandidateUrl(post.URL),
  siteUrl: postSiteUrl(post),
  siteName: post.site_name || null,
  title: post.title || null,
  publishedAt: post.date || null,
  modifiedAt: post.modified || null,
  postId: post.ID ?? null,
  siteId: post.site_ID ?? null
})

const writeJson = async (path, payload) => {
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(resolve(path), `${JSON.stringify(payload, null, 2)}\n`)
}

const readJson = async (path, fallback = null) => {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf8'))
  } catch {
    return fallback
  }
}

const readSupplied = async () => {
  if (!suppliedPath) return []
  const text = await readFile(resolve(suppliedPath), 'utf8')
  const values = text.trim().startsWith('[')
    ? JSON.parse(text)
    : text.split(/\r?\n/)
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : value.url))
    .filter(Boolean)
}

const checkpoint = (payload, extra = {}) => ({
  version: 1,
  source: 'latest',
  ...payload,
  ...extra,
  updatedAt: new Date().toISOString()
})

export const discoverLatest = async ({
  limit = maxPosts,
  batch = batchSize,
  checkpointFile = checkpointPath,
  resumeFrom = resume,
  incrementalScan = incremental,
  onBatch = async () => {}
} = {}) => {
  const saved = resumeFrom ? await readJson(checkpointFile, {}) : {}
  const remaining =
    resumeFrom && !incrementalScan
      ? Math.max(0, limit - (saved.totalPostsScanned || 0))
      : limit
  if (!remaining) {
    return {
      posts: [],
      pagesScanned: 0,
      stopReason: 'max-posts',
      cursor: saved.cursor || null,
      newestCursor: saved.newestCursor || null,
      errors: saved.errors || []
    }
  }
  const posts = []
  const seenPostIds = new Set()
  let cursor = incrementalScan
    ? saved.newestCursor || null
    : saved.cursor || null
  let pagesScanned = 0
  let errors = [...(saved.errors || [])]
  let stopReason = 'empty-page'
  let newestCursor = saved.newestCursor || null

  let lastPostId = saved.lastPostId || null
  while (posts.length < remaining) {
    const url = new URL(LATEST_API)
    url.searchParams.set(
      'number',
      String(Math.min(batch, remaining - posts.length))
    )
    if (cursor)
      url.searchParams.set(incrementalScan ? 'after' : 'before', cursor)
    let payload
    try {
      payload = await fetchJson(url)
    } catch (error) {
      errors.push({
        at: new Date().toISOString(),
        message: error.message,
        url: url.href
      })
      stopReason = `request-failed: ${error.message}`
      await writeJson(
        checkpointFile,
        checkpoint(saved, {
          cursor,
          pagesScanned,
          totalPostsScanned: (saved.totalPostsScanned || 0) + posts.length,
          errors,
          stopReason
        })
      )
      break
    }
    pagesScanned += 1
    const pagePosts = Array.isArray(payload.posts) ? payload.posts : []
    const dates = pagePosts
      .map((post) => post.date)
      .filter(Boolean)
      .sort()
    const pageNewest = dates.at(-1) || payload.date_range?.newest || null
    const pageOldest = dates[0] || payload.date_range?.oldest || null
    newestCursor ||= pageNewest
    for (const post of pagePosts) {
      const id = String(post.ID ?? `${post.site_ID}:${post.URL}`)
      if (seenPostIds.has(id)) continue
      seenPostIds.add(id)
      posts.push(candidateFromPost(post))
      if (posts.length >= remaining) break
    }
    cursor = incrementalScan ? pageNewest : pageOldest
    lastPostId = pagePosts.at(-1)?.ID ?? lastPostId
    const checkpointPayload = checkpoint(saved, {
      cursor,
      newestCursor,
      lastPageCursor: cursor,
      lastPostId,
      pagesScanned: (saved.pagesScanned || 0) + pagesScanned,
      totalPostsScanned: (saved.totalPostsScanned || 0) + posts.length,
      uniqueWebsitesDiscovered: uniqueCandidates(posts).length,
      errors,
      stopReason: pagePosts.length ? 'in-progress' : 'empty-page'
    })
    await onBatch({
      posts: [...posts],
      pagePosts,
      checkpoint: checkpointPayload
    })
    await writeJson(checkpointFile, checkpointPayload)
    if (!pagePosts.length) break
    if (!cursor || cursor === saved.cursor) {
      stopReason = 'cursor-made-no-progress'
      break
    }
    if (posts.length < remaining) await sleep(delayMs)
  }
  if (posts.length >= remaining) stopReason = 'max-posts'
  const result = {
    posts,
    pagesScanned,
    stopReason,
    cursor,
    newestCursor,
    errors
  }
  await writeJson(
    checkpointFile,
    checkpoint(saved, {
      cursor,
      newestCursor,
      pagesScanned: (saved.pagesScanned || 0) + pagesScanned,
      totalPostsScanned: (saved.totalPostsScanned || 0) + posts.length,
      lastPostId,
      uniqueWebsitesDiscovered: uniqueCandidates(posts).length,
      errors,
      stopReason
    })
  )
  return result
}

const discoverTag = async () => {
  const posts = []
  let before = null
  let pagesScanned = 0
  let stopReason = 'empty-page'
  while (posts.length < maxPosts) {
    const url = new URL(`${TAG_API}/${encodeURIComponent(tag)}/posts/`)
    url.searchParams.set(
      'number',
      String(Math.min(batchSize, maxPosts - posts.length))
    )
    if (before) url.searchParams.set('before', before)
    try {
      const payload = await fetchJson(url)
      const pagePosts = Array.isArray(payload.posts) ? payload.posts : []
      pagesScanned += 1
      posts.push(
        ...pagePosts.map((post) => candidateFromPost(post, `Tag:${tag}`))
      )
      const dates = pagePosts
        .map((post) => post.date)
        .filter(Boolean)
        .sort()
      const next = dates[0]
      if (!pagePosts.length) break
      if (!next || next === before) {
        stopReason = 'cursor-made-no-progress'
        break
      }
      before = next
      if (posts.length < maxPosts) await sleep(delayMs)
    } catch (error) {
      stopReason = `request-failed: ${error.message}`
      break
    }
  }
  if (posts.length >= maxPosts) stopReason = 'max-posts'
  return {
    posts: posts.slice(0, maxPosts),
    pagesScanned,
    stopReason,
    errors: []
  }
}

export const uniqueCandidates = (candidates) => {
  const sites = new Map()
  for (const candidate of candidates) {
    const url = normalizeCandidateUrl(candidate.siteUrl)
    if (!url) continue
    const existing = sites.get(url)
    if (existing) {
      existing.sources = [
        ...new Set([
          ...(existing.sources || []),
          candidate.discoverySource || candidate.source
        ])
      ]
      existing.postCount += candidate.postUrl ? 1 : 0
      existing.postIds = [
        ...new Set([...existing.postIds, candidate.postId].filter(Boolean))
      ]
    } else {
      sites.set(url, {
        ...candidate,
        siteUrl: url,
        canonicalUrl: url,
        sources: [candidate.discoverySource || candidate.source],
        postCount: candidate.postUrl ? 1 : 0,
        postIds: candidate.postId ? [candidate.postId] : [],
        discoveryStatus: 'candidate'
      })
    }
  }
  return [...sites.values()]
}

const catalogueState = async () => {
  const entries = (
    await Promise.all(
      ['data/blogs.json', 'data/websites.json', 'data/communities.json'].map(
        async (path) => JSON.parse(await readFile(resolve(path), 'utf8'))
      )
    )
  ).flat()
  return {
    entries,
    listedUrls: new Set(
      entries.map(({ url }) => normalizeCandidateUrl(url)).filter(Boolean)
    )
  }
}

const reviewCandidates = async (candidates) => {
  // Network review is intentionally conservative: only metadata that is actually
  // returned by the site is recorded. Editorial approval is never inferred from a feed.
  const results = []
  for (const candidate of candidates) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(candidate.siteUrl, {
        redirect: 'follow',
        headers: { 'user-agent': userAgent },
        signal: controller.signal
      })
      const html = await response.text()
      results.push({
        ...candidate,
        finalUrl: normalizeCandidateUrl(response.url),
        httpStatus: response.status,
        hasContent: html.trim().length > 200,
        decision:
          response.ok && html.trim().length > 200 ? 'needs-review' : 'rejected',
        reason: response.ok
          ? 'Requires editorial review of content and taxonomy.'
          : `Homepage returned HTTP ${response.status}`
      })
    } catch (error) {
      results.push({
        ...candidate,
        decision: 'needs-review',
        reason: `Homepage could not be checked: ${error.message}`
      })
    } finally {
      clearTimeout(timer)
    }
    if (delayMs) await sleep(delayMs)
  }
  return results
}

const importApproved = async (approvedFile) => {
  if (!approvedFile) return { count: 0, urls: [] }
  const payload = await readJson(approvedFile, [])
  const approved = Array.isArray(payload)
    ? payload
    : payload.approved || payload.added || []
  const blogsPath = resolve('data/blogs.json')
  const blogs = JSON.parse(await readFile(blogsPath, 'utf8'))
  const { listedUrls } = await catalogueState()
  const urls = new Set(listedUrls)
  const now = new Date().toISOString()
  let count = 0
  const importedUrls = []
  for (const entry of approved) {
    const url = normalizeCandidateUrl(entry.url)
    if (
      !url ||
      !entry.name ||
      !entry.description ||
      !entry.category ||
      !entry.subcategory ||
      urls.has(url)
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
      addedDate: now.slice(0, 10),
      addedAt: now,
      country: entry.country || null,
      subcategory: entry.subcategory,
      clicks: 0,
      webringId: entry.webringId || `br-${randomBytes(16).toString('hex')}`
    })
    urls.add(url)
    importedUrls.push(url)
    count += 1
  }
  if (count) await writeFile(blogsPath, `${JSON.stringify(blogs, null, 2)}\n`)
  return { count, urls: importedUrls }
}

const main = async () => {
  const discovery = inputReportPath
    ? {
        posts: (await readJson(inputReportPath, {})).candidates || [],
        pagesScanned: 0,
        stopReason: `loaded-report: ${inputReportPath}`,
        errors: []
      }
    : source === 'latest'
      ? await discoverLatest()
      : await discoverTag()
  const supplied = await readSupplied()
  const candidates = uniqueCandidates([
    ...discovery.posts,
    ...supplied.map((url) => ({ source: 'supplied', siteUrl: url }))
  ])
  const { listedUrls } = await catalogueState()
  const previousPayload = (await readJson(trackingPath, {})) || {}
  const tracking = reconcileCandidateTracking({
    candidates,
    listedUrls,
    previous: previousPayload.records || previousPayload,
    now: new Date().toISOString()
  })
  await writeJson(trackingPath, {
    generatedAt: new Date().toISOString(),
    records: tracking
  })
  let reviewed = []
  if (mode === 'review' || mode === 'pipeline')
    reviewed = await reviewCandidates(
      candidates
        .filter((candidate) => tracking[candidate.siteUrl]?.decision === 'new')
        .slice(0, maxPosts)
    )
  for (const entry of reviewed) {
    const record = tracking[entry.siteUrl]
    if (!record) continue
    record.decision = entry.decision
    record.reason = entry.reason
    record.lastCheckedAt = new Date().toISOString()
  }
  if (reviewed.length)
    await writeJson(trackingPath, {
      generatedAt: new Date().toISOString(),
      records: tracking
    })
  const imported =
    mode === 'import' || mode === 'pipeline'
      ? await importApproved(approvedPath)
      : { count: 0, urls: [] }
  for (const url of imported.urls) {
    if (!tracking[url]) continue
    tracking[url].decision = 'added'
    tracking[url].reason = 'Approved and imported into the BlogR catalogue.'
  }
  if (imported.count)
    await writeJson(trackingPath, {
      generatedAt: new Date().toISOString(),
      records: tracking
    })
  const summary = Object.values(tracking).reduce((result, entry) => {
    result[entry.decision] = (result[entry.decision] || 0) + 1
    return result
  }, {})
  const report = {
    generatedAt: new Date().toISOString(),
    source,
    api: source === 'latest' ? LATEST_API : null,
    maxPosts,
    batchSize,
    mode,
    pagesScanned: discovery.pagesScanned,
    stopReason: discovery.stopReason,
    errors: discovery.errors,
    postsScanned: discovery.posts.length,
    uniqueWebsitesDiscovered: candidates.length,
    previouslyListed: candidates.filter(({ siteUrl }) =>
      listedUrls.has(siteUrl)
    ).length,
    newlyReviewed: reviewed.length,
    added: imported.count,
    rejected: reviewed.filter(({ decision }) => decision === 'rejected').length,
    needsReview: reviewed.filter(({ decision }) => decision === 'needs-review')
      .length,
    trackingSummary: summary,
    checkpointPath,
    candidates: mode === 'review' || mode === 'pipeline' ? reviewed : candidates
  }
  await writeJson(reportPath, report)
  console.log(
    `WordPress Discover: ${report.postsScanned} posts, ${report.uniqueWebsitesDiscovered} unique websites, ${report.pagesScanned} API page(s).`
  )
  console.log(
    `Stopped: ${report.stopReason}. Checkpoint: ${resolve(checkpointPath)}`
  )
  console.log(`Report: ${resolve(reportPath)}`)
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main()
