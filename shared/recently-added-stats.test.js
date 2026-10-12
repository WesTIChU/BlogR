import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ALL_BLOG_STATS_CONFIG,
  RECENTLY_UPDATED_STATS_CONFIG
} from '../docs/.vitepress/components/recently-added-stats.config.js'
import {
  getAllBlogStats,
  getRecentlyAddedStats
} from './recently-added-stats.js'

const definitions = [
  { key: 'today', label: 'Today', order: 1, period: { type: 'calendar-day' } },
  {
    key: 'week',
    label: 'Last 7 days',
    order: 2,
    period: { type: 'rolling-days', days: 7 }
  },
  {
    key: 'month',
    label: 'This Month',
    order: 3,
    period: { type: 'calendar-month' }
  }
]

test('exposes the configurable All Blogs statistics in display order', () => {
  assert.equal(ALL_BLOG_STATS_CONFIG.sectionHeading, '')
  assert.deepEqual(
    ALL_BLOG_STATS_CONFIG.statistics
      .filter(({ enabled }) => enabled)
      .sort((a, b) => a.order - b.order)
      .map(({ label }) => label),
    ['Total Blogs', 'Known Countries', 'Updated Today']
  )
})

test('exposes the Recently Updated statistics in display order', () => {
  assert.deepEqual(
    RECENTLY_UPDATED_STATS_CONFIG.statistics
      .filter(({ enabled }) => enabled)
      .sort((a, b) => a.order - b.order)
      .map(({ label }) => label),
    ['Updated Today', 'Last 7 Days', 'This Month']
  )
})

test('counts overlapping today, rolling-week, and calendar-month periods', () => {
  const stats = getRecentlyAddedStats(
    [
      { name: 'Today', url: '/today', addedDate: '2026-04-01' },
      { name: 'Yesterday', url: '/yesterday', addedDate: '2026-03-31' },
      { name: 'Last week', url: '/last-week', addedDate: '2026-03-26' },
      { name: 'Old month', url: '/old-month', addedDate: '2026-03-01' }
    ],
    new Date('2026-04-01T12:00:00Z'),
    definitions
  )

  assert.deepEqual(
    stats.map(({ key, count }) => [key, count]),
    [
      ['today', 1],
      ['week', 3],
      ['month', 1]
    ]
  )
})

test('returns zero for empty periods and respects disabled and custom order', () => {
  const stats = getRecentlyAddedStats(
    [{ name: 'Old', url: '/old', addedDate: '2026-03-01' }],
    new Date('2026-04-01T12:00:00Z'),
    [
      {
        key: 'empty',
        label: 'Empty',
        order: 2,
        period: { type: 'calendar-day' }
      },
      {
        key: 'disabled',
        enabled: false,
        order: 1,
        period: { type: 'calendar-month' }
      }
    ]
  )

  assert.deepEqual(
    stats.map(({ key, count }) => [key, count]),
    [['empty', 0]]
  )
})

test('deduplicates the same blog within each statistic', () => {
  const stats = getRecentlyAddedStats(
    [
      { name: 'One', url: '/same', addedDate: '2026-04-01' },
      { name: 'One duplicate', url: '/same', addedDate: '2026-04-01' },
      { name: 'Two', url: '/two', addedDate: '2026-04-01' }
    ],
    new Date('2026-04-01T12:00:00Z'),
    [definitions[0]]
  )

  assert.equal(stats[0].count, 2)
})

test('handles month transitions and date-only legacy entries', () => {
  const stats = getRecentlyAddedStats(
    [
      { name: 'March', url: '/march', addedDate: '2026-03-31' },
      { name: 'April', url: '/april', addedDate: '2026-04-01' },
      {
        name: 'April precise',
        url: '/precise',
        addedAt: '2026-04-01T00:30:00Z'
      }
    ],
    new Date('2026-03-31T23:30:00Z'),
    definitions
  )

  assert.deepEqual(
    stats.map(({ key, count }) => [key, count]),
    [
      ['today', 2],
      ['week', 3],
      ['month', 2]
    ]
  )
})

test('uses Europe/London across daylight-saving and midnight boundaries', () => {
  const stats = getRecentlyAddedStats(
    [
      {
        name: 'Before DST midnight',
        url: '/before',
        addedAt: '2026-03-29T00:30:00Z'
      },
      {
        name: 'After DST midnight',
        url: '/after',
        addedAt: '2026-03-29T01:30:00Z'
      }
    ],
    new Date('2026-03-29T22:30:00Z'),
    [definitions[0]]
  )

  assert.equal(stats[0].count, 2)
})

test('counts published blogs, unique valid countries, and confirmed updates', () => {
  const blogs = [
    { name: 'One', url: 'https://one.example/', country: 'GB' },
    { name: 'Two', url: 'https://two.example/', country: 'GB' },
    { name: 'Three', url: 'https://three.example/', country: 'US' },
    { name: 'Unknown', url: 'https://unknown.example/', country: null },
    { name: 'Invalid', url: 'https://invalid.example/', country: 'ZZ' },
    {
      name: 'Unpublished',
      url: 'https://unpublished.example/',
      country: 'CA',
      published: false
    }
  ]
  const updates = {
    'https://one.example/': {
      status: 'success',
      lastPublished: '2026-04-01'
    },
    'https://two.example/': {
      status: 'unavailable',
      lastPublished: '2026-04-01'
    },
    'https://three.example/': {
      status: 'success',
      lastPublished: '2026-03-28'
    },
    'https://unknown.example/': {
      status: 'success',
      lastPublished: null
    }
  }
  const definitions = [
    { key: 'total', metric: 'total-blogs', order: 1 },
    { key: 'countries', metric: 'known-countries', order: 2 },
    {
      key: 'today',
      metric: 'content-updates',
      order: 3,
      period: { type: 'calendar-day' }
    }
  ]

  assert.deepEqual(
    getAllBlogStats(
      blogs,
      updates,
      new Date('2026-04-01T12:00:00Z'),
      definitions
    ).map(({ key, count }) => [key, count]),
    [
      ['total', 5],
      ['countries', 2],
      ['today', 1]
    ]
  )
})

test('returns zero for empty all-blog statistics and ignores metadata refreshes', () => {
  const definitions = [
    { key: 'total', metric: 'total-blogs', order: 2 },
    {
      key: 'today',
      metric: 'content-updates',
      order: 1,
      period: { type: 'calendar-day' }
    }
  ]
  assert.deepEqual(
    getAllBlogStats(
      [],
      {
        'https://example.test/': {
          status: 'unknown',
          lastChecked: '2026-04-01'
        }
      },
      new Date('2026-04-01T12:00:00Z'),
      definitions
    ).map(({ key, count }) => [key, count]),
    [
      ['today', 0],
      ['total', 0]
    ]
  )
})

test('uses London dates for update boundaries during daylight saving', () => {
  const definitions = [
    {
      key: 'today',
      metric: 'content-updates',
      period: { type: 'calendar-day' }
    }
  ]
  const updates = {
    'https://before.example/': {
      status: 'success',
      lastPublished: '2026-03-29'
    }
  }
  assert.equal(
    getAllBlogStats(
      [{ url: 'https://before.example/', country: 'GB' }],
      updates,
      new Date('2026-03-29T22:30:00Z'),
      definitions
    )[0].count,
    1
  )
})
