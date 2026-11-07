import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeCandidateUrl,
  reconcileCandidateTracking
} from './wordpress-candidate-tracking.js'

test('normalizes WordPress aliases and harmless URL variations', () => {
  assert.equal(
    normalizeCandidateUrl('http://WWW.Example.com/blog/?utm_source=x#top'),
    'https://example.com/blog'
  )
})

test('reconciliation is idempotent and preserves decisions', () => {
  const candidate = {
    siteUrl: 'https://example.com/',
    sources: ['wordpress-discover'],
    postCount: 2
  }
  const first = reconcileCandidateTracking({
    candidates: [candidate],
    listedUrls: new Set(),
    now: '2026-11-07T10:00:00.000Z'
  })
  first['https://example.com/'].decision = 'needs-review'
  first['https://example.com/'].reason = 'Needs editorial review.'
  const second = reconcileCandidateTracking({
    candidates: [candidate],
    listedUrls: new Set(),
    previous: first,
    now: '2026-11-07T11:00:00.000Z'
  })
  assert.equal(Object.keys(second).length, 1)
  assert.equal(second['https://example.com/'].decision, 'needs-review')
  assert.equal(
    second['https://example.com/'].firstSeenAt,
    '2026-11-07T10:00:00.000Z'
  )
  assert.equal(
    second['https://example.com/'].lastSeenAt,
    '2026-11-07T11:00:00.000Z'
  )
})

test('listed catalogues take precedence over stale new decisions', () => {
  const result = reconcileCandidateTracking({
    candidates: [{ siteUrl: 'https://example.com/' }],
    listedUrls: new Set(['https://example.com/']),
    previous: {
      'https://example.com/': {
        decision: 'new',
        firstSeenAt: '2026-11-06T00:00:00.000Z'
      }
    },
    now: '2026-11-07T00:00:00.000Z'
  })
  assert.equal(result['https://example.com/'].decision, 'already-listed')
})
