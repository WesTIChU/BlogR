import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { comparableBlogUrl } from '../shared/new-blog-entries.js'

const argument = (name) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? null : process.argv[index + 1]
}

const readAt = (revision, path) =>
  JSON.parse(
    execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8' })
  )

const readCurrent = (path) => readFile(path, 'utf8').then(JSON.parse)

const entryKey = (entry) => {
  try {
    return comparableBlogUrl(entry.url)
  } catch {
    return `invalid:${entry.url}`
  }
}

const entrySignature = (entry) =>
  JSON.stringify({ ...entry, url: entryKey(entry) })

export function changedHealthUrls(previous, current) {
  const oldEntries = new Map(previous.map((entry) => [entryKey(entry), entry]))
  return current
    .filter((entry) => {
      const previousEntry = oldEntries.get(entryKey(entry))
      return (
        !previousEntry ||
        entrySignature(previousEntry) !== entrySignature(entry)
      )
    })
    .map((entry) => entry.url)
}

export async function getHealthTargets(base, head = 'HEAD') {
  const previousBlogs = readAt(base, 'data/blogs.json')
  const previousCommunities = readAt(base, 'data/communities.json')
  const currentBlogs =
    head === 'HEAD'
      ? await readCurrent('data/blogs.json')
      : readAt(head, 'data/blogs.json')
  const currentCommunities =
    head === 'HEAD'
      ? await readCurrent('data/communities.json')
      : readAt(head, 'data/communities.json')
  return {
    blogHealthUrls: changedHealthUrls(previousBlogs, currentBlogs),
    communityHealthUrls: changedHealthUrls(
      previousCommunities,
      currentCommunities
    )
  }
}

if (process.argv[1]?.endsWith('/scripts/health-targets.js')) {
  const targets = await getHealthTargets(argument('--base'), argument('--head'))
  console.log(`blog_health_urls=${JSON.stringify(targets.blogHealthUrls)}`)
  console.log(
    `community_health_urls=${JSON.stringify(targets.communityHealthUrls)}`
  )
}
