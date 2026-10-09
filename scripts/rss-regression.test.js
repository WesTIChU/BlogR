import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'

const DIST = resolve('docs/.vitepress/dist')

test('renders verified RSS links with accessible labels', async () => {
  const html = await readFile(
    join(DIST, 'collections/travel-outdoors.html'),
    'utf8'
  )

  assert.match(
    html,
    /href="https:\/\/roadtothesea\.com\/feed\/"[^>]*aria-label="RSS feed for Road to the Sea"[^>]*target="_blank"/
  )
  assert.match(html, /class="blog-feed-icon"/)
})

test('does not render an RSS link when no verified feed exists', async () => {
  const html = await readFile(join(DIST, 'personal-writing.html'), 'utf8')
  const nameIndex = html.indexOf('BlogSharer')
  const blog = html.slice(
    html.lastIndexOf('<li>', nameIndex),
    html.indexOf('</li>', nameIndex) + '</li>'.length
  )

  assert.notEqual(nameIndex, -1)
  assert.equal(blog.includes('blog-feed-link'), false)
})
