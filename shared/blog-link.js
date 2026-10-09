const INTERNAL_HOSTNAMES = new Set(['blogr.directory', 'www.blogr.directory'])
const BLOGR_ORIGIN = 'https://blogr.directory'

export function isExternalBlogUrl(value) {
  try {
    const url = new globalThis.URL(value, BLOGR_ORIGIN)
    return !INTERNAL_HOSTNAMES.has(url.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function getBlogLinkAttributes(value) {
  return isExternalBlogUrl(value)
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {}
}
