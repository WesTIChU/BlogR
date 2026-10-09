import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { test } from 'node:test'

const DIST = resolve('docs/.vitepress/dist')
const ORIGIN = 'https://blogr.directory'

const htmlFiles = async () => {
  const files = []
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.name.endsWith('.html')) files.push(path)
    }
  }
  await visit(DIST)
  return files.sort()
}

const meta = (html, attribute, value) => {
  const pattern = new RegExp(
    `<meta\\s+[^>]*${attribute}=["']${value}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  )
  return html.match(pattern)?.[1] ?? null
}

const canonical = (html) =>
  html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] ??
  null

const contentHeadings = (html) => {
  const start = html.indexOf('class="vp-doc')
  if (start === -1) return []
  const end = html.indexOf('</main>', start)
  return [...html.slice(start, end).matchAll(/<h([1-6])\b[^>]*>/gi)].map(
    (match) => Number(match[1])
  )
}

test('public pages use the production origin consistently', async () => {
  const files = (await htmlFiles()).filter((file) => !file.endsWith('404.html'))

  assert.equal(files.length, 20)
  for (const file of files) {
    const html = await readFile(file, 'utf8')
    assert.equal(
      canonical(html)?.startsWith(ORIGIN),
      true,
      relative(DIST, file)
    )
    assert.equal(meta(html, 'property', 'og:url')?.startsWith(ORIGIN), true)
    assert.equal(meta(html, 'name', 'twitter:url')?.startsWith(ORIGIN), true)
    assert.equal(meta(html, 'property', 'og:image')?.startsWith(ORIGIN), true)
    assert.equal(meta(html, 'name', 'twitter:image')?.startsWith(ORIGIN), true)
    assert.equal(html.includes('localhost:5173'), false, relative(DIST, file))
  }
})

test('sitemap and robots use the production sitemap URL', async () => {
  const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8')
  const robots = await readFile(join(DIST, 'robots.txt'), 'utf8')
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => match[1]
  )

  assert.equal(locs.length, 20)
  assert.equal(
    locs.every((url) => url.startsWith(ORIGIN)),
    true
  )
  assert.equal(sitemap.includes('localhost:5173'), false)
  assert.match(robots, /^Sitemap: https:\/\/blogr\.directory\/sitemap\.xml$/m)
})

test('RSS uses the production origin', async () => {
  const rss = await readFile(join(DIST, 'feed.rss'), 'utf8')
  assert.equal(rss.includes('localhost:5173'), false)
  assert.equal(rss.includes('<link>https://blogr.directory/</link>'), true)
})

test('merged community routes publish redirects and the canonical destination', async () => {
  const redirects = await readFile(join(DIST, '_redirects'), 'utf8')
  assert.match(
    redirects,
    /^\/communities\/forums \/communities\/online-communities 301$/m
  )
  assert.match(
    redirects,
    /^\/communities\/small-communities \/communities\/online-communities 301$/m
  )

  const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8')
  assert.match(
    sitemap,
    /https:\/\/blogr\.directory\/communities\/online-communities/
  )
  assert.equal(sitemap.includes('/communities/forums'), false)
  assert.equal(sitemap.includes('/communities/small-communities'), false)
})

test('public pages have unique descriptions and valid heading hierarchy', async () => {
  const files = (await htmlFiles()).filter((file) => !file.endsWith('404.html'))
  const descriptions = []

  for (const file of files) {
    const html = await readFile(file, 'utf8')
    const description = meta(html, 'name', 'description')
    assert.ok(description, relative(DIST, file))
    descriptions.push(description)

    const headings = contentHeadings(html)
    if (!headings.length) continue
    assert.equal(headings[0], 1, relative(DIST, file))
    assert.equal(headings.filter((level) => level === 1).length, 1)
    for (let index = 1; index < headings.length; index++) {
      assert.ok(
        headings[index] <= headings[index - 1] + 1,
        `${relative(DIST, file)}: ${headings.join(',')}`
      )
    }
  }

  assert.equal(new Set(descriptions).size, descriptions.length)
})

test('directory size and generated Open Graph images remain intact', async () => {
  const blogs = await readFile(join(DIST, 'blogs.html'), 'utf8')
  const catalogue = JSON.parse(await readFile('data/blogs.json', 'utf8'))
  const renderedBlogCount = (blogs.match(/class="blog-health-link/g) ?? [])
    .length
  assert.ok(catalogue.length > 0)
  assert.equal(renderedBlogCount, catalogue.length)

  const collections = (await readdir('docs/collections')).filter((file) =>
    file.endsWith('.md')
  )
  assert.equal(collections.length + 1, 10)
  assert.ok(await readFile('docs/personal-writing.md', 'utf8'))

  const files = (await htmlFiles()).filter((file) => !file.endsWith('404.html'))
  for (const file of files) {
    const html = await readFile(file, 'utf8')
    const image = meta(html, 'property', 'og:image')
    assert.ok(image?.startsWith(ORIGIN), relative(DIST, file))
    const imagePath = new URL(image).pathname.replace(/^\//, '')
    await assert.doesNotReject(readFile(join(DIST, imagePath)))
  }
})
