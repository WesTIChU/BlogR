import assert from 'node:assert/strict'
import test from 'node:test'
import taxonomy from '../data/blog-taxonomy.json' with { type: 'json' }
import blogs from '../data/blogs.json' with { type: 'json' }
import {
  compareBlogs,
  groupBySubsection,
  page,
  validateBlogs
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
