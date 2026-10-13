import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import taxonomy from '../data/blog-taxonomy.json' with { type: 'json' }
import blogs from '../data/blogs.json' with { type: 'json' }
import communities from '../data/communities.json' with { type: 'json' }
import communityTaxonomy from '../data/community-taxonomy.json' with { type: 'json' }
import { getRecentlyAddedGroups } from '../shared/recently-added.js'
import {
  communityPage,
  compareBlogNames,
  compareBlogs,
  compareCommunities,
  compareCommunityCategories,
  countryPage,
  groupByCategory,
  groupByCountry,
  groupBySubsection,
  page,
  validateBlogs,
  validateCommunities
} from './generate-blog-pages.js'

test('validates current blogs and groups subcategories alphabetically', () => {
  validateBlogs(blogs)
  assert.equal(blogs.length, 525)
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

test('classifies dedicated smart-home blogs separately from self-hosting blogs', () => {
  const sections = groupBySubsection(
    'technology',
    blogs.filter(({ category }) => category === 'technology')
  )
  const entries = (title) =>
    sections
      .find((section) => section.title === title)
      .entries.map(({ name }) => name)

  assert.deepEqual(entries('Smart Homes & Automation'), [
    'Awesome Home Assistant',
    'Derek Seaman',
    'Everything Smart Home',
    'Home Automation Guy',
    'HomeTechHacker',
    'Kiril Peyanski',
    'Smart Home Junkie',
    'SmartHomeScene',
    'The Home Assistant Blog'
  ])
  assert.deepEqual(entries('Self-Hosting & Homelabs'), [
    'Awesome Selfhosted',
    "Justin's IT Blog",
    'LinuxServer.io Blog',
    'Open Pi',
    'Perfect Media Server',
    'SmarthomeBeginner',
    'tyzbit.blog'
  ])
})

test('shows the three latest horror additions in Today by precise addition time', () => {
  const names = new Set([
    'Horror Society',
    'Oldstyle Tales',
    'Horror Movie Blog'
  ])
  const today = getRecentlyAddedGroups(
    blogs,
    new Date('2026-10-11T12:00:00.000Z')
  ).find(({ key }) => key === 'today')

  assert.deepEqual(
    today.blogs.filter(({ name }) => names.has(name)).map(({ name }) => name),
    ['Horror Society', 'Oldstyle Tales', 'Horror Movie Blog']
  )
  for (const blog of blogs.filter(({ name }) => names.has(name))) {
    assert.equal(blog.addedDate, '2026-10-11')
    assert.equal(blog.addedAt, '2026-10-11T09:06:33.822Z')
  }
})

test('renders directory descriptions in clampable spans', async () => {
  const generatedPage = await readFile('docs/blogs.md', 'utf8')
  const layout = await readFile('docs/.vitepress/theme/Layout.vue', 'utf8')
  const search = await readFile(
    'docs/.vitepress/theme/components/VPLocalSearchBox.vue',
    'utf8'
  )

  assert.match(
    generatedPage,
    /<span class="blog-entry"><strong class="blog-health-link"><a/
  )
  assert.match(layout, /-webkit-line-clamp: 3/)
  assert.match(layout, /line-clamp: 3/)
  assert.match(search, /-webkit-line-clamp: 3/)
  assert.match(search, /line-clamp: 3/)
})

test('groups country pages by assigned country and excludes unknown countries', async () => {
  const groups = groupByCountry([
    {
      name: 'Scotland Blog',
      url: 'https://scotland.example',
      country: 'GB-SCT'
    },
    { name: 'UK Blog', url: 'https://uk.example', country: 'GB' },
    { name: 'Unknown Blog', url: 'https://unknown.example', country: null },
    { name: 'US Blog', url: 'https://us.example', country: 'US' }
  ])

  assert.deepEqual(
    groups.map(({ country }) => country.name),
    ['Scotland', 'United Kingdom', 'United States']
  )
  assert.deepEqual(
    groups[0].entries.map(({ name }) => name),
    ['Scotland Blog']
  )
  assert.deepEqual(
    groups[1].entries.map(({ name }) => name),
    ['UK Blog']
  )
  assert.equal(
    groups.some(({ entries }) =>
      entries.some(({ name }) => name === 'Unknown Blog')
    ),
    false
  )

  const scotlandPage = await readFile('docs/country/scotland.md', 'utf8')
  const currentScotland = groupByCountry(blogs).find(
    ({ country }) => country.code === 'GB-SCT'
  )
  assert.match(scotlandPage, /title: Scotland Blogs/)
  assert.match(
    scotlandPage,
    new RegExp(`${currentScotland.entries.length} blogs listed in Scotland`)
  )
  assert.match(scotlandPage, /<CountryDirectoryHeader[^>]+name="Scotland"/)
  assert.doesNotMatch(scotlandPage, /^# .*Scotland$/m)
  assert.match(scotlandPage, /class="blog-health-link"><a/)

  const unitedStatesPage = await readFile(
    'docs/country/united-states.md',
    'utf8'
  )
  assert.match(unitedStatesPage, /Spooky Little Halloween/)
  assert.match(unitedStatesPage, /Halloween Love/)
  assert.match(unitedStatesPage, /Pumpkinrot/)
  assert.match(unitedStatesPage, /Justine's Halloween/)
  assert.match(unitedStatesPage, /Spooky Little Girl Like You/)
  assert.match(unitedStatesPage, /Horror Society/)
  assert.match(unitedStatesPage, /Oldstyle Tales/)
  assert.match(
    unitedStatesPage,
    /## Arts &amp; Entertainment|## Arts & Entertainment/
  )
  assert.match(
    unitedStatesPage,
    /### Film, TV &amp; Theatre|### Film, TV & Theatre/
  )
  assert.match(
    unitedStatesPage,
    /## Lifestyle &amp; Hobbies|## Lifestyle & Hobbies/
  )
  assert.match(unitedStatesPage, /### Gardening/)

  const englandPage = await readFile('docs/country/england.md', 'utf8')
  assert.match(englandPage, /This Is Horror/)
  assert.match(englandPage, /### Halloween &amp; Horror|### Halloween & Horror/)

  const entertainmentPage = await readFile(
    'docs/collections/arts-and-entertainment.md',
    'utf8'
  )
  assert.match(
    entertainmentPage,
    /## Halloween &amp; Horror|## Halloween & Horror/
  )
  for (const name of [
    'Spooky Little Halloween',
    'Pumpkinrot',
    "Justine's Halloween",
    'Halloween Love',
    'The Horrors of Halloween',
    'Spooky Little Girl Like You',
    'This Is Horror',
    'Horror Society',
    'Oldstyle Tales',
    'Horror Movie Blog',
    'Final Girl',
    'Darren Van Dam',
    'Strange Little Girl'
  ]) {
    assert.match(
      entertainmentPage,
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    )
  }

  const lifestylePage = await readFile(
    'docs/collections/lifestyle-and-hobbies.md',
    'utf8'
  )
  for (const name of [
    'Spooky Little Halloween',
    'Pumpkinrot',
    "Justine's Halloween",
    'Strange Little Girl'
  ]) {
    assert.doesNotMatch(
      lifestylePage,
      new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    )
  }

  const generated = countryPage({ flag: '🇦🇺', name: 'Australia' }, [
    {
      name: 'Example',
      description: 'Example description',
      url: 'https://example.com',
      category: 'technology',
      subcategory: 'Programming & Development'
    },
    {
      name: 'Earlier Example',
      description: 'Earlier description',
      url: 'https://earlier.example',
      category: 'technology',
      subcategory: 'Programming & Development'
    }
  ])
  assert.match(
    generated,
    /<CountryDirectoryHeader flag="🇦🇺" name="Australia" :count="2" \/>/
  )
  assert.match(generated, /title: Australia Blogs/)
  assert.match(generated, /## Technology/)
  assert.match(generated, /### Programming & Development/)
  assert.ok(generated.indexOf('Earlier Example') < generated.indexOf('Example'))
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

test('accepts optional country codes and rejects invalid country values', () => {
  assert.doesNotThrow(() =>
    validateBlogs([
      {
        name: 'Canadian Blog',
        url: 'https://canadian.example',
        category: 'technology',
        country: 'CA'
      },
      {
        name: 'Legacy Blog',
        url: 'https://legacy.example',
        category: 'technology'
      }
    ])
  )
  assert.throws(
    () =>
      validateBlogs([
        {
          name: 'Unknown Country Blog',
          url: 'https://unknown-country.example',
          category: 'technology',
          country: 'ZZ'
        }
      ]),
    /Invalid country code/
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

test('renders permanent addition dates in static metadata', () => {
  const markdown = page('Example', 'Description', [
    {
      name: 'Example Blog',
      url: 'https://example.com',
      description: 'Example',
      addedDate: '2026-10-09'
    }
  ])

  assert.match(
    markdown,
    /<span class="blog-added-date">Added&nbsp;9 October 2026<\/span>/
  )
})

test('keeps volatile RSS metadata in runtime slots', () => {
  const markdown = page('Example', 'Description', [
    {
      name: 'Example Blog',
      url: 'https://example.com',
      description: 'Example',
      addedDate: '2026-10-09'
    }
  ])

  assert.match(markdown, /data-blog-feed-slot/)
  assert.match(markdown, /data-blog-update-slot/)
  assert.doesNotMatch(markdown, /blog-feed-link/)
  assert.doesNotMatch(markdown, /Last updated&nbsp;/)
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

test('groups All Blogs by alphabetically ordered categories and blog names', () => {
  const entries = [
    {
      name: 'Zulu Blog',
      url: 'https://zulu.example',
      description: '',
      category: 'technology',
      favourite: true
    },
    {
      name: '10th Blog',
      url: 'https://ten.example',
      description: '',
      category: 'technology',
      favourite: false
    },
    {
      name: '2nd Blog',
      url: 'https://two.example',
      description: '',
      category: 'technology',
      favourite: false
    },
    {
      name: 'alpha blog',
      url: 'https://alpha.example',
      description: '',
      category: 'technology',
      favourite: false
    },
    {
      name: 'Culture Blog',
      url: 'https://culture.example',
      description: '',
      category: 'culture-and-places',
      favourite: false
    }
  ]
  const sections = groupByCategory(entries)
  assert.deepEqual(
    sections.map(({ title }) => title),
    ['Culture & Places', 'Technology']
  )
  assert.deepEqual(
    sections
      .find(({ title }) => title === 'Technology')
      .entries.map(({ name }) => name),
    ['Zulu Blog', '2nd Blog', '10th Blog', 'alpha blog']
  )
  assert.equal(
    compareBlogNames(
      { name: '2nd Blog', url: 'https://two.example' },
      { name: '10th Blog', url: 'https://ten.example' }
    ) < 0,
    true
  )
})

test('sorts favourites first within each All Blogs subcategory', () => {
  const entries = [
    {
      name: 'Zulu Favourite',
      url: 'https://zulu.example',
      description: '',
      category: 'technology',
      subcategory: 'Programming & Development',
      favourite: true
    },
    {
      name: 'Alpha Blog',
      url: 'https://alpha.example',
      description: '',
      category: 'technology',
      subcategory: 'Programming & Development',
      favourite: false
    },
    {
      name: 'Alpha Favourite',
      url: 'https://alpha-favourite.example',
      description: '',
      category: 'technology',
      subcategory: 'Programming & Development',
      favourite: true
    },
    {
      name: 'Zulu Blog',
      url: 'https://zulu-blog.example',
      description: '',
      category: 'technology',
      subcategory: 'Programming & Development',
      favourite: false
    }
  ]

  const subsection = groupByCategory(entries)
    .find(({ title }) => title === 'Technology')
    .subsections.find(({ title }) => title === 'Programming & Development')
  assert.deepEqual(
    subsection.entries.map(({ name }) => name),
    ['Alpha Favourite', 'Zulu Favourite', 'Alpha Blog', 'Zulu Blog']
  )
  assert.deepEqual(
    groupBySubsection('technology', entries)
      .find(({ title }) => title === 'Programming & Development')
      .entries.map(({ name }) => name),
    ['Alpha Favourite', 'Zulu Favourite', 'Alpha Blog', 'Zulu Blog']
  )
})

test('renders every blog exactly once in the grouped All Blogs page', () => {
  const markdown = page(
    'All Blogs',
    'Description',
    blogs,
    groupByCategory(blogs)
  )
  const renderedCount = groupByCategory(blogs).reduce(
    (total, section) => total + section.entries.length,
    0
  )
  assert.equal(renderedCount, blogs.length)
  assert.equal(new Set(blogs.map(({ url }) => url)).size, blogs.length)
  for (const blog of blogs) {
    assert.match(markdown, new RegExp(`data-blog-url="${blog.url}"`))
  }
})

test('renders nested category headings and preserves blog metadata', () => {
  const markdown = page(
    'All Blogs',
    'Description',
    blogs,
    groupByCategory(blogs)
  )
  const mainHeadings = [...markdown.matchAll(/^## (.+)$/gm)].map(
    ([, title]) => title
  )
  const subHeadings = [...markdown.matchAll(/^### (.+)$/gm)].map(
    ([, title]) => title
  )
  assert.equal(mainHeadings.length, taxonomy.categories.length)
  assert.equal(
    subHeadings.length,
    groupByCategory(blogs).reduce(
      (total, section) =>
        total +
        section.subsections.filter((subcategory) => subcategory.entries.length)
          .length,
      0
    )
  )
  assert.match(
    markdown,
    /<strong class="blog-health-link"><a href="http:\/\/www\.16bit\.com\/"[^>]*>16bit\.com<\/a><\/strong>/
  )
  assert.match(markdown, /data-blog-url="http:\/\/www\.16bit\.com\/"/)
  assert.equal(
    groupBySubsection(
      'lifestyle-and-hobbies',
      blogs.filter(({ category }) => category === 'lifestyle-and-hobbies')
    )
      .find(({ title }) => title === 'Collecting & Memorabilia')
      .entries.some(({ name }) => name === 'Project Sword Toys'),
    true
  )
})

test('keeps the separate community catalogue complete and unique', () => {
  validateCommunities(communities)
  assert.equal(communities.length, 45)
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
  assert.match(markdown, /data-blog-community="true"/)
  assert.match(markdown, /data-health-relative/)
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
