import { blogs } from '../../../shared/blogr-function-data.js'
import {
  communities,
  websites
} from '../../../shared/cloudflare-function-data.js'

/* global Response */

const names = new Map(
  [...blogs, ...websites, ...communities].map((entry) => [
    entry.webringId,
    entry.name
  ])
)

export async function onRequestGet({ env }) {
  if (env.WEBRING_PUBLIC_ENABLED !== 'true')
    return new Response('Not found', { status: 404 })
  const result = await env.OUTBOUND_CLICKS.prepare(
    `SELECT webring_id, canonical_url FROM webring_members
     WHERE verification_status = 'active' AND membership_status = 'active' ORDER BY canonical_url`
  ).all()
  return new Response(
    JSON.stringify(
      (result.results ?? []).map((member) => ({
        ...member,
        name: names.get(member.webring_id) ?? member.canonical_url
      }))
    ),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300'
      }
    }
  )
}
