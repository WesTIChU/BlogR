import { getBlogUpdate } from './blog-update.js'
import {
  ageInLondonDays,
  getLondonDateKey,
  LONDON_TIME_ZONE
} from './recently-added.js'

export const RECENTLY_UPDATED_GROUPS = [
  { key: 'today', title: 'Today' },
  { key: 'yesterday', title: 'Yesterday' },
  { key: 'earlier-this-week', title: 'Earlier This Week' },
  { key: 'older-updates', title: 'Older Updates' }
]

export const BLOG_CATEGORY_LABELS = {
  'arts-and-entertainment': 'Arts & Entertainment',
  'books-and-writing': 'Books & Writing',
  'culture-and-places': 'Culture & Places',
  'health-and-wellbeing': 'Health & Wellbeing',
  'internet-and-society': 'Internet & Society',
  'lifestyle-and-hobbies': 'Lifestyle & Hobbies',
  'money-and-business': 'Money & Business',
  'science-and-nature': 'Science & Nature',
  technology: 'Technology',
  'travel-outdoors': 'Travel & Outdoors',
  'personal-writing': 'Personal Writing'
}

const validPublicationDate = (value) => {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

const validDateOnly = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null

const publicationDetails = (update) => {
  const dateKey = validDateOnly(update?.lastPublished)
  const articleDate = validPublicationDate(update?.latestArticle?.publishedAt)
  if (articleDate) {
    return {
      dateKey: dateKey ?? getLondonDateKey(articleDate),
      sortTime: articleDate.getTime(),
      date: articleDate.toISOString()
    }
  }

  if (!dateKey) return null
  return {
    dateKey,
    sortTime: null,
    date: dateKey
  }
}

const getRecentlyUpdatedEntries = (blogs, updates) =>
  blogs
    .map((blog) => {
      const update = getBlogUpdate(updates, blog.url)
      const publication = publicationDetails(update)
      if (!publication || update?.status !== 'success') return null
      return {
        blog,
        update,
        publication,
        article: update.latestArticle ?? null
      }
    })
    .filter(Boolean)

const compareEntries = (a, b) => {
  const aTime = a.publication.sortTime
  const bTime = b.publication.sortTime
  if (aTime === null && bTime !== null) return 1
  if (aTime !== null && bTime === null) return -1
  if (aTime !== null && bTime !== null && bTime !== aTime) {
    return bTime - aTime
  }
  return a.blog.name.localeCompare(b.blog.name)
}

export function getRecentlyUpdatedBlogs(blogs, updates, now = new Date()) {
  const today = getLondonDateKey(now)
  return getRecentlyUpdatedEntries(blogs, updates)
    .filter((entry) => entry.publication.dateKey === today)
    .sort(compareEntries)
}

const groupKeyForAge = (age) => {
  if (age === 0) return 'today'
  if (age === 1) return 'yesterday'
  if (age >= 2 && age <= 6) return 'earlier-this-week'
  return 'older-updates'
}

export function getRecentlyUpdatedGroups(blogs, updates, now = new Date()) {
  const groups = new Map(
    RECENTLY_UPDATED_GROUPS.map(({ key, title }) => [
      key,
      { key, title, blogs: [] }
    ])
  )
  for (const entry of getRecentlyUpdatedEntries(blogs, updates)) {
    const age = ageInLondonDays(entry.publication.dateKey, now)
    if (age === null || age < 0) continue
    groups.get(groupKeyForAge(age)).blogs.push(entry)
  }
  return RECENTLY_UPDATED_GROUPS.map(({ key }) => groups.get(key)).filter(
    ({ blogs: entries }) => entries.length
  )
}

export function getTodayUpdatedCategoryGroups(
  blogs,
  updates,
  now = new Date()
) {
  const today = getLondonDateKey(now)
  const grouped = new Map()
  for (const entry of getRecentlyUpdatedEntries(blogs, updates)) {
    if (entry.publication.dateKey !== today) continue
    const category = entry.blog.category
    if (!grouped.has(category)) {
      grouped.set(category, {
        key: `category-${category}`,
        category,
        title: BLOG_CATEGORY_LABELS[category] ?? category,
        blogs: [],
        firstIndex: grouped.size
      })
    }
    grouped.get(category).blogs.push(entry)
  }
  return [...grouped.values()]
    .map((group) => ({
      ...group,
      latestTime: group.blogs.reduce(
        (latest, entry) =>
          entry.publication.sortTime !== null
            ? Math.max(latest, entry.publication.sortTime)
            : latest,
        Number.NEGATIVE_INFINITY
      ),
      blogs: group.blogs.sort(compareEntries)
    }))
    .sort((a, b) => b.latestTime - a.latestTime || a.firstIndex - b.firstIndex)
}

export function formatLondonDateTime(value) {
  const date = validPublicationDate(value)
  if (!date) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LONDON_TIME_ZONE,
    timeZoneName: 'short'
  }).format(date)
}

export function formatLondonTime(value) {
  const date = validPublicationDate(value)
  if (!date) return null
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LONDON_TIME_ZONE,
    timeZoneName: 'short'
  }).format(date)
}

export function formatLondonDate(value) {
  const date = validDateOnly(value)
  if (!date) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00.000Z`))
}

export function formatLondonHeadingDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: LONDON_TIME_ZONE
  }).format(date)
}
