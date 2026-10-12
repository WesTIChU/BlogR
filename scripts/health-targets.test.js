import assert from 'node:assert/strict'
import test from 'node:test'
import { changedHealthUrls } from './health-targets.js'

test('selects only added and modified catalogue entries', () => {
  const previous = [
    { url: 'https://same.example/', description: 'unchanged' },
    { url: 'https://changed.example/', description: 'old' }
  ]
  const current = [
    { url: 'https://same.example/', description: 'unchanged' },
    { url: 'https://changed.example/', description: 'new' },
    { url: 'https://new.example/', description: 'new' }
  ]
  assert.deepEqual(changedHealthUrls(previous, current), [
    'https://changed.example/',
    'https://new.example/'
  ])
})

test('normalizes equivalent URLs before comparing entries', () => {
  assert.deepEqual(
    changedHealthUrls(
      [{ url: 'HTTPS://Example.com:443/' }],
      [{ url: 'https://example.com/' }]
    ),
    []
  )
})

test('selects changed blogs and communities independently', () => {
  const previousBlogs = [{ url: 'https://unchanged.example/' }]
  const currentBlogs = [
    { url: 'https://unchanged.example/' },
    { url: 'https://new-blog.example/' }
  ]
  const previousCommunities = [{ url: 'https://unchanged-community.example/' }]
  const currentCommunities = [
    { url: 'https://unchanged-community.example/' },
    { url: 'https://changed-community.example/', description: 'updated' }
  ]

  assert.deepEqual(changedHealthUrls(previousBlogs, currentBlogs), [
    'https://new-blog.example/'
  ])
  assert.deepEqual(changedHealthUrls(previousCommunities, currentCommunities), [
    'https://changed-community.example/'
  ])
})
