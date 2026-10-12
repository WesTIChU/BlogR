/* global setImmediate */

import assert from 'node:assert/strict'
import test from 'node:test'
import { enhanceBlogDetails } from './blog-details-enhancer.js'
import { loadBlogUpdates } from './blog-update-client.js'

const makeElement = () => {
  const dot = { style: {}, setAttribute() {} }
  const screenReader = { textContent: '' }
  const updateSlot = {
    children: [],
    replaceChildren(...children) {
      this.children = children
    },
    append(child) {
      this.children.push(child)
    }
  }
  const feedSlot = {
    children: [],
    replaceChildren(...children) {
      this.children = children
    },
    append(child) {
      this.children.push(child)
    }
  }
  const updateSeparator = { hidden: true }
  const addedSeparator = { hidden: true }
  return {
    dot,
    screenReader,
    updateSlot,
    feedSlot,
    updateSeparator,
    addedSeparator,
    hasAttribute: () => false,
    getAttribute: (attribute) =>
      ({
        'data-blog-url': 'https://example.com/',
        'data-blog-name': 'Example Blog'
      })[attribute],
    querySelector(selector) {
      return {
        '.blog-health-dot': dot,
        '.blog-health-sr-only': screenReader,
        '[data-blog-feed-slot]': feedSlot,
        '[data-blog-update-slot]': updateSlot,
        '[data-blog-update-separator]': updateSeparator,
        '[data-blog-added-separator]': addedSeparator,
        '.blog-health-link a': { textContent: 'Example Blog' }
      }[selector]
    }
  }
}

test('enhances static rows once and reapplies metadata after SPA navigation', async () => {
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  let requests = 0
  let current = makeElement()
  globalThis.document = {
    querySelectorAll: () => [current],
    querySelector: (selector) =>
      selector === '[data-blog-details][data-blog-community]' ? null : current,
    createElement: () => ({
      setAttribute() {},
      append() {}
    })
  }
  globalThis.fetch = async (path) => {
    requests += 1
    if (path === '/blog-updates.json') {
      return {
        ok: true,
        json: async () => ({
          'https://example.com/': {
            status: 'success',
            lastPublished: '2026-10-12',
            feedUrl: 'https://example.com/feed.xml'
          }
        })
      }
    }
    return { ok: true, json: async () => [] }
  }

  try {
    enhanceBlogDetails()
    enhanceBlogDetails()
    await loadBlogUpdates()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(requests, 2)
    assert.equal(current.feedSlot.children.length, 1)
    assert.equal(current.updateSlot.children.length, 1)
    assert.equal(current.updateSeparator.hidden, false)
    assert.equal(current.addedSeparator.hidden, false)

    current = makeElement()
    enhanceBlogDetails()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(requests, 2)
    assert.equal(current.feedSlot.children.length, 1)
    assert.equal(current.updateSlot.children.length, 1)
  } finally {
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})
