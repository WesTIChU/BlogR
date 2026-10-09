export const normalizeBlogUpdateUrl = (value) => {
  const url = new globalThis.URL(value)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Invalid URL')
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = ''
  }
  return url.toString()
}

export const formatRelativeDate = (value, now = new Date()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date > now) return null
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )
  const elapsedDays = Math.floor((today - date.getTime()) / 86_400_000)
  if (elapsedDays <= 0) return 'today'
  if (elapsedDays === 1) return 'yesterday'
  if (elapsedDays < 30) return `${elapsedDays} days ago`
  if (elapsedDays < 365) {
    const months = Math.floor(elapsedDays / 30)
    return `${months} ${months === 1 ? 'month' : 'months'} ago`
  }
  const years = Math.floor(elapsedDays / 365)
  return `${years} ${years === 1 ? 'year' : 'years'} ago`
}

export const getBlogUpdate = (updates, url) => {
  try {
    return updates[normalizeBlogUpdateUrl(url)] ?? null
  } catch {
    return null
  }
}

export const getVerifiedFeedUrl = (updates, url) => {
  const update = getBlogUpdate(updates, url)
  if (update?.status !== 'success' || typeof update.feedUrl !== 'string') {
    return null
  }

  try {
    const feedUrl = new globalThis.URL(update.feedUrl)
    if (!['http:', 'https:'].includes(feedUrl.protocol)) return null
    return feedUrl.toString()
  } catch {
    return null
  }
}
