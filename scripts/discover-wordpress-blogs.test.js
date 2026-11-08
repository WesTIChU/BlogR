import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  candidateFromPost,
  discoverLatest,
  uniqueCandidates
} from './discover-wordpress-blogs.js'

test('extracts the originating custom domain, not the article URL', () => {
  const candidate = candidateFromPost({
    ID: 42,
    site_ID: 7,
    URL: 'https://example.wordpress.com/2026/post/',
    site_URL: 'http://custom.example/blog/',
    site_name: 'Example'
  })
  assert.equal(candidate.siteUrl, 'https://custom.example/blog')
  assert.notEqual(candidate.siteUrl, candidate.postUrl)
})

test('deduplicates a website appearing in multiple Latest posts', () => {
  const candidates = uniqueCandidates([
    {
      siteUrl: 'http://example.com/',
      postUrl: 'https://example.com/a',
      postId: 1
    },
    {
      siteUrl: 'https://www.example.com',
      postUrl: 'https://example.com/b',
      postId: 2
    }
  ])
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].postCount, 2)
  assert.deepEqual(candidates[0].postIds, [1, 2])
})

test('writes a resumable checkpoint after each page', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blogr-wordpress-'))
  const checkpointFile = join(directory, 'checkpoint.json')
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (url) => {
    calls += 1
    const posts =
      calls === 1
        ? [
            {
              ID: 1,
              site_ID: 1,
              URL: 'https://one.example/post',
              site_URL: 'https://one.example',
              date: '2026-01-02T00:00:00Z'
            }
          ]
        : [
            {
              ID: 2,
              site_ID: 2,
              URL: 'https://two.example/post',
              site_URL: 'https://two.example',
              date: '2026-01-01T00:00:00Z'
            }
          ]
    return {
      ok: true,
      json: async () => ({
        posts,
        date_range: { oldest: posts[0].date, newest: posts[0].date }
      })
    }
  }
  try {
    const result = await discoverLatest({
      limit: 2,
      batch: 1,
      delay: 0,
      checkpointFile
    })
    assert.equal(result.posts.length, 2)
    const checkpoint = JSON.parse(await readFile(checkpointFile, 'utf8'))
    assert.equal(checkpoint.totalPostsScanned, 2)
    assert.equal(checkpoint.lastPostId, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})
