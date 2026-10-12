import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import blogUpdates from '../data/blog-updates.json' with { type: 'json' }
import { getBlogLinkAttributes } from '../shared/blog-link.js'
import {
  formatRelativeDate,
  getBlogUpdate,
  getVerifiedFeedUrl
} from '../shared/blog-update.js'
import {
  countryPath,
  getCountryInfo,
  normalizeCountryCode
} from '../shared/countries.js'
import { formatAddedDate } from '../shared/recently-added.js'

const blogs = JSON.parse(await readFile(resolve('data/blogs.json'), 'utf8'))
const communities = JSON.parse(
  await readFile(resolve('data/communities.json'), 'utf8')
)
const communityTaxonomy = JSON.parse(
  await readFile(resolve('data/community-taxonomy.json'), 'utf8')
)

const taxonomy = JSON.parse(
  await readFile(resolve('data/blog-taxonomy.json'), 'utf8')
)
const categories = taxonomy.categories
const recentlyAddedDescription =
  'Fresh faces, new stories and plenty worth reading. Explore the latest independent blogs and personal websites to join the BlogR directory.'
const subsectionRules = Object.fromEntries(
  categories.map((category) => [
    category.slug,
    category.subsections.map((subsection) => ({
      ...subsection,
      matches: new RegExp(subsection.match, 'i')
    }))
  ])
)

const attribute = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
export const compareBlogs = (a, b) =>
  Number(Boolean(b.favourite)) - Number(Boolean(a.favourite)) ||
  compareBlogNames(a, b)
export const compareBlogNames = (a, b) =>
  a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base'
  }) || a.url.localeCompare(b.url)
export const compareCommunities = (a, b) =>
  a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base'
  })
export const compareCommunityCategories = (a, b) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

const renderBlogDetails = (entry, now = new Date()) => {
  const community = Boolean(entry.community)
  const update = community ? null : getBlogUpdate(blogUpdates, entry.url)
  const relativeUpdate =
    update?.status === 'success'
      ? formatRelativeDate(update.lastPublished, now)
      : null
  const feedUrl = community ? null : getVerifiedFeedUrl(blogUpdates, entry.url)
  const country = community ? null : getCountryInfo(entry.country)
  const countryUrl = country ? countryPath(country) : null
  const statusTooltip =
    'Health status: Unknown or stale. Last checked: not available.'
  const details = []

  if (entry.favourite) {
    details.push(
      '<span class="blog-favourite" aria-label="Favourite">⭐</span>'
    )
  }

  if (feedUrl) {
    const feedLabel = `RSS feed for ${entry.name}`
    details.push(
      `<a class="blog-feed-link" href="${attribute(feedUrl)}" aria-label="${attribute(feedLabel)}" title="${attribute(feedLabel)}" target="_blank" rel="noopener noreferrer"><svg class="blog-feed-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path><path d="M4 4a16 16 0 0 1 16 16"></path><path d="M4 10a10 10 0 0 1 10 10"></path></svg></a>`
    )
  }

  details.push(
    `<span class="blog-health-dot" style="background-color:#94A3B8;" title="${statusTooltip}" aria-label="${statusTooltip}" role="img"></span>`
  )

  if (country && countryUrl) {
    details.push(
      '<span class="blog-metadata-separator" aria-hidden="true">·</span>',
      `<a class="blog-country" href="${attribute(countryUrl)}" aria-label="${attribute(`Based in ${country.name}`)}"><span aria-hidden="true">${country.flag}</span> ${attribute(country.name)}</a>`
    )
  }

  if (country && relativeUpdate) {
    details.push(
      '<span class="blog-metadata-separator" aria-hidden="true">·</span>'
    )
  }

  if (relativeUpdate) {
    details.push(
      `<span title="${attribute(`Last updated: ${update.lastPublished}`)}" aria-label="${attribute(`Last updated: ${update.lastPublished}`)}">Last updated&nbsp;${attribute(relativeUpdate)}</span>`
    )
  }

  if (community) {
    details.push('<span data-health-relative></span>')
  }

  const addedDate = formatAddedDate(entry.addedDate)
  if (addedDate) {
    if (relativeUpdate) {
      details.push(
        '<span class="blog-metadata-separator" aria-hidden="true">·</span>'
      )
    }
    details.push(
      `<span class="blog-added-date">Added&nbsp;${attribute(addedDate)}</span>`
    )
  }

  details.push('<span class="blog-health-sr-only">Unknown or stale</span>')

  const communityAttribute = community ? ' data-blog-community="true"' : ''
  return `<span class="blog-last-updated" data-blog-details data-blog-url="${attribute(entry.url)}"${communityAttribute}>${details.join('')}</span>`
}

const renderBlogLink = (blog) => {
  const linkAttributes = getBlogLinkAttributes(blog.url)
  const target = linkAttributes.target
    ? ` target="${attribute(linkAttributes.target)}"`
    : ''
  const rel = linkAttributes.rel
    ? ` rel="${attribute(linkAttributes.rel)}"`
    : ''
  return `<strong class="blog-health-link"><a href="${attribute(blog.url)}"${target}${rel}>${attribute(blog.name)}</a></strong>`
}

const line = (blog) =>
  `* <span class="blog-entry">${renderBlogLink(blog)} - ${blog.description}</span>${renderBlogDetails(blog)}`
const renderBlogEntries = (entries) => entries.map(line).join('\n')

const communityLine = (community) =>
  `* <a href="${attribute(community.url)}" target="_blank" rel="noopener noreferrer"><strong>${attribute(community.name)}</strong></a> - ${community.description}${renderBlogDetails({ ...community, community: true })}`

const renderSections = (sections) =>
  sections
    .filter((section) => section.entries.length)
    .map(
      (section) =>
        `## ${section.title}\n\n${
          section.subsections
            ? section.subsections
                .filter((subcategory) => subcategory.entries.length)
                .map(
                  (subcategory) =>
                    `### ${subcategory.title}\n\n${renderBlogEntries(subcategory.entries)}`
                )
                .join('\n\n')
            : renderBlogEntries(section.entries)
        }`
    )
    .join('\n\n')

export function validateCommunities(entries) {
  const validCategories = new Set(communityTaxonomy.map(({ slug }) => slug))
  const validSections = new Set(['forums', 'independent-communities'])
  const seenIds = new Set()
  const seenUrls = new Set()

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid community entry: expected an object')
    }
    if (!entry.id || typeof entry.id !== 'string') {
      throw new Error(`Invalid community id for ${entry.name}`)
    }
    if (seenIds.has(entry.id)) {
      throw new Error(`Duplicate community id "${entry.id}"`)
    }
    if (seenUrls.has(entry.url)) {
      throw new Error(`Duplicate community URL "${entry.url}"`)
    }
    if (!validCategories.has(entry.category)) {
      throw new Error(
        `Invalid community category "${entry.category}" for ${entry.name}`
      )
    }
    if (!validSections.has(entry.section)) {
      throw new Error(
        `Invalid community section "${entry.section}" for ${entry.name}`
      )
    }
    seenIds.add(entry.id)
    seenUrls.add(entry.url)
  }
}

export function communityPage(
  entries,
  {
    title = 'Online Communities',
    description = 'Traditional discussion forums, smaller online communities, niche networks and independent discussion spaces.',
    grouped = true
  } = {}
) {
  const orderedCommunityTaxonomy = [...communityTaxonomy].sort(
    compareCommunityCategories
  )
  const body = grouped
    ? orderedCommunityTaxonomy
        .map(({ slug, title }) => {
          const categoryEntries = entries.filter(
            (entry) => entry.category === slug
          )
          if (!categoryEntries.length) return ''
          return `## ${title}\n\n${categoryEntries
            .sort(compareCommunities)
            .map(communityLine)
            .join('\n')}`
        })
        .filter(Boolean)
        .join('\n\n')
    : entries.map(communityLine).join('\n')

  const submissionLink =
    grouped && title === 'Online Communities'
      ? '\n[**► Submit a Community**](https://github.com/WesTIChU/BlogR/issues/new?template=submit-community.yml)\n'
      : ''
  return `---\ntitle: ${title}\ndescription: ${description}\n---\n\n<script setup>\n</script>\n\n# ${title}\n\n${description}\n${submissionLink}\n<hr class="blogr-intro-divider" aria-hidden="true" />\n\n${body}\n`
}

export function page(
  title,
  description,
  entries,
  sections,
  componentPath = './.vitepress/components/BlogHealthLink.vue',
  {
    frontmatterTitle = title,
    heading = `► ${title}`,
    additionalImports = '',
    introContent = ''
  } = {}
) {
  const body = sections
    ? renderSections(sections) ||
      '* No blogs are currently listed in this category yet.'
    : entries.length
      ? renderBlogEntries(entries)
      : '* No blogs are currently listed in this category yet.'
  const introDivider =
    '<hr class="blogr-intro-divider" aria-hidden="true" />\n\n'
  return `---\ntitle: ${frontmatterTitle}\ndescription: ${description}\n---\n\n<script setup>\n${additionalImports}</script>\n\n# ${heading}\n\n${description}\n\n${introDivider}${introContent}${body}\n`
}

export function countryPage(country, entries) {
  const description = `${entries.length} ${entries.length === 1 ? 'blog' : 'blogs'} listed in ${country.name}.`
  return `---\ntitle: ${country.name} Blogs\ndescription: ${description}\n---\n\n<script setup>\nimport CountryDirectoryHeader from '../.vitepress/components/CountryDirectoryHeader.vue'\n</script>\n\n<CountryDirectoryHeader flag="${attribute(country.flag)}" name="${attribute(country.name)}" :count="${entries.length}" />\n\n${renderSections(groupByCategory(entries, compareBlogNames))}\n`
}

const normalizeSubcategory = (entry) => {
  if (!Object.hasOwn(entry, 'subcategory')) return null

  const value = entry.subcategory
  if (typeof value !== 'string') {
    throw new Error(
      `Invalid subcategory for ${entry.name}: expected a non-empty string`
    )
  }

  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized || /[\r\n\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(
      `Invalid subcategory for ${entry.name}: expected a non-empty, single-line string`
    )
  }
  return normalized
}

const subcategoryKey = (subcategory) =>
  subcategory.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

const mainCategoriesByName = new Map(
  categories.map((category) => [subcategoryKey(category.title), category])
)

const validateSubcategory = (entry, subcategory) => {
  const mainCategory = mainCategoriesByName.get(subcategoryKey(subcategory))
  if (mainCategory) {
    throw new Error(
      `Invalid subcategory "${subcategory}" for ${entry.name}: it duplicates the main category "${mainCategory.title}". Set category to "${mainCategory.slug}" and remove subcategory.`
    )
  }
}

export function validateBlogs(entries) {
  const validCategories = new Set(categories.map(({ slug }) => slug))
  const seenUrls = new Set()

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid blog entry: expected an object')
    }
    if (
      typeof entry.category !== 'string' ||
      !validCategories.has(entry.category)
    ) {
      throw new Error(
        `Invalid category "${entry.category}" for ${entry.name}: expected one of ${[...validCategories].join(', ')}`
      )
    }
    if (seenUrls.has(entry.url)) {
      throw new Error(`Duplicate blog URL "${entry.url}" for ${entry.name}`)
    }
    seenUrls.add(entry.url)

    const subcategory = normalizeSubcategory(entry)
    if (subcategory !== null) validateSubcategory(entry, subcategory)
    if (Object.hasOwn(entry, 'country')) normalizeCountryCode(entry.country)
  }
}

export function groupBySubsection(
  slug,
  entries,
  entryComparator = compareBlogs
) {
  const rules = subsectionRules[slug]
  if (!rules?.length) return null

  const sections = rules.map(({ title }) => ({ title, entries: [] }))
  const configuredSections = new Map(
    sections.map((section) => [subcategoryKey(section.title), section])
  )
  const discoveredSections = new Map()

  for (const entry of entries) {
    const subcategory = normalizeSubcategory(entry)
    if (subcategory !== null) {
      validateSubcategory(entry, subcategory)
      const key = subcategoryKey(subcategory)
      const section = configuredSections.get(key) ??
        discoveredSections.get(key) ?? { title: subcategory, entries: [] }
      discoveredSections.set(key, section)
      section.entries.push(entry)
      continue
    }

    const haystack = entry.description
    const index = rules.findIndex(({ matches }) => matches.test(haystack))
    sections[index === -1 ? sections.length - 1 : index].entries.push(entry)
  }
  return sections
    .concat(
      [...discoveredSections.values()].filter(
        (section) => !configuredSections.has(subcategoryKey(section.title))
      )
    )
    .map((section) => ({
      ...section,
      entries: [...section.entries].sort(entryComparator)
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export function groupByCategory(entries, entryComparator = compareBlogs) {
  return [...categories]
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    )
    .map(({ slug, title }) => {
      const categoryEntries = entries.filter((entry) => entry.category === slug)
      const sortedCategoryEntries = [...categoryEntries].sort(entryComparator)
      return {
        title,
        entries: sortedCategoryEntries,
        subsections: groupBySubsection(
          slug,
          sortedCategoryEntries,
          entryComparator
        )
      }
    })
    .filter((section) => section.entries.length)
}

export function groupByCountry(entries) {
  const groups = new Map()

  for (const entry of entries) {
    if (entry.country === null || entry.country === undefined) continue
    const country = getCountryInfo(entry.country)
    if (!country) throw new Error(`Invalid country code for ${entry.name}`)
    const existing = groups.get(country.code) ?? { country, entries: [] }
    existing.entries.push(entry)
    groups.set(country.code, existing)
  }

  return [...groups.values()]
    .map(({ country, entries: countryEntries }) => ({
      country,
      entries: [...countryEntries].sort(compareBlogNames)
    }))
    .sort((a, b) => a.country.name.localeCompare(b.country.name))
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateBlogs(blogs)
  validateCommunities(communities)
  await mkdir(resolve('docs/collections'), { recursive: true })
  await mkdir(resolve('docs/country'), { recursive: true })

  const all = [...blogs].sort(compareBlogs)
  await writeFile(
    resolve('docs/blogs.md'),
    page(
      'All Blogs',
      'Explore independent blogs and personal websites from across the web. Browse the full directory below, or use the categories in the left sidebar to find something that interests you.',
      all,
      groupByCategory(blogs),
      './.vitepress/components/BlogHealthLink.vue',
      {
        additionalImports:
          "import RecentlyAddedStats from './.vitepress/components/RecentlyAddedStats.vue'\nimport { ALL_BLOG_STATS_CONFIG } from './.vitepress/components/recently-added-stats.config.js'\n",
        introContent:
          '<RecentlyAddedStats mode="all-blogs" :config="ALL_BLOG_STATS_CONFIG" />\n\n'
      }
    )
  )

  await writeFile(
    resolve('docs/recently-added.md'),
    `---\ntitle: Recently Added\ndescription: ${recentlyAddedDescription}\n---\n\n<script setup>\nimport RecentlyAddedStats from './.vitepress/components/RecentlyAddedStats.vue'\nimport RecentlyAddedBlogs from './.vitepress/components/RecentlyAddedBlogs.vue'\n</script>\n\n# ► Recently Added\n\n${recentlyAddedDescription}\n\n<hr class="blogr-intro-divider" aria-hidden="true" />\n\n<RecentlyAddedStats />\n\n<RecentlyAddedBlogs />\n`
  )

  for (const { slug, title, description } of categories) {
    const entries = blogs
      .filter((blog) => blog.category === slug)
      .sort(compareBlogs)
    const output =
      slug === 'personal-writing'
        ? 'personal-writing.md'
        : `collections/${slug}.md`
    await writeFile(
      resolve('docs', output),
      page(
        title,
        description,
        entries,
        groupBySubsection(slug, entries),
        output.startsWith('collections/')
          ? '../.vitepress/components/BlogHealthLink.vue'
          : './.vitepress/components/BlogHealthLink.vue'
      )
    )
  }

  for (const { country, entries } of groupByCountry(blogs)) {
    const path = countryPath(country.code)
    await writeFile(resolve(`docs${path}.md`), countryPage(country, entries))
  }

  const countryFiles = new Set(
    groupByCountry(blogs).map(
      ({ country }) => `${countryPath(country.code)}.md`
    )
  )
  for (const filename of await readdir(resolve('docs/country'))) {
    if (filename.endsWith('.md') && !countryFiles.has(`/country/${filename}`)) {
      await unlink(resolve('docs/country', filename))
    }
  }

  await writeFile(
    resolve('docs/communities/online-communities.md'),
    communityPage(communities)
  )

  console.log(
    `Generated ${all.length} blogs across ${categories.length} categories and ${groupByCountry(blogs).length} countries.`
  )
}
