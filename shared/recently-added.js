export const RECENTLY_ADDED_MAX_AGE_DAYS = 30
export const UTC_DAY_MS = 24 * 60 * 60 * 1000

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

export function isRecentlyAdded(addedDate, now = new Date()) {
  const age = ageInUtcDays(addedDate, now)
  return age !== null && age >= 0 && age <= RECENTLY_ADDED_MAX_AGE_DAYS
}

export function getRecentlyAddedBlogs(blogs, now = new Date()) {
  return blogs
    .map((blog, index) => ({ blog, index }))
    .filter(({ blog }) => isRecentlyAdded(blog.addedDate, now))
    .sort((a, b) => {
      const addedTimestamp = ({ blog }) => {
        const precise = Date.parse(blog.addedAt ?? '')
        return Number.isFinite(precise)
          ? precise
          : Date.parse(`${blog.addedDate}T00:00:00.000Z`)
      }
      const aTimestamp = addedTimestamp(a)
      const bTimestamp = addedTimestamp(b)
      return bTimestamp - aTimestamp || a.index - b.index
    })
    .map(({ blog }) => blog)
}
