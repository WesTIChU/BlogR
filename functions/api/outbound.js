import { canonicalBlogUrl } from '../../shared/blog-duplicate.js'
import { blogs } from '../../shared/blogr-function-data.js'
import { communities, websites } from '../../shared/cloudflare-function-data.js'

/* global Response, URL */

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 60
const rateBuckets = new Map()
const listedUrls = new Map(
  [...blogs, ...websites, ...communities].map((entry) => [
    canonicalBlogUrl(entry.url),
    entry.url
  ])
)

const redirect = (url, status = 302) =>
  new Response(null, {
    status,
    headers: {
      Location: url,
      'cache-control': 'no-store'
    }
  })

const error = (message, status) =>
  new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store'
    }
  })

const allowRequest = (env) => {
  if (env.OUTBOUND_RATE_LIMIT)
    return env.OUTBOUND_RATE_LIMIT.limit({ key: 'outbound-clicks' })
  const now = Date.now()
  const bucket = rateBuckets.get('global')
  if (!bucket || bucket.expires <= now) {
    rateBuckets.set('global', { count: 1, expires: now + RATE_WINDOW_MS })
    return { success: true }
  }
  bucket.count += 1
  return { success: bucket.count <= RATE_LIMIT }
}

export async function onRequestGet({ request, env }) {
  const rawUrl = new URL(request.url).searchParams.get('url')
  let destination
  try {
    destination = canonicalBlogUrl(rawUrl)
  } catch {
    return error('Invalid outbound URL', 400)
  }

  const listedDestination = listedUrls.get(destination)
  if (!listedDestination) return error('Outbound URL is not listed', 404)

  try {
    const allowed = await allowRequest(env)
    if (!allowed.success)
      return error('Outbound tracking is temporarily rate limited', 429)
  } catch {
    return redirect(listedDestination)
  }

  if (env.OUTBOUND_CLICKS) {
    try {
      await env.OUTBOUND_CLICKS.prepare(
        `INSERT INTO outbound_clicks (site_key, total_clicks, updated_at)
         VALUES (?, 1, ?)
         ON CONFLICT(site_key) DO UPDATE SET
           total_clicks = outbound_clicks.total_clicks + 1,
           updated_at = excluded.updated_at`
      )
        .bind(destination, new Date().toISOString())
        .run()
    } catch {
      // Tracking must never prevent a visitor reaching a listed website.
    }
  }

  return redirect(listedDestination)
}
