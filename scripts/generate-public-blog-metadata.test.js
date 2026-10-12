import assert from 'node:assert/strict'
import test from 'node:test'
import { compactBlogUpdates } from './generate-public-blog-metadata.js'

test('publishes only browser metadata and normalizes keys deterministically', () => {
  const compact = compactBlogUpdates({
    'HTTPS://Example.com:443/': {
      status: 'success',
      lastPublished: '2026-10-12',
      lastChecked: '2026-10-12T12:00:00.000Z',
      feedUrl: 'https://example.com/feed.xml',
      latestArticle: {
        title: 'Latest',
        url: 'https://example.com/latest',
        summary: 'Summary',
        publishedAt: '2026-10-12T08:00:00.000Z',
        ignored: 'field'
      },
      error: { message: 'ignored' }
    },
    'not-a-url': { status: 'success' }
  })

  assert.deepEqual(compact, {
    'https://example.com/': {
      status: 'success',
      lastPublished: '2026-10-12',
      feedUrl: 'https://example.com/feed.xml',
      latestArticle: {
        title: 'Latest',
        url: 'https://example.com/latest',
        summary: 'Summary',
        publishedAt: '2026-10-12T08:00:00.000Z'
      }
    }
  })
})

test('handles missing update records without inventing metadata', () => {
  assert.deepEqual(
    compactBlogUpdates({
      'https://empty.example/': null,
      'https://failed.example/': { status: 'unavailable' }
    }),
    { 'https://failed.example/': { status: 'unavailable' } }
  )
})
