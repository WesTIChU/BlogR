import { comparableBlogUrl } from './new-blog-entries.js'

export const canonicalBlogUrl = (value) => comparableBlogUrl(value)

export const findListedBlog = (blogs, value) => {
  const canonical = canonicalBlogUrl(value)
  return blogs.find((blog) => canonicalBlogUrl(blog.url) === canonical)
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
  const canonical = canonicalBlogUrl(value)
  const sections = [
    ['blog', blogs],
    ['website', websites],
    ['community', communities]
  ]
  return sections
    .filter(([section]) => section !== type)
    .flatMap(([section, entries]) =>
      entries
        .filter((entry) => canonicalBlogUrl(entry.url) === canonical)
        .map((entry) => ({ type: section, entry }))
    )
}

export const hasPendingSubmission = (issues, value) => {
  const canonical = canonicalBlogUrl(value)
  return issues.some((issue) =>
    String(issue.body ?? '')
      .split(/\s+/)
      .some((candidate) => {
        try {
          return canonicalBlogUrl(candidate) === canonical
        } catch {
          return false
        }
      })
  )
}
