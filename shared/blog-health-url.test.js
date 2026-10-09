import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBlogHealthUrl } from './blog-health-url.js'

test('normalizes status URLs consistently', () => {
  assert.equal(
    normalizeBlogHealthUrl('HTTPS://Example.COM:443/blog/#top').toString(),
    'https://example.com/blog/'
  )
})
