import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { canonicalWebringUrl } from '../shared/webring.js'

const paths = ['data/blogs.json', 'data/websites.json', 'data/communities.json']
const id = () => `br-${randomBytes(16).toString('hex')}`

export const assignWebringIds = (catalogues, registered = []) => {
  const byUrl = new Map(
    registered.map(({ canonical_url, webring_id }) => [
      canonical_url,
      webring_id
    ])
  )
  const byId = new Map(
    registered.map(({ canonical_url, webring_id }) => [
      webring_id,
      canonical_url
    ])
  )
  for (const catalogue of catalogues) {
    for (const entry of catalogue) {
      const key = canonicalWebringUrl(entry.url)
      if (entry.webringId) {
        if (byId.has(entry.webringId) && byId.get(entry.webringId) !== key)
          throw new Error(
            `Webring ID is assigned to different URLs: ${entry.webringId}`
          )
        if (byUrl.has(key) && byUrl.get(key) !== entry.webringId)
          throw new Error(
            `Restore ${key} with its original Webring ID ${byUrl.get(key)}`
          )
        byId.set(entry.webringId, key)
        byUrl.set(key, entry.webringId)
      }
    }
  }
  for (const catalogue of catalogues) {
    for (const entry of catalogue) {
      const key = canonicalWebringUrl(entry.url)
      if (!byUrl.has(key)) {
        let next
        do next = id()
        while (byId.has(next))
        byId.set(next, key)
        byUrl.set(key, next)
      }
      entry.webringId = byUrl.get(key)
    }
  }
  return catalogues
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  const entries = await Promise.all(
    paths.map(async (path) => ({
      path,
      entries: JSON.parse(await readFile(resolve(path), 'utf8'))
    }))
  )
  assignWebringIds(entries.map(({ entries: catalogue }) => catalogue))
  for (const { path, entries: catalogue } of entries)
    await writeFile(resolve(path), `${JSON.stringify(catalogue, null, 2)}\n`)
}
