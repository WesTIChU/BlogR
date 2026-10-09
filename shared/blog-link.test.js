import assert from 'node:assert/strict'
import test from 'node:test'
import { getBlogLinkAttributes, isExternalBlogUrl } from './blog-link.js'

test('external blog URLs open in a protected new tab', () => {
  assert.equal(isExternalBlogUrl('https://example.com/blog'), true)
  assert.deepEqual(getBlogLinkAttributes('https://example.com/blog'), {
    target: '_blank',
    rel: 'noopener noreferrer'
  })
})

test('BlogR URLs and relative links stay in the current tab', () => {
  for (const url of [
    '/about',
    'https://blogr.directory/about',
    'https://www.blogr.directory/blogs'
  ]) {
    assert.equal(isExternalBlogUrl(url), false)
    assert.deepEqual(getBlogLinkAttributes(url), {})
  }
})
