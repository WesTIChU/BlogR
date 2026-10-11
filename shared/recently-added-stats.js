import { normalizeBlogHealthUrl } from './blog-health-url.js'
import { getBlogUpdate } from './blog-update.js'
import { COUNTRY_CODES } from './countries.js'
import { getLondonDateKey, parseUtcDateOnly } from './recently-added.js'

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/

function dateKeyParts(value) {
  const match = typeof value === 'string' ? value.match(dateKeyPattern) : null
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

function calendarDayNumber(dateKey) {
  const parts = dateKeyParts(dateKey)
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null
}

function blogDateKey(blog) {
  const addedAt = Date.parse(blog?.addedAt ?? '')
  if (Number.isFinite(addedAt)) return getLondonDateKey(new Date(addedAt))

  return parseUtcDateOnly(blog?.addedDate) ? blog.addedDate : null
}

function matchesPeriod(dateKey, period, nowKey) {
  const date = dateKeyParts(dateKey)
  const now = dateKeyParts(nowKey)
  if (!date || !now) return false

  if (period.type === 'calendar-day') return dateKey === nowKey
  if (period.type === 'calendar-month') {
    return date.year === now.year && date.month === now.month
  }
  if (period.type === 'rolling-days') {
    const days = Number(period.days)
    if (!Number.isInteger(days) || days < 1) return false
    const age =
      (calendarDayNumber(nowKey) - calendarDayNumber(dateKey)) /
      (24 * 60 * 60 * 1000)
    return age >= 0 && age < days
  }
  return false
}

function blogIdentity(blog) {
  if (typeof blog?.url === 'string') {
    try {
      return normalizeBlogHealthUrl(blog.url).toString()
    } catch {
      // Fall back to the name for malformed test or legacy records.
    }
  }
  return String(blog?.url ?? blog?.name ?? '')
}

function isPublishedBlog(blog) {
  return (
    blog &&
    blog.removed !== true &&
    blog.published !== false &&
    blog.unpublished !== true
  )
}

function contentUpdateDateKey(blog, updates) {
  const update = getBlogUpdate(updates, blog?.url)
  return update?.status === 'success' && parseUtcDateOnly(update.lastPublished)
    ? update.lastPublished
    : null
}

function matchesDefinition(blog, definition, now, updates) {
  if (definition.metric === 'total-blogs') return true
  if (definition.metric === 'known-countries') {
    return typeof blog.country === 'string' && COUNTRY_CODES.has(blog.country)
  }

  return matchesPeriod(
    contentUpdateDateKey(blog, updates),
    definition.period,
    getLondonDateKey(now)
  )
}

export function getAllBlogStats(
  blogs,
  updates,
  now = new Date(),
  definitions = []
) {
  return definitions
    .filter((definition) => definition.enabled !== false)
    .map((definition) => {
      const seen = new Set()
      const matchingBlogs = blogs.filter((blog) => {
        if (!isPublishedBlog(blog)) return false
        if (definition.metric === 'known-countries') {
          return matchesDefinition(blog, definition, now, updates)
        }

        const identity = blogIdentity(blog)
        if (!identity || seen.has(identity)) return false
        if (!matchesDefinition(blog, definition, now, updates)) return false
        seen.add(identity)
        return true
      })

      const count =
        definition.metric === 'known-countries'
          ? new Set(matchingBlogs.map(({ country }) => country)).size
          : matchingBlogs.length

      return { ...definition, count }
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export function getRecentlyAddedStats(
  blogs,
  now = new Date(),
  definitions = []
) {
  const nowKey = getLondonDateKey(now)
  return definitions
    .filter((definition) => definition.enabled !== false)
    .map((definition) => {
      const seen = new Set()
      const count = blogs.filter((blog) => {
        const identity = blogIdentity(blog)
        const dateKey = blogDateKey(blog)
        if (
          !identity ||
          seen.has(identity) ||
          !matchesPeriod(dateKey, definition.period, nowKey)
        ) {
          return false
        }
        seen.add(identity)
        return true
      }).length

      return { ...definition, count }
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}
