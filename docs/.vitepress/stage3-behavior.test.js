import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { URL } from 'node:url'
import MiniSearch from 'minisearch'

async function readSearchIndex() {
  const chunks = await readdir(
    new URL('./dist/assets/chunks/', import.meta.url)
  )
  const filename = chunks.find((name) =>
    name.startsWith('@localSearchIndexroot.')
  )
  assert.ok(filename, 'the built local search index exists')

  const source = await readFile(
    new URL(`./dist/assets/chunks/${filename}`, import.meta.url),
    'utf8'
  )
  const serialized = source.match(/^const e=`([\s\S]*)`;export/)
  assert.ok(
    serialized,
    'the local search index has the expected VitePress shape'
  )
  return JSON.parse(serialized[1])
}

async function createSearchIndex() {
  const raw = await readSearchIndex()
  return MiniSearch.loadJS(raw, {
    fields: ['title', 'titles', 'text'],
    storeFields: ['title', 'titles'],
    tokenize: (text) =>
      text
        .replace(/\u2060|\u200B|\u200C|\u200D|\uFEFF/g, '')
        .split(/[\n\r #%*,=/:;?[\]{}()&]+/u)
        .filter(Boolean),
    searchOptions: {
      fuzzy: false,
      prefix: true,
      boost: { title: 4, text: 2, titles: 1 }
    }
  })
}

test('local search indexes blog names and descriptions', async () => {
  const index = await createSearchIndex()
  const nameResults = index.search('Coastal Walker', { combineWith: 'AND' })
  const descriptionResults = index.search('independent writing', {
    combineWith: 'AND'
  })

  assert.ok(nameResults.some(({ id }) => id.startsWith('/blogs#')))
  assert.ok(
    descriptionResults.some(
      ({ id }) => id === '/personal-writing#independent-voices'
    )
  )
})

test('local search preserves category and subcategory results', async () => {
  const index = await createSearchIndex()
  const results = index.search('blogging platforms', { combineWith: 'AND' })

  assert.ok(
    results.some(
      ({ id }) => id === '/resources/blogging-platforms#blogging-platforms'
    )
  )
  assert.ok(
    results.some(
      ({ id, title }) =>
        id === '/resources/blogging-platforms#hosted-platforms' &&
        title === 'Hosted Platforms'
    )
  )
})

test('search index retains result anchors and directory link metadata', async () => {
  const raw = await readSearchIndex()
  const metadata = raw.customMetadata
  const entry = metadata['/collections/arts-and-creativity#comics-illustration']

  assert.ok(entry)
  assert.ok(entry.l.includes('chaoslife'))
  assert.ok(entry.u.includes('chaoslife.findchaos.com/comic'))
  assert.ok(
    Object.keys(metadata).some((id) => id.includes('#hosted-platforms'))
  )
})

test('search component retains modal, keyboard, navigation, excerpt, and mobile hooks', async () => {
  const source = await readFile(
    new URL('./theme/components/VPLocalSearchBox.vue', import.meta.url),
    'utf8'
  )

  for (const marker of [
    'useFocusTrap',
    "onKeyStroke('ArrowDown'",
    "onKeyStroke('ArrowUp'",
    "onKeyStroke('Enter'",
    "onKeyStroke('Escape'",
    'sanitizeRichHtml',
    'sanitizeSearchHtml',
    'navigateToResult',
    'markRegExp',
    'VPLocalSearchBox'
  ]) {
    assert.ok(
      source.includes(marker),
      `search behaviour marker remains: ${marker}`
    )
  }
})

test('representative generated pages retain anchors and links', async () => {
  const checks = [
    ['collections/arts-and-creativity.html', 'comics-illustration', true],
    ['resources/blogging-platforms.html', 'hosted-platforms', true],
    ['communities/online-communities.html', 'forums', true],
    ['recently-added.html', 'Recently Added', false]
  ]

  for (const [route, anchor, hasExternalLink] of checks) {
    const html = await readFile(
      new URL(`./dist/${route}`, import.meta.url),
      'utf8'
    )
    assert.ok(
      html.includes('blog-health-link') ||
        route === 'resources/blogging-platforms.html' ||
        route === 'communities/online-communities.html'
    )
    assert.ok(html.includes('starred'))
    assert.ok(html.includes('index'))
    if (hasExternalLink) {
      assert.match(html, new RegExp(`id="${anchor}"`))
      assert.match(html, new RegExp(`href="#${anchor}"`))
      assert.match(html, /target="_blank"/)
    } else {
      assert.ok(html.includes(anchor))
    }
  }
})

test('metadata and RSS output remain generated', async () => {
  const homepage = await readFile(
    new URL('./dist/index.html', import.meta.url),
    'utf8'
  )
  const rss = await readFile(
    new URL('./dist/feed.rss', import.meta.url),
    'utf8'
  )

  assert.match(homepage, /<meta name="description"/)
  assert.match(homepage, /og:title|og:description/)
  assert.match(rss, /BlogR Directory/)
})
