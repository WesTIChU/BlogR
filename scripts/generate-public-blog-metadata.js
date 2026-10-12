import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normalizeBlogUpdateUrl } from '../shared/blog-update.js'

const SOURCE_PATH = resolve('data/blog-updates.json')
const OUTPUT_PATH = resolve('docs/public/blog-updates.json')

const compactArticle = (article) => {
  if (!article || typeof article !== 'object') return undefined
  const result = {}
  for (const key of ['title', 'url', 'summary', 'publishedAt']) {
    if (typeof article[key] === 'string' && article[key])
      result[key] = article[key]
  }
  return Object.keys(result).length ? result : undefined
}

export function compactBlogUpdates(updates) {
  const compact = {}
  for (const sourceUrl of Object.keys(updates).sort()) {
    let url
    try {
      url = normalizeBlogUpdateUrl(sourceUrl)
    } catch {
      continue
    }
    const source = updates[sourceUrl]
    if (!source || typeof source !== 'object') continue
    const entry = {}
    for (const key of ['status', 'lastPublished', 'feedUrl']) {
      if (typeof source[key] === 'string' && source[key])
        entry[key] = source[key]
    }
    const article = compactArticle(source.latestArticle)
    if (article) entry.latestArticle = article
    compact[url] = entry
  }
  return compact
}

export async function generatePublicBlogMetadata(
  sourcePath = SOURCE_PATH,
  outputPath = OUTPUT_PATH
) {
  const source = JSON.parse(await readFile(sourcePath, 'utf8'))
  const compact = compactBlogUpdates(source)
  await writeFile(outputPath, `${JSON.stringify(compact, null, 2)}\n`)
  return compact
}

if (process.argv[1]?.endsWith('/scripts/generate-public-blog-metadata.js')) {
  const compact = await generatePublicBlogMetadata()
  console.log(`Published metadata for ${Object.keys(compact).length} blogs.`)
}
