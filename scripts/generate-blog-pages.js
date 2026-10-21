import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getVerifiedFeedUrl } from '../shared/blog-update.js'
import {
  countryPath,
  getCountryInfo,
  normalizeCountryCode
} from '../shared/countries.js'
import { formatAddedDate } from '../shared/recently-added.js'

const blogs = JSON.parse(await readFile(resolve('data/blogs.json'), 'utf8'))
const blogUpdates = JSON.parse(
  await readFile(resolve('data/blog-updates.json'), 'utf8')
)
const communities = JSON.parse(
  await readFile(resolve('data/communities.json'), 'utf8')
)
const websites = JSON.parse(
  await readFile(resolve('data/websites.json'), 'utf8')
)
const independentWebTaxonomy = JSON.parse(
  await readFile(resolve('data/independent-web-taxonomy.json'), 'utf8')
)
const communityTaxonomy = JSON.parse(
  await readFile(resolve('data/community-taxonomy.json'), 'utf8')
)

const taxonomy = JSON.parse(
  await readFile(resolve('data/blog-taxonomy.json'), 'utf8')
)
const loadViteFlag = async (name) => {
  const mode = process.env.NODE_ENV || 'development'
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  let value
  for (const file of files) {
    try {
      const source = await readFile(resolve(file), 'utf8')
      for (const line of source.split(/\r?\n/)) {
        const match = line.match(new RegExp(`^${name}\\s*=\\s*(.*)$`))
        if (match) value = match[1].trim().replace(/^['"]|['"]$/g, '')
      }
    } catch {
      // Optional dotenv files are normal in CI and production builds.
    }
  }
  return value
}
const viteEnvWebringEnabled = await loadViteFlag('VITE_WEBRING_PUBLIC_ENABLED')
const showWebringAtBuild =
  (process.env.VITE_WEBRING_PUBLIC_ENABLED ?? viteEnvWebringEnabled) === 'true'
const categories = taxonomy.categories
const recentlyAddedDescription =
  'Fresh faces, new stories and plenty worth reading. Explore the latest independent blogs and personal websites to join the BlogR directory.'
const independentWebCategoryDescriptions = {
  'Personal Websites':
    'Personal homepages and hand-built sites where people share their interests, projects and corners of the web.',
  'Web Directories':
    'Small, human-curated directories that help visitors discover useful and unusual places across the independent web.',
  'Digital Archives':
    'Archives preserving websites, media, documents and other pieces of online and cultural history.',
  'Independent Tools':
    'Practical tools and small web projects made independently for focused, useful tasks.',
  'Creative Projects':
    'Artistic experiments, digital creations and personal projects made outside the usual platforms.',
  Fansites:
    'Fan-made archives and tributes celebrating favourite games, stories, characters and communities.',
  Webrings:
    'Webrings and ring hubs that connect independent sites through shared navigation and discovery.'
}
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
export const compareWebsites = (a, b) =>
  a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base'
  }) || a.url.localeCompare(b.url)
export const compareCommunityCategories = (a, b) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

export const renderBlogDetails = (entry, showWebring = showWebringAtBuild) => {
  const community = Boolean(entry.community)
  const country = community ? null : getCountryInfo(entry.country)
  const countryUrl = country ? countryPath(country) : null
  const statusTooltip =
    'Health status: Unknown or stale. Last checked: not available.'
  const details = []

  if (entry.favourite) {
    details.push(
      '<span class="blog-metadata-icon" aria-label="Favourite"><span class="blog-favourite">⭐</span></span>'
    )
  }

  if (!community) {
    const feedUrl = getVerifiedFeedUrl(blogUpdates, entry.url)
    const feed = feedUrl
      ? `<a class="blog-feed-link" href="${attribute(feedUrl)}" target="_blank" rel="noopener noreferrer" title="RSS feed for ${attribute(entry.name)}" aria-label="RSS feed for ${attribute(entry.name)}"><svg class="blog-metadata-visual blog-feed-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path><path d="M4 4a16 16 0 0 1 16 16"></path><path d="M4 10a10 10 0 0 1 10 10"></path></svg></a>`
      : ''
    details.push(`<span data-blog-feed-slot>${feed}</span>`)
  }

  details.push(
    `<span class="blog-metadata-icon blog-health-dot-container"><span class="blog-health-dot" style="background-color:#94A3B8;" title="${statusTooltip}" aria-label="${statusTooltip}" role="img"></span></span>`
  )

  if (country && countryUrl) {
    details.push(
      '<span class="blog-metadata-separator" aria-hidden="true">·</span>',
      `<a class="blog-country" href="${attribute(countryUrl)}" aria-label="${attribute(`Based in ${country.name}`)}"><span class="blog-country-flag" aria-hidden="true">${country.flag}</span> ${attribute(country.name)}</a>`
    )
  }

  if (!community) {
    details.push(
      '<span class="blog-metadata-separator" data-blog-update-separator aria-hidden="true" hidden>·</span>',
      '<span data-blog-update-slot></span>'
    )
  }

  if (community) {
    details.push('<span data-health-relative></span>')
  }

  const addedDate = formatAddedDate(entry.addedDate)
  if (addedDate) {
    if (!community) {
      details.push(
        '<span class="blog-metadata-separator" data-blog-added-separator aria-hidden="true" hidden>·</span>'
      )
    }
    details.push(
      `<span class="blog-added-date">Added&nbsp;${attribute(addedDate)}</span>`
    )
  }

  details.push('<span class="blog-health-sr-only">Unknown or stale</span>')

  if (showWebring && entry.webringId)
    details.push(
      `<BlogWebring webring-id="${attribute(entry.webringId)}" website-url="${attribute(entry.url)}" website-name="${attribute(entry.name)}" />`
    )

  const communityAttribute = community ? ' data-blog-community="true"' : ''
  return `<span class="blog-last-updated" data-blog-details data-blog-url="${attribute(entry.url)}" data-blog-name="${attribute(entry.name)}"${communityAttribute}>${details.join('')}</span>`
}

const renderBlogLink = (blog) => {
  return `<BlogHealthLink name="${attribute(blog.name)}" url="${attribute(blog.url)}" />`
}

const line = (blog) =>
  `* <span class="blog-entry">${renderBlogLink(blog)} - ${blog.description}</span>${renderBlogDetails(blog)}`
const renderBlogEntries = (entries) => entries.map(line).join('\n')

const communityLine = (community) =>
  `* <span class="blog-entry"><BlogHealthLink name="${attribute(community.name)}" url="${attribute(community.url)}" /> - ${attribute(community.description)}</span>${renderBlogDetails({ ...community, community: true })}`

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

export function validateWebsites(entries, taxonomy = independentWebTaxonomy) {
  const validCategories = new Set(taxonomy.map(({ title }) => title))
  const seenIds = new Set()
  const seenUrls = new Set()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object')
      throw new Error('Invalid independent website entry')
    if (typeof entry.id !== 'string' || !entry.id)
      throw new Error(`Invalid independent website id for ${entry.name}`)
    if (seenIds.has(entry.id))
      throw new Error(`Duplicate independent website id "${entry.id}"`)
    if (
      typeof entry.name !== 'string' ||
      !entry.name ||
      typeof entry.url !== 'string'
    )
      throw new Error(`Invalid independent website fields for ${entry.name}`)
    if (seenUrls.has(entry.url))
      throw new Error(`Duplicate independent website URL "${entry.url}"`)
    if (!validCategories.has(entry.category))
      throw new Error(
        `Invalid independent website category "${entry.category}"`
      )
    if (!entry.description || !entry.addedAt)
      throw new Error(
        `Independent website ${entry.name} needs a description and addedAt date`
      )
    try {
      new URL(entry.url)
    } catch {
      throw new Error(`Invalid independent website URL for ${entry.name}`)
    }
    if (entry.subcategory !== undefined) {
      const category = taxonomy.find(({ title }) => title === entry.category)
      if (!category?.subcategories.includes(entry.subcategory))
        throw new Error(
          `Invalid independent website subcategory "${entry.subcategory}" for ${entry.name}`
        )
    }
    seenIds.add(entry.id)
    seenUrls.add(entry.url)
  }
}

export const renderWebsiteDetails = (
  entry,
  showWebring = showWebringAtBuild
) => {
  const added = formatAddedDate(entry.addedDate)
  const webring =
    showWebring && entry.webringId
      ? `<BlogWebring webring-id="${attribute(entry.webringId)}" website-url="${attribute(entry.url)}" website-name="${attribute(entry.name)}" />`
      : ''
  return `<span class="blog-last-updated" data-blog-details data-blog-website="true" data-blog-url="${attribute(entry.url)}" data-blog-name="${attribute(entry.name)}"><span class="blog-metadata-icon blog-health-dot-container"><span class="blog-health-dot" style="background-color:#94A3B8;" title="Health status: Unknown or stale. Last checked: not available." aria-label="Health status: Unknown or stale. Last checked: not available." role="img"></span></span>${added ? `<span class="blog-metadata-separator" aria-hidden="true">·</span><span class="blog-added-date">Added&nbsp;${attribute(added)}</span>` : ''}<span class="blog-health-sr-only">Unknown or stale</span>${webring}</span>`
}

const renderWebsiteEntries = (entries) =>
  entries
    .map(
      (entry) =>
        `* <span class="blog-entry"><BlogHealthLink name="${attribute(entry.name)}" url="${attribute(entry.url)}" /> - ${attribute(entry.description)}</span>${renderWebsiteDetails(entry)}`
    )
    .join('\n')

export function independentWebPage(
  title,
  description,
  entries,
  { root = false, previous = null, next = null } = {}
) {
  const grouped = root
    ? independentWebTaxonomy
        .map(({ title: category, subcategories }) => {
          const categoryEntries = entries.filter(
            (entry) => entry.category === category
          )
          if (!categoryEntries.length)
            return `## ${category}\n\n* No independent websites are currently listed in this category.`
          const sections = subcategories
            .map((subcategory) => {
              const matching = categoryEntries.filter(
                (entry) => entry.subcategory === subcategory
              )
              return matching.length
                ? `### ${subcategory}\n\n${renderWebsiteEntries(matching.sort(compareWebsites))}`
                : ''
            })
            .filter(Boolean)
          return `## ${category}\n\n${sections.length ? sections.join('\n\n') : renderWebsiteEntries(categoryEntries.sort(compareWebsites))}`
        })
        .join('\n\n')
    : (() => {
        const category = independentWebTaxonomy.find(
          ({ title: categoryTitle }) => categoryTitle === title
        )
        const sections = category?.subcategories
          .map((subcategory) => {
            const matching = entries.filter(
              (entry) => entry.subcategory === subcategory
            )
            return matching.length
              ? `## ${subcategory}\n\n${renderWebsiteEntries(matching.sort(compareWebsites))}`
              : ''
          })
          .filter(Boolean)
        return sections?.length
          ? sections.join('\n\n')
          : entries.length
            ? renderWebsiteEntries(entries.sort(compareWebsites))
            : '* No independent websites are currently listed in this category yet.'
      })()
  const navigation = root
    ? ''
    : `prev:${previous ? `\n  text: ${previous.title}\n  link: /independent-web/${previous.slug}` : ' false'}\nnext:${next ? `\n  text: ${next.title}\n  link: /independent-web/${next.slug}` : ' false'}\n`
  return `---\ntitle: ${title}\ndescription: ${description}\n${navigation}---\n\n<script setup>\n${root ? "import IndependentWebStats from '../.vitepress/components/IndependentWebStats.vue'" : ''}\n</script>\n\n# ► ${title}\n\n${description}\n\n${root ? '[**► Submit an Independent Website**](https://github.com/WesTIChU/BlogR/issues/new?template=submit-independent-website.yml)\n\n' : ''}<hr class="blogr-intro-divider" aria-hidden="true" />\n\n${root ? '<IndependentWebStats />\n\n' : ''}${grouped}\n`
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
  validateWebsites(websites)
  await mkdir(resolve('docs/collections'), { recursive: true })
  await mkdir(resolve('docs/country'), { recursive: true })
  await mkdir(resolve('docs/independent-web'), { recursive: true })

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

  const independentWebDescription =
    'Discover the independent web. Personal homepages, useful tools, forgotten archives, fansites and creative projects built by people who still make the internet interesting.'
  await writeFile(
    resolve('docs/independent-web/index.md'),
    independentWebPage('Independent Web', independentWebDescription, websites, {
      root: true
    })
  )
  const websiteFiles = new Set(['index.md'])
  for (const [index, category] of independentWebTaxonomy.entries()) {
    const entries = websites.filter(
      ({ category: value }) => value === category.title
    )
    const filename = `${category.slug}.md`
    websiteFiles.add(filename)
    await writeFile(
      resolve('docs/independent-web', filename),
      independentWebPage(
        category.title,
        independentWebCategoryDescriptions[category.title],
        entries,
        {
          previous: independentWebTaxonomy[index - 1] ?? null,
          next: independentWebTaxonomy[index + 1] ?? null
        }
      )
    )
  }
  for (const filename of await readdir(resolve('docs/independent-web'))) {
    if (filename.endsWith('.md') && !websiteFiles.has(filename))
      await unlink(resolve('docs/independent-web', filename))
  }

  console.log(
    `Generated ${all.length} blogs, ${websites.length} independent websites across ${independentWebTaxonomy.length} categories, and ${groupByCountry(blogs).length} countries.`
  )
}
