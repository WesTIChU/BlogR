import { comparableBlogUrl } from './new-blog-entries.js'

const VITE_SHOW_CLICK_COUNTS =
  typeof import.meta.env === 'object'
    ? import.meta.env.VITE_SHOW_CLICK_COUNTS
    : undefined

export const SHOW_CLICK_COUNTS = VITE_SHOW_CLICK_COUNTS === 'true'
export const OUTBOUND_CLICK_ENDPOINT = '/api/outbound'

export const canonicalOutboundUrl = (value) => comparableBlogUrl(value)

export const outboundTrackingUrl = (value) =>
  `${OUTBOUND_CLICK_ENDPOINT}?url=${encodeURIComponent(canonicalOutboundUrl(value))}`

export const catalogueByCanonicalUrl = (entries) => {
  const catalogue = new Map()
  for (const entry of entries) {
    catalogue.set(canonicalOutboundUrl(entry.url), entry)
  }
  return catalogue
}
