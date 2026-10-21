import { isValidWebringId } from '../../../shared/webring.js'

/* global Response, URL */

const rateBuckets = new Map()
const WINDOW_MS = 60_000
const LIMIT = 30
const actions = new Set(['previous', 'random', 'next'])

const response = (body, status = 200, headers = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      ...(body === null
        ? {}
        : { 'content-type': 'application/json; charset=utf-8' }),
      ...headers
    }
  })

const redirect = (url) =>
  new Response(null, {
    status: 302,
    headers: { Location: url, 'cache-control': 'no-store' }
  })

const allowRequest = (request, env) => {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (env.WEBRING_RATE_LIMIT) return env.WEBRING_RATE_LIMIT.limit({ key: ip })
  const now = Date.now()
  const current = rateBuckets.get(ip)
  if (!current || current.expires <= now) {
    rateBuckets.set(ip, { count: 1, expires: now + WINDOW_MS })
    return true
  }
  current.count += 1
  return current.count <= LIMIT
}

const recordClick = async (env, member, destination, action, source) => {
  if (!env.OUTBOUND_CLICKS) return
  const minute = Math.floor(Date.now() / 60_000)
  const eventKey = `${member.webring_id}:${action}:${minute}`
  try {
    await env.OUTBOUND_CLICKS.prepare(
      `INSERT OR IGNORE INTO webring_clicks
       (webring_id, destination_url, navigation_type, referring_webring_id, event_key, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(member.webring_id, destination, action, source || null, eventKey)
      .run()
  } catch {
    // Navigation must still work when analytics is temporarily unavailable.
  }
}

export async function onRequestGet({ request, env, params }) {
  if (env.WEBRING_PUBLIC_ENABLED !== 'true')
    return response({ error: 'Not found' }, 404)
  const action = params.action
  if (!actions.has(action)) return response({ error: 'Not found' }, 404)
  const allowed = await allowRequest(request, env)
  if (allowed?.success === false || allowed === false)
    return response({ error: 'Too many requests' }, 429)

  const query = new URL(request.url).searchParams
  const id = query.get('id')
  if (!isValidWebringId(id))
    return response({ error: 'Invalid membership ID' }, 400)
  const source = query.get('from')
  if (source && !isValidWebringId(source))
    return response({ error: 'Invalid referrer' }, 400)

  const current = await env.OUTBOUND_CLICKS.prepare(
    `SELECT webring_id, canonical_url FROM webring_members
      WHERE webring_id = ? AND verification_status = 'active' AND membership_status = 'active'`
  )
    .bind(id)
    .first()
  if (!current) return response({ error: 'Membership is not active' }, 404)

  const members = await env.OUTBOUND_CLICKS.prepare(
    `SELECT webring_id, canonical_url FROM webring_members
      WHERE verification_status = 'active' AND membership_status = 'active' ORDER BY webring_id`
  ).all()
  const active = members.results ?? []
  if (active.length < 2)
    return response(
      { error: 'The ring needs at least two active members' },
      503
    )
  const index = active.findIndex((member) => member.webring_id === id)
  if (index < 0) return response({ error: 'Membership is not active' }, 404)
  let target
  if (action === 'previous')
    target = active[(index - 1 + active.length) % active.length]
  else if (action === 'next') target = active[(index + 1) % active.length]
  else {
    const choices = active.filter((member) => member.webring_id !== id)
    target = choices[Math.floor(Math.random() * choices.length)]
  }
  await recordClick(env, target, target.canonical_url, action, source || id)
  return redirect(target.canonical_url)
}
