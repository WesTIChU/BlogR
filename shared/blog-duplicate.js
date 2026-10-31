import { comparableBlogUrl } from './new-blog-entries.js'
import { canonicalSubmissionUrl } from './submission-url.js'

export const canonicalBlogUrl = (value) => comparableBlogUrl(value)
export const canonicalSubmissionIdentity = (value) =>
  canonicalSubmissionUrl(value)

export const findListedBlog = (blogs, value) => {
  const canonical = canonicalSubmissionIdentity(value)
  return blogs.find(
    (blog) => canonicalSubmissionIdentity(blog.url) === canonical
  )
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
  const canonical = canonicalSubmissionIdentity(value)
  const sections = [
    ['blog', blogs],
    ['website', websites],
    ['community', communities]
  ]
  return sections
    .filter(([section]) => section !== type)
    .flatMap(([section, entries]) =>
      entries
        .filter((entry) => canonicalSubmissionIdentity(entry.url) === canonical)
        .map((entry) => ({ type: section, entry }))
    )
}

export const hasPendingSubmission = (issues, value) => {
  const canonical = canonicalSubmissionIdentity(value)
  return issues.some((issue) =>
    String(issue.body ?? '')
      .split(/\s+/)
      .some((candidate) => {
        try {
          return canonicalSubmissionIdentity(candidate) === canonical
        } catch {
          return false
        }
      })
  )
}
