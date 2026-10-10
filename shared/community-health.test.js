/* global URL */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { getPublicStatus } from './blog-health-status.js'
import { formatRelativeDate } from './blog-update.js'
import { classifyCommunityResponse } from './community-health.js'
import { formatAddedDate } from './recently-added.js'

const response = (overrides = {}) => ({
  status: 200,
  redirected: false,
  headers: {},
  body: '',
  ...overrides
})

test('classifies successful and redirected community responses as online', () => {
  assert.deepEqual(classifyCommunityResponse(response()), {
    status: 'Healthy',
    failureKind: null
  })
  assert.deepEqual(
    classifyCommunityResponse(response({ status: 302, redirected: true })),
    { status: 'Redirected', failureKind: null }
  )
})

test('classifies bot protection and connection failures appropriately', () => {
  assert.equal(
    classifyCommunityResponse(response({ status: 429 })).failureKind,
    'protected'
  )
  assert.equal(
    classifyCommunityResponse(
      response({ status: 403, body: 'Checking your browser' })
    ).status,
    'Restricted or bot-blocked'
  )
  assert.equal(
    classifyCommunityResponse(response({ status: 503 })).failureKind,
    'timeout'
  )
  assert.equal(
    classifyCommunityResponse(response({ status: 404 })).failureKind,
    'not-found'
  )
})

test('missing or stale public community data is unknown', () => {
  const now = new Date('2026-10-10T12:00:00.000Z')
  assert.equal(getPublicStatus(null, now).status, 'unknown')
  assert.equal(
    getPublicStatus(
      { status: 'online', checkedAt: '2026-10-06T12:00:00.000Z' },
      now
    ).status,
    'unknown'
  )
})

test('community metadata reuses blog date formatting and row behavior', async () => {
  assert.equal(formatAddedDate('2026-10-09'), '9 October 2026')
  assert.equal(formatAddedDate(null), null)
  assert.equal(
    formatRelativeDate('2026-10-09', new Date('2026-10-10T12:00:00.000Z')),
    'yesterday'
  )

  const component = await readFile(
    new URL(
      '../docs/.vitepress/components/BlogLastUpdated.vue',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(component, /v-show="showBlogDetails"/)
  assert.match(component, /props\.community \? communities : blogs/)
  assert.match(component, /class="blog-favourite"/)
  assert.match(component, /class="blog-health-dot"/)
  assert.match(component, /Last checked/)
  assert.match(component, /class="blog-metadata-separator"/)
  assert.match(component, /community \? null : getVerifiedFeedUrl/)
})
