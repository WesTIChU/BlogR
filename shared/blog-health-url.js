/* global URL */

export function normalizeBlogHealthUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are supported')
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
  return url
}
