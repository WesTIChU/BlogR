import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  comparableBlogUrl,
  getUninitializedNewBlogEntries
} from '../shared/new-blog-entries.js'
import { canonicalUrl, checkBlogs } from './check-blog-updates.js'

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const readJson = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

const readPreviousBlogs = (base) => {
  if (!base) return []
  try {
    return JSON.parse(execFileSync('git', ['show', `${base}:data/blogs.json`]))
  } catch {
    return []
  }
}

const currentBlogs = await readJson(resolve('data/blogs.json'), [])
const previousBlogs = readPreviousBlogs(argument('--base', null))
const retryMissing = process.env.RETRY_MISSING === 'true'
const previousUpdates = await readJson(resolve('data/blog-updates.json'), {})
const healthStatuses = await readJson(
  resolve('docs/public/health-status.json'),
  []
)
const healthUrls = Array.isArray(healthStatuses)
  ? healthStatuses.map(({ url }) => url)
  : []
const initializedUrls = Object.keys(previousUpdates).filter((url) =>
  healthUrls.some((healthUrl) => {
    try {
      return comparableBlogUrl(healthUrl) === comparableBlogUrl(url)
    } catch {
      return false
    }
  })
)
const newBlogs = getUninitializedNewBlogEntries(
  currentBlogs,
  retryMissing ? [] : previousBlogs,
  initializedUrls
)

await mkdir(resolve('reports'), { recursive: true })
await writeFile(
  resolve('reports/new-blog-urls.json'),
  `${JSON.stringify(
    newBlogs.map(({ url }) => url),
    null,
    2
  )}\n`
)

if (!newBlogs.length) {
  console.log('No genuinely new blogs detected.')
  process.exit(0)
}

const scanPrevious = { ...previousUpdates }
for (const blog of newBlogs) {
  const comparableUrl = comparableBlogUrl(blog.url)
  const matchingEntry = Object.entries(previousUpdates).find(([url]) => {
    try {
      return comparableBlogUrl(url) === comparableUrl
    } catch {
      return false
    }
  })
  if (matchingEntry) scanPrevious[canonicalUrl(blog.url)] = matchingEntry[1]
}
const updates = await checkBlogs({ blogs: newBlogs, previous: scanPrevious })
const mergedUpdates = { ...previousUpdates, ...updates }
await writeFile(
  resolve('data/blog-updates.json'),
  `${JSON.stringify(mergedUpdates, null, 2)}\n`
)
console.log(`Prepared initial metadata for ${newBlogs.length} new blogs.`)
