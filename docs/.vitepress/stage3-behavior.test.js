import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { URL } from 'node:url'
import MiniSearch from 'minisearch'
import blogs from '../../data/blogs.json' with { type: 'json' }
import { getRecentlyAddedGroups } from '../../shared/recently-added.js'

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
  // The generated chunk stores JSON inside a JavaScript template literal, so
  // decode its escaped backslashes before parsing the JSON payload.
  return JSON.parse(serialized[1].replaceAll('\\\\', '\\'))
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
    },
    processTerm: (term, fieldName) => {
      term = term.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
      const stopWords = new Set([
        'frontmatter',
        '$frontmatter.synopsis',
        'and',
        'about',
        'but',
        'now',
        'the',
        'with',
        'you'
      ])
      if (term.length < 2 || stopWords.has(term)) return false
      if (fieldName === 'text' && term.includes('.')) {
        return [term, ...term.split('.')]
          .filter((part) => part.length >= 2)
          .filter((part) => !stopWords.has(part))
      }
      return term
    }
  })
}

test('local search indexes blog names and descriptions', async () => {
  const index = await createSearchIndex()
  const nameResults = index.search('Bisha Underground', { combineWith: 'AND' })
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

test('every catalogue blog is searchable by exact title and links to its listing', async () => {
  const raw = await readSearchIndex()
  const index = await createSearchIndex()
  const metadata = raw.customMetadata
  const missing = []

  for (const blog of blogs) {
    const host = new URL(blog.url).host.toLowerCase().replace(/^www\./, '')
    const result = index
      .search(blog.name, { combineWith: 'AND' })
      .find(({ id }) => metadata[id]?.u?.some((url) => url.includes(host)))
    if (!result) missing.push(blog.name)
  }

  assert.deepEqual(missing, [])
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
  const entry =
    metadata['/collections/arts-and-entertainment#comics-illustration']

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
    ['collections/arts-and-entertainment.html', 'comics-illustration', true],
    ['collections/arts-and-entertainment.html', 'gaming', true],
    ['resources/blogging-platforms.html', 'hosted-platforms', true],
    ['communities/online-communities.html', 'technology', true],
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

test('recently added sections expose stable direct-navigation anchors', async () => {
  const html = await readFile(
    new URL('./dist/recently-added.html', import.meta.url),
    'utf8'
  )
  const sectionIds = [...html.matchAll(/<h2[^>]+id="([^"]+)"/g)].map(
    ([, id]) => id
  )

  assert.deepEqual(
    sectionIds,
    getRecentlyAddedGroups(blogs, new Date()).map(({ key }) => key)
  )
  assert.equal(new Set(sectionIds).size, sectionIds.length)
})

test('recently added listings render Webring triggers for catalogue entries', async () => {
  const html = await readFile(
    new URL('./dist/recently-added.html', import.meta.url),
    'utf8'
  )
  const expected = getRecentlyAddedGroups(blogs, new Date()).reduce(
    (total, group) =>
      total + group.blogs.filter((blog) => blog.webringId).length,
    0
  )
  assert.equal((html.match(/blog-webring-trigger/g) ?? []).length, expected)
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
