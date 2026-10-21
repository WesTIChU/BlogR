import { canonicalBlogUrl } from './blog-duplicate.js'

export const WEBRING_WIDGET_VERSION = '1'
export const WEBRING_INSTALL_PATHS = [
  '/',
  '/blog',
  '/links',
  '/website',
  '/webring'
]

const env = typeof import.meta.env === 'object' ? import.meta.env : {}
export const SHOW_WEBRING = env.VITE_WEBRING_PUBLIC_ENABLED === 'true'

export const canonicalWebringUrl = (value) => canonicalBlogUrl(value)

export const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

export const createWebringId = () => {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues)
    globalThis.crypto.getRandomValues(bytes)
  else throw new Error('Secure randomness is required to create a webring ID')
  return `br-${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export const widgetHtml = (id, baseUrl = 'https://blogr.directory') => {
  const safeId = escapeHtml(id)
  const safeBase = escapeHtml(baseUrl.replace(/\/$/, ''))
  return `<nav aria-label="BlogR Webring"><a href="${safeBase}/api/webring/previous?id=${safeId}">Previous</a> · <a href="${safeBase}/api/webring/random?id=${safeId}">Random</a> · <a href="${safeBase}/api/webring/next?id=${safeId}">Next</a></nav>`
}

export const expectedWidgetLinks = (
  id,
  baseUrl = 'https://blogr.directory'
) => {
  const base = baseUrl.replace(/\/$/, '')
  return {
    previous: `${base}/api/webring/previous?id=${encodeURIComponent(id)}`,
    random: `${base}/api/webring/random?id=${encodeURIComponent(id)}`,
    next: `${base}/api/webring/next?id=${encodeURIComponent(id)}`
  }
}

export const isValidWebringId = (value) =>
  typeof value === 'string' && /^br-[a-f0-9]{32}$/.test(value)
