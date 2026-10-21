import { canonicalBlogUrl } from './blog-duplicate.js'

export const WEBRING_WIDGET_VERSION = '1'
export const WEBRING_WIDGET_IMAGE_URLS = {
  blog: 'https://blogr.directory/images/web-ring-images/blog-orange.png',
  globe: 'https://blogr.directory/images/web-ring-images/globe-orange.png'
}
export const WEBRING_WIDGET_PREVIEW_IMAGE_URLS = {
  blog: '/images/web-ring-images/blog-orange.png',
  globe: '/images/web-ring-images/globe-orange.png'
}
export const WEBRING_INSTALL_PATHS = [
  '/',
  '/blog',
  '/links',
  '/website',
  '/webring'
]

export const WEBRING_BASIC_THEMES = {
  plain: { previous: '', random: '', next: '' },
  classic: { previous: '⬅️ ', random: '🎲 ', next: ' ➡️' },
  christmas: { previous: '🎄 ', random: '🎁 ', next: ' 🎅' },
  halloween: { previous: '🎃 ', random: '👻 ', next: ' 🦇' },
  zombie: { previous: '🧟 ', random: '🧠 ', next: ' 🪦' },
  gaming: { previous: '🎮 ', random: '🕹️ ', next: ' 👾' },
  autumn: { previous: '🍂 ', random: '🍁 ', next: ' 🌰' },
  nature: { previous: '🌿 ', random: '🌻 ', next: ' 🦋' },
  space: { previous: '🚀 ', random: '🪐 ', next: ' 🌌' },
  cats: { previous: '🐈 ', random: '🐾 ', next: ' 🐈‍⬛' },
  retro: { previous: '💾 ', random: '💿 ', next: ' 🖥️' }
}

export const webringBasicLabels = (theme = 'plain') => {
  const emojis = WEBRING_BASIC_THEMES[theme] ?? WEBRING_BASIC_THEMES.plain
  return {
    previous: `${emojis.previous}Previous`,
    random: `${emojis.random}Random`,
    next: `Next${emojis.next}`
  }
}

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
  return `<nav aria-label="BlogR Webring"><a href="${safeBase}/api/webring/previous?id=${safeId}" aria-label="Previous">Previous</a> · <a href="${safeBase}/api/webring/random?id=${safeId}" aria-label="Random">Random</a> · <a href="${safeBase}/api/webring/next?id=${safeId}" aria-label="Next">Next</a></nav>`
}

const widgetLinksHtml = (id, baseUrl, labels) => {
  const safeId = escapeHtml(id)
  const safeBase = escapeHtml(baseUrl.replace(/\/$/, ''))
  return `<nav aria-label="BlogR Webring"><a href="${safeBase}/api/webring/previous?id=${safeId}" aria-label="Previous">${labels.previous}</a> · <a href="${safeBase}/api/webring/random?id=${safeId}" aria-label="Random">${labels.random}</a> · <a href="${safeBase}/api/webring/next?id=${safeId}" aria-label="Next">${labels.next}</a></nav>`
}

export const widgetHtmlForDesign = (
  id,
  design = 'basic-plain',
  baseUrl = 'https://blogr.directory'
) => {
  if (design.startsWith('basic-')) {
    const theme = design.slice('basic-'.length)
    return widgetLinksHtml(
      id,
      baseUrl,
      webringBasicLabels(theme === 'emoji' ? 'classic' : theme)
    )
  }
  if (design === 'image-blog' || design === 'image-globe') {
    const image =
      design === 'image-blog'
        ? WEBRING_WIDGET_IMAGE_URLS.blog
        : WEBRING_WIDGET_IMAGE_URLS.globe
    const safeImage = escapeHtml(image)
    const links = widgetLinksHtml(id, baseUrl, {
      previous: 'Previous',
      random: 'Random',
      next: 'Next'
    })
    return `<div class="blogr-webring-widget" aria-label="BlogR Webring"><img src="${safeImage}" alt="BlogR Webring" width="220" height="88" style="display:block;max-width:100%;height:auto">${links}</div>`
  }
  return widgetHtml(id, baseUrl)
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
