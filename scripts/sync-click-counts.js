import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { canonicalOutboundUrl } from '../shared/outbound-click.js'
import { generateFunctionData } from './generate-function-data.js'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export const DEFAULT_CLICK_COUNT_PATHS = [
  'data/blogs.json',
  'data/websites.json',
  'data/communities.json'
]

export async function fetchClickCounts({ token, accountId, databaseId }) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sql: 'SELECT site_key, total_clicks FROM outbound_clicks'
      })
    }
  )
  const body = await response.json()
  if (!response.ok || body.success !== true || !Array.isArray(body.result)) {
    throw new Error('Unable to retrieve D1 outbound click counts')
  }
  const rows = body.result.flatMap((result) => result.results ?? [])
  return new Map(
    rows.map((row) => [
      canonicalOutboundUrl(row.site_key),
      Number(row.total_clicks)
    ])
  )
}

export function applyClickCounts(entries, counts) {
  return entries.map((entry) => {
    const count = counts.get(canonicalOutboundUrl(entry.url))
    return Number.isSafeInteger(count) && count >= 0
      ? { ...entry, clicks: count }
      : entry
  })
}

export async function syncClickCounts({
  counts,
  paths = DEFAULT_CLICK_COUNT_PATHS
}) {
  for (const path of paths) {
    const entries = JSON.parse(await readFile(resolve(path), 'utf8'))
    const updated = applyClickCounts(entries, counts)
    await writeFile(resolve(path), `${JSON.stringify(updated, null, 2)}\n`)
  }
  await generateFunctionData()
}

if (process.argv[1]?.endsWith('/scripts/sync-click-counts.js')) {
  const counts = await fetchClickCounts({
    token: required('CLOUDFLARE_API_TOKEN'),
    accountId: required('CLOUDFLARE_ACCOUNT_ID'),
    databaseId: required('CLOUDFLARE_D1_DATABASE_ID')
  })
  await syncClickCounts({ counts })
}
