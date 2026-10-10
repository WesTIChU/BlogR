/* global URL */

export const comparableBlogUrl = (value) => {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported')
  }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = ''
  }
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
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
