/* global document, fetch */

import {
  getPublicStatus,
  PUBLIC_STATUS_COLORS
} from '../../../shared/blog-health-status.js'

const requests = new Map()
const statusMaps = new Map()

const statusDetails = {
  online: { label: 'Online' },
  warning: { label: 'Needs review' },
  'repeatedly-unreachable': { label: 'Repeatedly unreachable' },
  unknown: { label: 'Unknown or stale' }
}

function loadStatuses(community) {
  const key = community ? 'community' : 'blog'
  if (!requests.has(key)) {
    const path = community
      ? '/community-health-status.json'
      : '/health-status.json'
    requests.set(
      key,
      fetch(`${path}?v=${Date.now()}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' }
      })
        .then((response) => (response.ok ? response.json() : []))
        .then((entries) => {
          const map = new Map(
            Array.isArray(entries)
              ? entries
                  .filter((entry) => entry && typeof entry.url === 'string')
                  .map((entry) => [entry.url, entry])
              : []
          )
          statusMaps.set(key, map)
          updateBlogDetails()
        })
        .catch(() => undefined)
    )
  }
  return requests.get(key)
}

function updateBlogDetails() {
  for (const element of document.querySelectorAll('[data-blog-details]')) {
    const community = element.hasAttribute('data-blog-community')
    const status = getPublicStatus(
      statusMaps
        .get(community ? 'community' : 'blog')
        ?.get(element.getAttribute('data-blog-url')),
      new Date()
    )
    const detail = statusDetails[status.status]
    const checked = status.checkedAt
      ? new Date(status.checkedAt).toISOString().slice(0, 10)
      : 'not available'
    const tooltip = `Health status: ${detail.label}. Last checked: ${checked}.`
    const dot = element.querySelector('.blog-health-dot')
    if (dot) {
      dot.style.backgroundColor = PUBLIC_STATUS_COLORS[status.status]
      dot.title = tooltip
      dot.setAttribute('aria-label', tooltip)
    }
    const screenReaderLabel = element.querySelector('.blog-health-sr-only')
    if (screenReaderLabel) screenReaderLabel.textContent = detail.label

    const relative = element.querySelector('[data-health-relative]')
    if (relative) {
      relative.textContent = status.checkedAt
        ? `Last checked\u00a0${status.checkedAt.slice(0, 10)}`
        : ''
      relative.setAttribute(
        'title',
        status.checkedAt ? `Last checked: ${status.checkedAt}` : ''
      )
    }
  }
}

export function enhanceBlogDetails() {
  if (typeof document === 'undefined') return
  updateBlogDetails()
  const hasBlogs = document.querySelector(
    '[data-blog-details]:not([data-blog-community])'
  )
  const hasCommunities = document.querySelector(
    '[data-blog-details][data-blog-community]'
  )
  if (hasBlogs) void loadStatuses(false)
  if (hasCommunities) void loadStatuses(true)
}
