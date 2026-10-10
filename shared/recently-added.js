export const RECENTLY_ADDED_MAX_AGE_DAYS = 30
export const UTC_DAY_MS = 24 * 60 * 60 * 1000
export const LONDON_TIME_ZONE = 'Europe/London'

export const RECENTLY_ADDED_GROUPS = [
  { key: 'today', title: 'Today' },
  { key: 'yesterday', title: 'Yesterday' },
  { key: 'earlier-this-week', title: 'Earlier This Week' },
  { key: 'last-30-days', title: 'Last 30 Days' },
  { key: 'older-additions', title: 'Older Additions' }
]

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseUtcDateOnly(value) {
  if (typeof value !== 'string') return null
  const match = value.match(dateOnlyPattern)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

export function formatAddedDate(value) {
  const date = parseUtcDateOnly(value)
  if (!date) return null

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric'
  }).format(date)
}

export function getLondonDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date')

  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    timeZone: LONDON_TIME_ZONE,
    year: 'numeric'
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: partValue }) => [type, partValue])
  )
  return `${values.year}-${values.month}-${values.day}`
}

export function utcDayStart(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date')
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function ageInUtcDays(addedDate, now = new Date()) {
  const date = parseUtcDateOnly(addedDate)
  if (!date) return null
  return Math.floor((utcDayStart(now) - date.getTime()) / UTC_DAY_MS)
}

export function ageInLondonDays(addedDate, now = new Date()) {
  if (!parseUtcDateOnly(addedDate)) return null

  const addedTimestamp = Date.parse(`${addedDate}T00:00:00.000Z`)
  const todayTimestamp = Date.parse(`${getLondonDateKey(now)}T00:00:00.000Z`)
  return Math.floor((todayTimestamp - addedTimestamp) / UTC_DAY_MS)
}

export function isRecentlyAdded(addedDate, now = new Date()) {
  const age = ageInLondonDays(addedDate, now)
  return age !== null && age >= 0 && age <= RECENTLY_ADDED_MAX_AGE_DAYS
}

function additionTimestamp(blog) {
  const precise = Date.parse(blog.addedAt ?? '')
  if (Number.isFinite(precise)) return precise

  const dateOnly = parseUtcDateOnly(blog.addedDate)
  return dateOnly ? dateOnly.getTime() : Number.NEGATIVE_INFINITY
}

function compareBlogNames(a, b) {
  const nameA = String(a.name ?? '')
  const nameB = String(b.name ?? '')
  if (nameA < nameB) return -1
  if (nameA > nameB) return 1

  const urlA = String(a.url ?? '')
  const urlB = String(b.url ?? '')
  if (urlA < urlB) return -1
  if (urlA > urlB) return 1
  return 0
}

export function compareRecentlyAddedBlogs(a, b) {
  return additionTimestamp(b) - additionTimestamp(a) || compareBlogNames(a, b)
}

export function getRecentlyAddedBlogs(blogs, now = new Date()) {
  return blogs
    .filter((blog) => {
      const age = ageInLondonDays(blog.addedDate, now)
      return age !== null && age >= 0 && age <= RECENTLY_ADDED_MAX_AGE_DAYS
    })
    .sort(compareRecentlyAddedBlogs)
}

function groupKeyForAge(age) {
  if (age === 0) return 'today'
  if (age === 1) return 'yesterday'
  if (age >= 2 && age <= 6) return 'earlier-this-week'
  if (age <= RECENTLY_ADDED_MAX_AGE_DAYS) return 'last-30-days'
  return 'older-additions'
}

export function getRecentlyAddedGroups(blogs, now = new Date()) {
  const grouped = new Map(
    RECENTLY_ADDED_GROUPS.map(({ key, title }) => [
      key,
      { key, title, blogs: [] }
    ])
  )

  blogs
    .map((blog) => ({
      blog,
      age: ageInLondonDays(blog.addedDate, now)
    }))
    .filter(({ age }) => age !== null && age >= 0)
    .forEach(({ blog, age }) => {
      grouped.get(groupKeyForAge(age)).blogs.push(blog)
    })

  for (const group of grouped.values()) {
    group.blogs.sort(compareRecentlyAddedBlogs)
  }

  return RECENTLY_ADDED_GROUPS.map(({ key }) => grouped.get(key)).filter(
    ({ blogs: entries }) => entries.length
  )
}
