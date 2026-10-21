import { isValidWebringId } from '../../../shared/webring.js'

/* global Response, URL */

const WINDOW_MS = 60 * 60 * 1_000
const IP_LIMIT = 6
const REQUEST_COOLDOWN_MINUTES = 15
const rateBuckets = new Map()

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  })

const allowIp = (request) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const now = Date.now()
  if (rateBuckets.size > 10_000) {
    for (const [key, bucket] of rateBuckets)
      if (bucket.expires <= now) rateBuckets.delete(key)
    if (rateBuckets.size > 10_000)
      rateBuckets.delete(rateBuckets.keys().next().value)
  }
  const current = rateBuckets.get(ip)
  if (!current || current.expires <= now) {
    rateBuckets.set(ip, { count: 1, expires: now + WINDOW_MS })
    return true
  }
  current.count += 1
  return current.count <= IP_LIMIT
}

export async function onRequestPost({ request, env }) {
  if (env.WEBRING_PUBLIC_ENABLED !== 'true')
    return json({ error: 'Not found' }, 404)
  if (!env.OUTBOUND_CLICKS)
    return json({ error: 'Webring service unavailable' }, 503)
  if (!allowIp(request)) return json({ error: 'Too many requests' }, 429)

  const id = new URL(request.url).searchParams.get('id')
  if (!isValidWebringId(id))
    return json({ error: 'Invalid membership ID' }, 400)

  const row = await env.OUTBOUND_CLICKS.prepare(
    `SELECT verification_requested_at FROM webring_members
      WHERE webring_id = ? AND membership_status = 'active'`
  )
    .bind(id)
    .first()
  if (!row) return json({ error: 'Membership is not active' }, 404)

  const requestedAt = Date.parse(row.verification_requested_at ?? '')
  if (
    Number.isFinite(requestedAt) &&
    requestedAt > Date.now() - 15 * 60 * 1_000
  )
    return json({ queued: true, alreadyQueued: true }, 202)

  const result = await env.OUTBOUND_CLICKS.prepare(
    `UPDATE webring_members
        SET verification_requested_at = datetime('now')
      WHERE webring_id = ?
        AND membership_status = 'active'
        AND (verification_requested_at IS NULL OR
             julianday(verification_requested_at) <= julianday('now', '-${REQUEST_COOLDOWN_MINUTES} minutes'))`
  )
    .bind(id)
    .run()

  return json({ queued: result.meta?.changes === 1 }, 202)
}
