import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import taxonomy from '../data/blog-taxonomy.json' with { type: 'json' }
import blogs from '../data/blogs.json' with { type: 'json' }
import communities from '../data/communities.json' with { type: 'json' }
import communityTaxonomy from '../data/community-taxonomy.json' with { type: 'json' }
import {
  communityPage,
  compareBlogs,
  compareCommunities,
  compareCommunityCategories,
  groupBySubsection,
  page,
  validateBlogs,
  validateCommunities
} from './generate-blog-pages.js'

test('validates current blogs and groups subcategories alphabetically', () => {
  validateBlogs(blogs)
  const sections = groupBySubsection('arts-and-entertainment', [
    {
      name: 'Zulu',
      description: '',
      category: 'arts-and-entertainment',
      subcategory: 'Zed'
    },
    {
      name: 'Alpha',
      description: '',
      category: 'arts-and-entertainment',
      subcategory: 'Zed'
    },
    {
      name: 'Bravo',
      description: '',
      category: 'arts-and-entertainment',
      subcategory: 'Alpha'
    }
  ])

  assert.deepEqual(
    sections
      .filter((section) => section.entries.length)
      .map((section) => section.title),
    ['Alpha', 'Zed']
  )
  assert.deepEqual(
    sections
      .find((section) => section.title === 'Zed')
      .entries.map(({ name }) => name),
    ['Alpha', 'Zulu']
  )
})

test('trims duplicate subcategory names and rejects malformed values', () => {
  const sections = groupBySubsection('arts-and-entertainment', [
    { name: 'One', description: '', subcategory: '  New Topic  ' },
    { name: 'Two', description: '', subcategory: 'new   topic' }
  ])
  const section = sections.find((candidate) => candidate.title === 'New Topic')
  assert.equal(section.entries.length, 2)

  for (const subcategory of ['', [], {}]) {
    assert.throws(
      () =>
        groupBySubsection('arts-and-entertainment', [
          { name: 'Broken', description: '', subcategory }
        ]),
      /Invalid subcategory/
    )
  }
})

test('rejects subcategories that duplicate main category names', () => {
  assert.throws(
    () =>
      groupBySubsection('arts-and-entertainment', [
        {
          name: 'Wrongly Nested',
          description: '',
          category: 'arts-and-entertainment',
          subcategory: ' books   & writing '
        }
      ]),
    /Set category to "books-and-writing"/
  )
})

test('rejects invalid main-category slugs', () => {
  assert.throws(
    () =>
      validateBlogs([
        {
          name: 'Unknown',
          url: 'https://unknown.example',
          category: 'not-a-category'
        }
      ]),
    /Invalid category/
  )
})

test('places every blog in exactly one generated category section', () => {
  const groupedCount = taxonomy.categories.reduce((total, { slug }) => {
    const entries = blogs.filter((blog) => blog.category === slug)
    return (
      total +
      groupBySubsection(slug, entries).reduce(
        (sectionTotal, section) => sectionTotal + section.entries.length,
        0
      )
    )
  }, 0)

  assert.equal(groupedCount, blogs.length)
})

test('renders discovered headings as normal markdown headings', () => {
  const markdown = page(
    'Example',
    'Description',
    [],
    [
      {
        title: 'New Topic',
        entries: [
          {
            name: 'Example Blog',
            url: 'https://example.com',
            description: 'Example'
          }
        ]
      }
    ]
  )
  assert.match(markdown, /## New Topic/)
})

test('passes permanent addition dates to the shared metadata component', () => {
  const markdown = page('Example', 'Description', [
    {
      name: 'Example Blog',
      url: 'https://example.com',
      description: 'Example',
      addedDate: '2026-10-09'
    }
  ])

  assert.match(markdown, /<BlogLastUpdated[^>]+added-date="2026-10-09"/)
})

test('keeps favourite blogs before alphabetical non-favourites', () => {
  const entries = [
    {
      name: 'Zulu',
      url: 'https://zulu.example',
      description: 'Zulu',
      favourite: false
    },
    {
      name: 'Bravo',
      url: 'https://bravo.example',
      description: 'Bravo',
      favourite: true
    },
    {
      name: 'Alpha',
      url: 'https://alpha.example',
      description: 'Alpha',
      favourite: true
    }
  ]
  entries.sort(compareBlogs)
  assert.deepEqual(
    entries.map(({ name }) => name),
    ['Alpha', 'Bravo', 'Zulu']
  )
})

test('keeps the separate community catalogue complete and unique', () => {
  validateCommunities(communities)
  assert.equal(communities.length, 36)
  assert.deepEqual(
    [...new Set(communities.map((community) => community.section))],
    ['forums', 'independent-communities']
  )
  assert.equal(
    new Set(communities.map((community) => community.category)).size,
    8
  )
})

test('generates community sections and preserves favourite metadata', () => {
  const markdown = communityPage([
    {
      id: 'example-forum',
      name: 'Example Forum',
      url: 'https://example.com/forum',
      description: 'A discussion forum for a specific subject.',
      section: 'forums',
      category: 'technology',
      favourite: true
    },
    {
      id: 'example-community',
      name: 'Example Community',
      url: 'https://example.com/community',
      description: 'An independent community for shared interests.',
      section: 'independent-communities',
      category: 'gaming',
      favourite: false
    }
  ])

  assert.match(markdown, /## Technology/)
  assert.match(markdown, /## Gaming/)
  assert.match(markdown, /BlogLastUpdated[^>]+:community="true"/)
  assert.match(markdown, /BlogLastUpdated/)
  assert.doesNotMatch(markdown, /WebsiteAvailability|rss/i)
})

test('sorts communities naturally within each category', () => {
  const entries = [
    {
      id: 'beta',
      name: 'beta community',
      url: 'https://beta.example',
      description: 'Beta',
      section: 'forums',
      category: 'technology'
    },
    {
      id: 'ten',
      name: '10th Community',
      url: 'https://ten.example',
      description: 'Ten',
      section: 'forums',
      category: 'technology'
    },
    {
      id: 'two',
      name: '2nd Community',
      url: 'https://two.example',
      description: 'Two',
      section: 'forums',
      category: 'technology'
    },
    {
      id: 'alpha',
      name: 'Alpha Community',
      url: 'https://alpha.example',
      description: 'Alpha',
      section: 'forums',
      category: 'technology'
    }
  ]
  const markdown = communityPage(entries)
  const positions = [
    '2nd Community',
    '10th Community',
    'Alpha Community',
    'beta community'
  ].map((name) => markdown.indexOf(`<strong>${name}</strong>`))
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b)
  )
  assert.equal(
    compareCommunities({ name: 'Arsenal Mania' }, { name: 'beta' }) < 0,
    true
  )
})

test('places Arsenal Mania in alphabetical order among Football & Sports communities', () => {
  const football = communities.filter(
    ({ category }) => category === 'football-and-sports'
  )
  const expected = football
    .map(({ name }) => name)
    .sort((a, b) => compareCommunities({ name: a }, { name: b }))
  const markdown = communityPage(communities)
  const footballSection = markdown.slice(
    markdown.indexOf('## Football & Sports'),
    markdown.indexOf('\n## ', markdown.indexOf('## Football & Sports') + 3)
  )
  const actual = expected.map((name) =>
    footballSection.indexOf(`<strong>${name}</strong>`)
  )
  assert.deepEqual(
    actual,
    [...actual].sort((a, b) => a - b)
  )
  assert.match(footballSection, /<strong>Arsenal Mania<\/strong>/)
})

test('sorts community categories alphabetically by display title', () => {
  const markdown = communityPage(communities)
  const actual = [...markdown.matchAll(/^## (.+)$/gm)].map(([, title]) => title)
  const expected = communityTaxonomy
    .map(({ title }) => title)
    .sort((a, b) => compareCommunityCategories({ title: a }, { title: b }))
  assert.deepEqual(actual, expected)
})

test('renders every community exactly once under its subject category', () => {
  const markdown = communityPage(communities)
  for (const community of communities) {
    assert.equal(markdown.split(community.url).length - 1, 2)
  }
  for (const { title } of communityTaxonomy) {
    assert.match(markdown, new RegExp(`## ${title}`))
  }
})

test('keeps one Online Communities navigation entry and the main page', async () => {
  const shared = await readFile(
    new URL('../docs/.vitepress/shared.ts', import.meta.url),
    'utf8'
  )
  assert.match(shared, /Online Communities/)
  assert.match(shared, /link: '\/communities\/online-communities'/)
  assert.doesNotMatch(shared, /communityTaxonomy|communities\/\$\{path\}/)

  const page = await readFile(
    new URL('../docs/communities/online-communities.md', import.meta.url),
    'utf8'
  )
  assert.match(page, /title: Online Communities/)
  assert.match(page, /# Online Communities/)
})
