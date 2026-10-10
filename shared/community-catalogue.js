import { normalizeBlogHealthUrl } from './blog-health-url.js'

export function normalizeCommunityCatalogue(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('Community catalogue must be an array')
  }

  const ids = new Set()
  const urls = new Set()
  return entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid community entry: expected an object')
    }
    if (typeof entry.id !== 'string' || !entry.id.trim()) {
      throw new Error(`Invalid community id for ${entry.name || 'entry'}`)
    }
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate community id "${entry.id}"`)
    }
    if (typeof entry.name !== 'string' || !entry.name.trim()) {
      throw new Error(`Invalid community name for ${entry.id}`)
    }

    let url
    try {
      url = normalizeBlogHealthUrl(entry.url).toString()
    } catch (error) {
      throw new Error(
        `Invalid community URL for ${entry.name}: ${error.message}`,
        { cause: error }
      )
    }
    if (urls.has(url)) {
      throw new Error(`Duplicate community URL "${url}"`)
    }
    ids.add(entry.id)
    urls.add(url)
    return { ...entry, url }
  })
}

export function validateCommunityStatusCoverage(catalogue, statuses) {
  const expectedUrls = new Set(catalogue.map(({ url }) => url))
  if (!Array.isArray(statuses) || statuses.length !== expectedUrls.size) {
    throw new Error('Community status data does not cover the catalogue')
  }
  const seenUrls = new Set()
  for (const entry of statuses) {
    if (!expectedUrls.has(entry.url) || seenUrls.has(entry.url)) {
      throw new Error('Community status URL coverage is invalid')
    }
    seenUrls.add(entry.url)
  }
}
