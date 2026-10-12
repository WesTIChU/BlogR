import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import test from 'node:test'

const DIST = resolve('docs/.vitepress/dist')

test('renders stable RSS metadata slots in generated HTML', async () => {
  const html = await readFile(
    join(DIST, 'collections/travel-outdoors.html'),
    'utf8'
  )

  assert.match(
    html,
    /data-blog-url="https:\/\/roadtothesea\.com\/"[^>]*>.*?data-blog-feed-slot/s
  )
  assert.match(
    html,
    /data-blog-url="https:\/\/roadtothesea\.com\/"[^>]*>.*?data-blog-update-slot/s
  )
  assert.doesNotMatch(html, /href="https:\/\/roadtothesea\.com\/feed\//)
})

test('keeps the runtime RSS slot empty for blogs without metadata', async () => {
  const html = await readFile(join(DIST, 'personal-writing.html'), 'utf8')
  const nameIndex = html.indexOf('BlogSharer')
  const metadataIndex = html.indexOf('data-blog-url="https://blogsharer.com/"')
  const blog = html.slice(
    metadataIndex,
    html.indexOf('</li>', nameIndex) + '</li>'.length
  )

  assert.notEqual(nameIndex, -1)
  assert.notEqual(metadataIndex, -1)
  assert.match(blog, /data-blog-feed-slot/)
  assert.equal(blog.includes('href="https://blogsharer.com/'), false)
})
