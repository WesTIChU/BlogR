/* global URL */

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'mc_cid',
  'mc_eid',
  'wbraid'
])

export const normalizeBlogSubmissionUrl = (value) => {
  if (typeof value !== 'string') throw new Error('Blog URL is missing')
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Blog URL is missing')
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('Blog URL must be a valid HTTP(S) URL')
  }
  const url = new URL(
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  )
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Blog URL must be a valid HTTP(S) URL')
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials are not supported')
  }
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

export const comparableBlogUrl = (value) => {
  const url = new URL(normalizeBlogSubmissionUrl(value))
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported')
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials are not supported')
  }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if (url.hostname.startsWith('www.')) url.hostname = url.hostname.slice(4)
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = ''
  }
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  url.protocol = 'https:'
  for (const key of [...url.searchParams.keys()]) {
    const normalizedKey = key.toLocaleLowerCase()
    if (
      normalizedKey.startsWith('utm_') ||
      TRACKING_QUERY_PARAMS.has(normalizedKey)
    ) {
      url.searchParams.delete(key)
    }
  }
  url.searchParams.sort()
  return url.toString()
}

export function getNewBlogEntries(currentBlogs, previousBlogs) {
  const previousUrls = new Set()
  for (const blog of previousBlogs) {
    try {
      previousUrls.add(comparableBlogUrl(blog.url))
    } catch {
      // Invalid previous entries cannot identify a current entry.
    }
  }

  const seenCurrentUrls = new Set()
  return currentBlogs.filter((blog) => {
    let url
    try {
      url = comparableBlogUrl(blog.url)
    } catch {
      return false
    }
    if (previousUrls.has(url) || seenCurrentUrls.has(url)) return false
    seenCurrentUrls.add(url)
    return true
  })
}

export function getUninitializedNewBlogEntries(
  currentBlogs,
  previousBlogs,
  initializedUrls = []
) {
  const initialized = new Set(
    initializedUrls.flatMap((url) => {
      try {
        return [comparableBlogUrl(url)]
      } catch {
        return []
      }
    })
  )
  return getNewBlogEntries(currentBlogs, previousBlogs).filter((blog) => {
    try {
      return !initialized.has(comparableBlogUrl(blog.url))
    } catch {
      return false
    }
  })
}
