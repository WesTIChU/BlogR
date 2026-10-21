import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyClickCounts,
  DEFAULT_CLICK_COUNT_PATHS,
  fetchClickCounts
} from './sync-click-counts.js'

test('applies one D1 total to duplicate catalogue listings', () => {
  const entries = [
    { name: 'Blog', url: 'http://Example.test/' },
    { name: 'Website', url: 'https://example.test' },
    { name: 'Other', url: 'https://other.test/' }
  ]
  const result = applyClickCounts(
    entries,
    new Map([
      ['https://example.test/', 12],
      ['https://other.test/', 0]
    ])
  )
  assert.deepEqual(
    result.map(({ clicks }) => clicks),
    [12, 12, 0]
  )
})

test('synchronizes all three catalogues', () => {
  assert.deepEqual(DEFAULT_CLICK_COUNT_PATHS, [
    'data/blogs.json',
    'data/websites.json',
    'data/communities.json'
  ])
  const result = applyClickCounts(
    [{ id: 'forum', url: 'https://forums.example/' }],
    new Map([['https://forums.example/', 7]])
  )
  assert.equal(result[0].clicks, 7)
})

test('rejects unsuccessful D1 responses', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ success: false, result: [] }), {
      status: 200
    })
  await assert.rejects(
    fetchClickCounts({
      token: 'token',
      accountId: 'account',
      databaseId: 'database'
    }),
    /Unable to retrieve D1/
  )
  globalThis.fetch = originalFetch
})
