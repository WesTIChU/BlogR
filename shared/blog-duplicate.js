import { comparableBlogUrl } from './new-blog-entries.js'

export const canonicalBlogUrl = (value) => comparableBlogUrl(value)

export const findListedBlog = (blogs, value) => {
  const canonical = canonicalBlogUrl(value)
  return blogs.find((blog) => canonicalBlogUrl(blog.url) === canonical)
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
