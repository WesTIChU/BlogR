/* global Response, URL, fetch */

import blogs from '../../data/blogs.json' with { type: 'json' }
import {
  canonicalBlogUrl,
  findListedBlog,
  hasPendingSubmission
} from '../../shared/blog-duplicate.js'
import { validateUrl } from './submit-blog-validation.js'

const cache = new Map()
const requestCounts = new Map()
const CACHE_TTL = 30_000
const RATE_WINDOW = 60_000
const RATE_LIMIT = 30

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, max-age=30'
    }
  })

const githubRequest = (env, path) =>
  fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'user-agent': 'BlogR-public-duplicate-check'
    }
  })

const getOpenSubmissionIssues = async (env) => {
  const issues = []
  for (let page = 1; page <= 10; page += 1) {
    const response = await githubRequest(
      env,
      `/repos/${env.GITHUB_REPOSITORY}/issues?state=open&labels=blog-submission&per_page=100&page=${page}`
    )
    if (!response.ok) throw new Error('Unable to inspect open submissions')
    const pageIssues = await response.json()
    if (!Array.isArray(pageIssues)) throw new Error('Invalid issues response')
    issues.push(...pageIssues)
    if (pageIssues.length < 100) return issues
  }
  throw new Error('Open submission list is too large to inspect safely')
}

export async function onRequestGet({ request, env }) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const now = Date.now()
  const recent = requestCounts.get(ip)
  if (recent && recent.expires > now) {
    if (recent.count >= RATE_LIMIT)
      return json(
        { error: 'Duplicate checking is temporarily unavailable.' },
        429
      )
    recent.count++
  } else {
    requestCounts.set(ip, { count: 1, expires: now + RATE_WINDOW })
  }
  const rawUrl = new URL(request.url).searchParams.get('url')
  let url
  try {
    url = validateUrl(rawUrl)
  } catch {
    return json({ error: 'Blog URL must be a valid HTTP(S) URL' }, 400)
  }

  const canonical = canonicalBlogUrl(url)
  const cached = cache.get(canonical)
  if (cached && cached.expires > Date.now()) return json(cached.result)

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY)
    return json(
      { error: 'Duplicate checking is temporarily unavailable.' },
      503
    )

  if (env.DUPLICATE_RATE_LIMIT) {
    try {
      const allowed = await env.DUPLICATE_RATE_LIMIT.limit({ key: ip })
      if (!allowed.success)
        return json(
          { error: 'Duplicate checking is temporarily unavailable.' },
          429
        )
    } catch {
      return json(
        { error: 'Duplicate checking is temporarily unavailable.' },
        503
      )
    }
  }

  let listed
  try {
    listed = findListedBlog(blogs, url)
  } catch {
    return json(
      { error: 'Duplicate checking is temporarily unavailable.' },
      503
    )
  }
  if (listed) {
    const result = { status: 'listed', name: listed.name }
    cache.set(canonical, { result, expires: Date.now() + CACHE_TTL })
    return json(result)
  }

  try {
    const issues = await getOpenSubmissionIssues(env)
    const result = hasPendingSubmission(issues, url)
      ? { status: 'pending' }
      : { status: 'available' }
    cache.set(canonical, { result, expires: Date.now() + CACHE_TTL })
    return json(result)
  } catch {
    return json(
      { error: 'Duplicate checking is temporarily unavailable.' },
      503
    )
  }
}
