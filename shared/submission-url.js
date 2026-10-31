/* global URL */

import { parse } from 'tldts'
import { comparableBlogUrl } from './new-blog-entries.js'

const ARTICLE_SECTIONS = new Set([
  'article',
  'articles',
  'blog',
  'blogs',
  'news',
  'post',
  'posts',
  'story',
  'stories',
  'updates'
])

const NON_ARTICLE_SECTIONS = new Set([
  'author',
  'authors',
  'category',
  'categories',
  'page',
  'pages',
  'search',
  'tag',
  'tags'
])

const DATE_SEGMENT = /^(?:19|20)\d{2}$/
const MONTH_SEGMENT = /^(?:0?[1-9]|1[0-2])$/
const ARTICLE_SLUG = /(?:-|_|\d{2,}|[a-z][a-z]{5,})/i
const DEEP_ARTICLE_SLUG = /[-_]|\d{2,}/i

const decodeSegment = (segment) => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

const cleanPath = (pathname) => {
  const segments = (
    Array.isArray(pathname) ? pathname : pathname.split('/')
  ).filter(Boolean)
  return segments.length ? `/${segments.join('/')}/` : '/'
}

const parentUrl = (url, path) => {
  const parent = new URL(url.toString())
  parent.pathname = cleanPath(path)
  parent.search = ''
  parent.hash = ''
  return parent.toString()
}

const looksLikeArticleSlug = (segment) =>
  ARTICLE_SLUG.test(decodeSegment(segment).replace(/\.[a-z\d]+$/i, ''))

/**
 * Return a conservative article guess. This deliberately does not classify
 * every deep URL as an article: subdirectory websites and project pages are
 * valid BlogR submissions.
 */
export const inspectArticleUrl = (value) => {
  const url = new URL(value)
  const segments = url.pathname.split('/').filter(Boolean)
  const lower = segments.map((segment) => decodeSegment(segment).toLowerCase())

  for (let index = 0; index < lower.length; index += 1) {
    if (!ARTICLE_SECTIONS.has(lower[index]) || index === lower.length - 1)
      continue
    const remainder = lower.slice(index + 1)
    const last = remainder.at(-1)
    if (!last || NON_ARTICLE_SECTIONS.has(last) || !looksLikeArticleSlug(last))
      continue
    return {
      isArticle: true,
      suggestedUrl: parentUrl(url, segments.slice(0, index + 1)),
      reason: 'section'
    }
  }

  if (
    lower.length >= 3 &&
    DATE_SEGMENT.test(lower[0]) &&
    MONTH_SEGMENT.test(lower[1]) &&
    looksLikeArticleSlug(lower.at(-1))
  ) {
    return { isArticle: true, suggestedUrl: parentUrl(url, []), reason: 'date' }
  }

  if (
    lower.length >= 3 &&
    DEEP_ARTICLE_SLUG.test(lower.at(-1)) &&
    !NON_ARTICLE_SECTIONS.has(lower.at(-2))
  ) {
    const parsed = parse(url.hostname)
    if (parsed.domain || parsed.hostname) {
      return {
        isArticle: true,
        suggestedUrl: parentUrl(url, []),
        reason: 'deep'
      }
    }
  }

  return { isArticle: false, suggestedUrl: null, reason: null }
}

export const canonicalSubmissionUrl = (value) => {
  const url = new URL(comparableBlogUrl(value))
  const article = inspectArticleUrl(url.toString())
  return article.isArticle
    ? comparableBlogUrl(article.suggestedUrl)
    : comparableBlogUrl(url.toString())
}

export const articleSubmissionMessage = (suggestedUrl) =>
  suggestedUrl
    ? 'It looks like you submitted an individual article. BlogR lists websites and blogs rather than individual posts. Did you mean to submit this blog instead?'
    : 'It looks like you submitted an individual article. BlogR lists websites and blogs rather than individual posts. Please submit the blog homepage instead.'

export const isSharedHostingHostname = (hostname) => {
  const parsed = parse(hostname)
  return Boolean(
    parsed.domain &&
    [
      'github.io',
      'blogspot.com',
      'neocities.org',
      'pages.dev',
      'wordpress.com'
    ].includes(parsed.domain)
  )
}
