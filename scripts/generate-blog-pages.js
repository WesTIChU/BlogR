import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const blogs = JSON.parse(await readFile(resolve('data/blogs.json'), 'utf8'))

const taxonomy = JSON.parse(
  await readFile(resolve('data/blog-taxonomy.json'), 'utf8')
)
const categories = taxonomy.categories
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
  a.name.localeCompare(b.name)
const line = (blog) =>
  `* <BlogHealthLink name="${attribute(blog.name)}" url="${attribute(blog.url)}" :favourite="${Boolean(blog.favourite)}" /> - ${blog.description}<BlogLastUpdated url="${attribute(blog.url)}" added-date="${attribute(blog.addedDate ?? '')}" />`

export function page(
  title,
  description,
  entries,
  sections,
  componentPath = './.vitepress/components/BlogHealthLink.vue'
) {
  const body = sections
    ? sections
        .filter((section) => section.entries.length)
        .map(
          (section) =>
            `## ${section.title}\n\n${section.entries.map(line).join('\n')}`
        )
        .join('\n\n') || '* No blogs are currently listed in this category yet.'
    : entries.length
      ? entries.map(line).join('\n')
      : '* No blogs are currently listed in this category yet.'
  const introDivider =
    '<hr class="blogr-intro-divider" aria-hidden="true" />\n\n'
  return `---\ntitle: ${title}\ndescription: ${description}\n---\n\n<script setup>\nimport BlogHealthLink from '${componentPath}'\nimport BlogLastUpdated from '${componentPath.replace('BlogHealthLink', 'BlogLastUpdated')}'\n</script>\n\n# ► ${title}\n\n${description}\n\n${introDivider}${body}\n`
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
  }
}

export function groupBySubsection(slug, entries) {
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
      entries: [...section.entries].sort(compareBlogs)
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateBlogs(blogs)
  await mkdir(resolve('docs/collections'), { recursive: true })

  const all = [...blogs].sort(compareBlogs)
  await writeFile(
    resolve('docs/blogs.md'),
    page(
      'All Blogs',
      'Browse every independent blog and personal website listed in the BlogR Directory.',
      all
    )
  )

  await writeFile(
    resolve('docs/recently-added.md'),
    `---\ntitle: Recently Added\ndescription: New additions to the BlogR Directory.\n---\n\n<script setup>\nimport RecentlyAddedBlogs from './.vitepress/components/RecentlyAddedBlogs.vue'\n</script>\n\n# ► Recently Added\n\nNew additions to the BlogR Directory.\n\n<hr class="blogr-intro-divider" aria-hidden="true" />\n\n<RecentlyAddedBlogs />\n`
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

  console.log(
    `Generated ${all.length} blogs across ${categories.length} categories.`
  )
}
