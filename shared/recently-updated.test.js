import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatLondonDateTime,
  getRecentlyUpdatedBlogs,
  getRecentlyUpdatedGroups,
  getTodayUpdatedCategoryGroups
} from './recently-updated.js'

const blogs = [
  {
    name: 'Older',
    url: 'https://older.example/',
    category: 'technology',
    country: 'GB'
  },
  {
    name: 'Later',
    url: 'https://later.example/',
    category: 'technology',
    country: 'GB'
  },
  {
    name: 'Invalid',
    url: 'https://invalid.example/',
    category: 'technology',
    country: 'GB'
  }
]

test('filters to London today and sorts by publication time', () => {
  const updates = {
    'https://older.example/': {
      status: 'success',
      lastPublished: '2026-10-11',
      latestArticle: {
        title: 'Yesterday',
        url: 'https://older.example/yesterday',
        publishedAt: '2026-10-11T22:59:00Z'
      }
    },
    'https://later.example/': {
      status: 'success',
      lastPublished: '2026-10-12',
      latestArticle: {
        title: 'Today',
        url: 'https://later.example/today',
        publishedAt: '2026-10-12T12:00:00Z'
      }
    },
    'https://invalid.example/': {
      status: 'success',
      lastPublished: '2026-10-11',
      latestArticle: {
        title: 'Invalid',
        url: 'https://invalid.example/post',
        publishedAt: 'not a date'
      }
    }
  }

  assert.deepEqual(
    getRecentlyUpdatedBlogs(
      blogs,
      updates,
      new Date('2026-10-12T10:00:00Z')
    ).map(({ blog }) => blog.name),
    ['Later']
  )
})

test('includes legacy publication records without article metadata', () => {
  const entries = getRecentlyUpdatedBlogs(
    [
      {
        name: 'Legacy Blog',
        url: 'https://legacy.example/',
        category: 'technology',
        country: 'GB'
      }
    ],
    {
      'https://legacy.example/': {
        status: 'success',
        lastPublished: '2026-10-12'
      }
    },
    new Date('2026-10-12T12:00:00Z')
  )
  assert.equal(entries.length, 1)
  assert.equal(entries[0].article, null)
})

test('formats timestamps in Europe/London across daylight-saving time', () => {
  assert.match(formatLondonDateTime('2026-10-25T00:30:00Z'), /01:30/)
  assert.match(formatLondonDateTime('2026-10-25T01:30:00Z'), /01:30/)
})

test('uses the London calendar date for precise article timestamps', () => {
  const blog = { name: 'Crossing Midnight', url: 'https://example.com' }
  const updates = {
    'https://example.com/': {
      status: 'success',
      lastPublished: '2026-10-12',
      latestArticle: {
        title: 'Published before London midnight',
        url: 'https://example.com/post',
        publishedAt: '2026-10-11T23:30:00Z'
      }
    }
  }
  assert.equal(
    getRecentlyUpdatedBlogs([blog], updates, new Date('2026-10-12T00:15:00Z'))
      .length,
    1
  )
  assert.equal(
    getRecentlyUpdatedBlogs([blog], updates, new Date('2026-10-11T22:15:00Z'))
      .length,
    0
  )
})

test('groups legacy updates into the Recently Added-style sections', () => {
  const blogs = [
    { name: 'Today', url: 'https://today.example/' },
    { name: 'Yesterday', url: 'https://yesterday.example/' },
    { name: 'Older', url: 'https://older.example/' }
  ]
  const updates = {
    'https://today.example/': {
      status: 'success',
      lastPublished: '2026-10-12'
    },
    'https://yesterday.example/': {
      status: 'success',
      lastPublished: '2026-10-11'
    },
    'https://older.example/': { status: 'success', lastPublished: '2026-10-01' }
  }
  assert.deepEqual(
    getRecentlyUpdatedGroups(
      blogs,
      updates,
      new Date('2026-10-12T12:00:00Z')
    ).map(({ key }) => key),
    ['today', 'yesterday', 'older-updates']
  )
})

test('groups only today updates by BlogR category', () => {
  const blogs = [
    {
      name: 'Tech today',
      url: 'https://tech.example/',
      category: 'technology'
    },
    {
      name: 'Arts today',
      url: 'https://arts.example/',
      category: 'arts-and-entertainment'
    },
    { name: 'Old tech', url: 'https://old.example/', category: 'technology' }
  ]
  const updates = {
    'https://tech.example/': {
      status: 'success',
      lastPublished: '2026-10-12',
      latestArticle: { publishedAt: '2026-10-12T14:20:00Z' }
    },
    'https://arts.example/': {
      status: 'success',
      lastPublished: '2026-10-12',
      latestArticle: { publishedAt: '2026-10-12T15:45:00Z' }
    },
    'https://old.example/': { status: 'success', lastPublished: '2026-10-11' }
  }
  assert.deepEqual(
    getTodayUpdatedCategoryGroups(
      blogs,
      updates,
      new Date('2026-10-12T12:00:00Z')
    ).map(({ title, blogs: entries }) => [
      title,
      entries.map(({ blog }) => blog.name)
    ]),
    [
      ['Arts & Entertainment', ['Arts today']],
      ['Technology', ['Tech today']]
    ]
  )
})

test('sorts by full publication time and puts missing times last', () => {
  const blogs = [
    { name: 'Later', url: 'https://later.example/', category: 'technology' },
    {
      name: 'Earlier',
      url: 'https://earlier.example/',
      category: 'technology'
    },
    {
      name: 'Date only',
      url: 'https://date-only.example/',
      category: 'technology'
    }
  ]
  const updates = {
    'https://later.example/': {
      status: 'success',
      lastPublished: '2026-10-12',
      latestArticle: { publishedAt: '2026-10-12T14:20:00Z' }
    },
    'https://earlier.example/': {
      status: 'success',
      lastPublished: '2026-10-12',
      latestArticle: { publishedAt: '2026-10-12T13:45:00Z' }
    },
    'https://date-only.example/': {
      status: 'success',
      lastPublished: '2026-10-12'
    }
  }
  assert.deepEqual(
    getTodayUpdatedCategoryGroups(
      blogs,
      updates,
      new Date('2026-10-12T12:00:00Z')
    )[0].blogs.map(({ blog }) => blog.name),
    ['Later', 'Earlier', 'Date only']
  )
})
