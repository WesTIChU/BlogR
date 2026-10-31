/* global URL */

import { comparableBlogUrl } from './new-blog-entries.js'
import { canonicalSubmissionUrl } from './submission-url.js'

export const canonicalBlogUrl = (value) => comparableBlogUrl(value)
export const canonicalSubmissionIdentity = (value) =>
  canonicalSubmissionUrl(value)

const identityUrl = (value) => {
  const url = new URL(comparableBlogUrl(value))
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  url.search = ''
  url.hash = ''
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment))
      } catch {
        return segment
      }
    })
  url.pathname = segments.length ? `/${segments.join('/')}` : '/'
  return url
}

export const websiteIdentity = (value) => {
  const url = identityUrl(value)
  return { host: url.host, pathname: url.pathname }
}

export const matchesWebsiteIdentity = (
  existingValue,
  submittedValue,
  { allowChildPaths = false } = {}
) => {
  const existing = websiteIdentity(existingValue)
  const submitted = websiteIdentity(submittedValue)
  if (existing.host !== submitted.host) return false
  if (existing.pathname === submitted.pathname) return true
  if (!allowChildPaths) return false
  if (existing.pathname === '/') return true
  return submitted.pathname.startsWith(`${existing.pathname}/`)
}

export const findListedBlog = (
  blogs,
  value,
  { allowChildPaths = false } = {}
) => {
  const submitted = websiteIdentity(value)
  return blogs
    .map((blog, index) => ({ blog, index }))
    .filter(({ blog }) =>
      matchesWebsiteIdentity(blog.url, value, { allowChildPaths })
    )
    .sort((a, b) => {
      const aIdentity = websiteIdentity(a.blog.url)
      const bIdentity = websiteIdentity(b.blog.url)
      const aExact = aIdentity.pathname === submitted.pathname
      const bExact = bIdentity.pathname === submitted.pathname
      if (aExact !== bExact) return aExact ? -1 : 1
      if (aIdentity.pathname.length !== bIdentity.pathname.length)
        return bIdentity.pathname.length - aIdentity.pathname.length
      return a.index - b.index
    })[0]?.blog
}

export const entriesForSubmissionType = (
  type,
  { blogs = [], websites = [], communities = [] }
) =>
  type === 'website' ? websites : type === 'community' ? communities : blogs

export const crossSectionMatches = (
  type,
  value,
  { blogs = [], websites = [], communities = [] }
) => {
  const sections = [
    ['blog', blogs],
    ['website', websites],
    ['community', communities]
  ]
  return sections
    .filter(([section]) => section !== type)
    .flatMap(([section, entries]) =>
      entries
        .filter((entry) =>
          matchesWebsiteIdentity(entry.url, value, {
            allowChildPaths: section === 'blog'
          })
        )
        .map((entry) => ({ type: section, entry }))
    )
}

export const hasPendingSubmission = (
  issues,
  value,
  { allowChildPaths = false } = {}
) => {
  const canonical = canonicalSubmissionIdentity(value)
  return issues.some((issue) =>
    String(issue.body ?? '')
      .split(/\s+/)
      .some((candidate) => {
        try {
          return (
            matchesWebsiteIdentity(candidate, value, { allowChildPaths }) ||
            canonicalSubmissionIdentity(candidate) === canonical
          )
        } catch {
          return false
        }
      })
  )
}
