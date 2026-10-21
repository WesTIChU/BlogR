import { isValidWebringId } from '../../../shared/webring.js'

/* global Response, URL */

export async function onRequestGet({ request, env }) {
  if (env.WEBRING_PUBLIC_ENABLED !== 'true')
    return new Response('Not found', { status: 404 })
  const id = new URL(request.url).searchParams.get('id')
  if (!isValidWebringId(id)) return new Response('Invalid ID', { status: 400 })
  const row = await env.OUTBOUND_CLICKS.prepare(
    `SELECT verification_status FROM webring_members WHERE webring_id = ? AND membership_status = 'active'`
  )
    .bind(id)
    .first()
  return new Response(
    JSON.stringify({ verified: row?.verification_status === 'active' }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=300'
      }
    }
  )
}
