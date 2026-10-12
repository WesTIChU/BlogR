/* global document, fetch */

import {
  getPublicStatus,
  PUBLIC_STATUS_COLORS
} from '../../../shared/blog-health-status.js'
import {
  formatRelativeDate,
  getBlogUpdate,
  getVerifiedFeedUrl
} from '../../../shared/blog-update.js'
import { blogUpdates, loadBlogUpdates } from './blog-update-client.js'

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
      fetch(path, {
        cache: 'no-cache',
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
    const url = element.getAttribute('data-blog-url')
    const update = community ? null : getBlogUpdate(blogUpdates.value, url)
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

    if (!community) {
      const feedSlot = element.querySelector('[data-blog-feed-slot]')
      const updateSlot = element.querySelector('[data-blog-update-slot]')
      const updateSeparator = element.querySelector(
        '[data-blog-update-separator]'
      )
      const addedSeparator = element.querySelector(
        '[data-blog-added-separator]'
      )
      const feedUrl = getVerifiedFeedUrl(blogUpdates.value, url)
      const relativeUpdate =
        update?.status === 'success'
          ? formatRelativeDate(update.lastPublished)
          : null

      if (feedSlot) {
        feedSlot.replaceChildren()
        if (feedUrl) {
          const link = document.createElement('a')
          const name = element.getAttribute('data-blog-name') || 'blog'
          const label = `RSS feed for ${name}`
          link.className = 'blog-feed-link'
          link.href = feedUrl
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          link.title = label
          link.setAttribute('aria-label', label)
          link.innerHTML =
            '<svg class="blog-feed-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0-4 2 2 0 0 0 0 4Z"></path><path d="M4 4a16 16 0 0 1 16 16"></path><path d="M4 10a10 10 0 0 1 10 10"></path></svg>'
          feedSlot.append(link)
        }
      }

      if (updateSlot) {
        updateSlot.replaceChildren()
        if (relativeUpdate) {
          const label = document.createElement('span')
          label.textContent = `Last updated\u00a0${relativeUpdate}`
          label.title = `Last updated: ${update.lastPublished}`
          label.setAttribute('aria-label', label.title)
          updateSlot.append(label)
        }
      }
      if (updateSeparator) updateSeparator.hidden = !relativeUpdate
      if (addedSeparator) addedSeparator.hidden = !relativeUpdate
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
  if (hasBlogs) void loadBlogUpdates().then(updateBlogDetails)
}
