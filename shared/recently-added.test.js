import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ageInUtcDays,
  formatAddedDate,
  getRecentlyAddedBlogs,
  isRecentlyAdded
} from './recently-added.js'

const now = new Date('2026-03-31T23:00:00.000Z')

test('includes additions from day 0, day 29, and day 30', () => {
  assert.equal(isRecentlyAdded('2026-03-31', now), true)
  assert.equal(isRecentlyAdded('2026-03-02', now), true)
  assert.equal(isRecentlyAdded('2026-03-01', now), true)
})

test('excludes additions older than 30 days and missing dates', () => {
  assert.equal(isRecentlyAdded('2026-02-28', now), false)
  assert.equal(isRecentlyAdded(null, now), false)
  assert.equal(isRecentlyAdded('', now), false)
  assert.equal(isRecentlyAdded('not-a-date', now), false)
  assert.equal(ageInUtcDays('2026-02-28', now), 31)
})

test('formats verified addition dates and leaves unknown dates undisplayed', () => {
  assert.equal(formatAddedDate('2026-10-10'), '10 October 2026')
  assert.equal(formatAddedDate(null), null)
  assert.equal(formatAddedDate('not-a-date'), null)
})

test('uses UTC dates across month boundaries', () => {
  const beforeMidnight = new Date('2026-03-01T23:59:59.999Z')
  const afterMidnight = new Date('2026-03-02T00:00:00.000Z')
  assert.equal(isRecentlyAdded('2026-03-01', beforeMidnight), true)
  assert.equal(isRecentlyAdded('2026-01-30', afterMidnight), false)
})

test('sorts newest additions first and uses JSON order for old same-day entries', () => {
  const blogs = [
    { name: 'Older', addedDate: '2026-03-02' },
    { name: 'Zed', addedDate: '2026-03-31' },
    { name: 'Alpha', addedDate: '2026-03-31' },
    { name: 'Missing', addedDate: null }
  ]
  assert.deepEqual(
    getRecentlyAddedBlogs(blogs, now).map((blog) => blog.name),
    ['Zed', 'Alpha', 'Older']
  )
})

test('sorts same-day additions by precise addedAt time and remains deterministic', () => {
  const blogs = [
    {
      name: 'Added Earlier',
      addedDate: '2026-03-31',
      addedAt: '2026-03-31T10:00:00.000Z'
    },
    {
      name: 'Added Later',
      addedDate: '2026-03-31',
      addedAt: '2026-03-31T15:00:00.000Z',
      favourite: true
    }
  ]
  const first = getRecentlyAddedBlogs(blogs, now).map((blog) => blog.name)
  const second = getRecentlyAddedBlogs(blogs, now).map((blog) => blog.name)
  assert.deepEqual(first, ['Added Later', 'Added Earlier'])
  assert.deepEqual(second, first)
})

test('puts a newly approved same-day submission ahead of older same-day entries', () => {
  const blogs = [
    {
      name: 'Existing same-day blog',
      addedDate: '2026-10-09',
      addedAt: '2026-10-09T09:49:21.549Z'
    },
    {
      name: 'New submission',
      addedDate: '2026-10-09',
      addedAt: '2026-10-09T16:30:00.000Z'
    }
  ]
  assert.deepEqual(
    getRecentlyAddedBlogs(blogs, new Date('2026-10-09T17:00:00.000Z')).map(
      ({ name }) => name
    ),
    ['New submission', 'Existing same-day blog']
  )
})

test('keeps Recently Added independent of favourite status', () => {
  const blogs = [
    { name: 'Newer', addedDate: '2026-03-31', favourite: false },
    { name: 'Older', addedDate: '2026-03-30', favourite: true }
  ]
  assert.deepEqual(
    getRecentlyAddedBlogs(blogs, now).map((blog) => blog.name),
    ['Newer', 'Older']
  )
})
