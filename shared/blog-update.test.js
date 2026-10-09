import assert from 'node:assert/strict'
import test from 'node:test'
import { getVerifiedFeedUrl } from './blog-update.js'

test('returns verified RSS and Atom feed URLs for successful scans', () => {
  const updates = {
    'https://rss.example/': {
      status: 'success',
      feedUrl: 'https://rss.example/feed.xml'
    },
    'https://atom.example/': {
      status: 'success',
      feedUrl: 'https://atom.example/atom.xml'
    }
  }

  assert.equal(
    getVerifiedFeedUrl(updates, 'https://RSS.example/'),
    'https://rss.example/feed.xml'
  )
  assert.equal(
    getVerifiedFeedUrl(updates, 'https://atom.example/'),
    'https://atom.example/atom.xml'
  )
})

test('hides missing, invalid, and non-success feed URLs', () => {
  const updates = {
    'https://missing.example/': { status: 'unavailable', feedUrl: null },
    'https://unknown.example/': {
      status: 'unknown',
      feedUrl: 'https://unknown.example/feed.xml'
    },
    'https://invalid.example/': {
      status: 'success',
      feedUrl: 'javascript:alert(1)'
    }
  }

  assert.equal(getVerifiedFeedUrl(updates, 'https://missing.example/'), null)
  assert.equal(getVerifiedFeedUrl(updates, 'https://unknown.example/'), null)
  assert.equal(getVerifiedFeedUrl(updates, 'https://invalid.example/'), null)
})
