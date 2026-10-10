import assert from 'node:assert/strict'
import test from 'node:test'
import {
  comparableBlogUrl,
  getNewBlogEntries,
  getUninitializedNewBlogEntries
} from './new-blog-entries.js'

test('detects multiple genuinely new blogs', () => {
  const current = [
    { name: 'Existing', url: 'https://example.com/' },
    { name: 'New one', url: 'https://new.example/blog/' },
    { name: 'New two', url: 'https://two.example/' }
  ]
  const previous = [{ name: 'Existing', url: 'https://EXAMPLE.com' }]

  assert.deepEqual(
    getNewBlogEntries(current, previous).map(({ name }) => name),
    ['New one', 'New two']
  )
})

test('treats equivalent trailing-slash URLs as existing', () => {
  assert.equal(
    comparableBlogUrl('HTTPS://Example.com:443/blog/#post'),
    'https://example.com/blog'
  )
  assert.deepEqual(
    getNewBlogEntries(
      [{ name: 'Same', url: 'https://example.com/blog/' }],
      [{ name: 'Existing', url: 'https://example.com/blog' }]
    ),
    []
  )
})

test('does not treat edits to existing entries as new blogs', () => {
  assert.deepEqual(
    getNewBlogEntries(
      [
        {
          name: 'Renamed description',
          url: 'https://example.com/',
          description: 'Updated'
        }
      ],
      [{ name: 'Original', url: 'https://example.com/', description: 'Old' }]
    ),
    []
  )
})

test('ignores invalid and duplicate current URLs', () => {
  const newBlogs = getNewBlogEntries(
    [
      { name: 'Invalid', url: 'not a URL' },
      { name: 'First', url: 'https://example.com/' },
      { name: 'Second spelling', url: 'https://example.com' }
    ],
    []
  )
  assert.deepEqual(
    newBlogs.map(({ name }) => name),
    ['First']
  )
})

test('skips initialized entries on a repeated workflow run', () => {
  assert.deepEqual(
    getUninitializedNewBlogEntries(
      [{ name: 'New', url: 'https://new.example/' }],
      [],
      ['https://NEW.example']
    ),
    []
  )
})

test('supports retrying only entries missing initial metadata', () => {
  const current = [
    { name: 'Initialized', url: 'https://ready.example/' },
    { name: 'Missing metadata', url: 'https://missing.example/' }
  ]
  assert.deepEqual(
    getUninitializedNewBlogEntries(current, [], ['https://ready.example']),
    [{ name: 'Missing metadata', url: 'https://missing.example/' }]
  )
})
