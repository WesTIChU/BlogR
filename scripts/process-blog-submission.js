import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import prettier from 'prettier'
import communityTaxonomy from '../data/community-taxonomy.json' with { type: 'json' }
import independentWebTaxonomy from '../data/independent-web-taxonomy.json' with { type: 'json' }
import { findListedBlog } from '../shared/blog-duplicate.js'
import { countryPath, normalizeCountryCode } from '../shared/countries.js'
import {
  comparableBlogUrl,
  normalizeBlogSubmissionUrl
} from '../shared/new-blog-entries.js'
import { getLondonDateKey } from '../shared/recently-added.js'
import { createD1RegistryClient } from '../shared/webring-registry.js'
import { canonicalWebringUrl } from '../shared/webring.js'
import {
  validateBlogs,
  validateCommunities,
  validateWebsites
} from './generate-blog-pages.js'

const exec = promisify(execFile)
const API_ROOT = 'https://api.github.com'
const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500
const MAX_URL_LENGTH = 2048
const IGNORED_SUBCATEGORIES = new Set([
  'Not sure / Other',
  'Not sure / Let the editor decide',
  'Other / Suggest a subcategory'
])
const EMPTY_SUBCATEGORY_VALUES = new Set(['', '_No response_', 'None'])
const OTHER_COUNTRY_OPTION = 'Other / Not listed'
const OTHER_CATEGORY_OPTION = 'Other / Suggest a new category'
const OTHER_SUBCATEGORY_OPTION = 'Other / Suggest a new subcategory'
const REQUIRED_FORM_HEADINGS = ['### Blog name', '### Blog URL']

const newWebringId = () => `br-${randomBytes(16).toString('hex')}`

const assignWebringId = (entry, catalogues, registered = []) => {
  const canonical = canonicalWebringUrl(entry.url)
  const existing = catalogues
    .flat()
    .find((candidate) => canonicalWebringUrl(candidate.url) === canonical)
  const historical = registered.find((row) => row.canonical_url === canonical)
  return {
    ...entry,
    webringId: existing?.webringId ?? historical?.webring_id ?? newWebringId()
  }
}

const hasBlogCategoryHeading = (body) =>
  body.includes('### Category / Subcategory') ||
  body.includes('### Main category')
const REQUIRED_COMMUNITY_HEADINGS = [
  '### Community name',
  '### Website URL',
  '### Description',
  '### Category',
  '### Community type'
]
const REQUIRED_WEBSITE_HEADINGS = [
  '### Website name',
  '### Website URL',
  '### Description',
  '### Category'
]

export function submissionType(body, labels = null) {
  if (typeof body !== 'string') return null
  if (Array.isArray(labels)) {
    const isBlog = labels.includes('blog-submission')
    const isCommunity = labels.includes('community-submission')
    const isWebsite = labels.includes('independent-web-submission')
    if (Number(isBlog) + Number(isCommunity) + Number(isWebsite) > 1)
      return null
    if (!isBlog && !isCommunity && !isWebsite) {
      const hasBlogHeadings =
        REQUIRED_FORM_HEADINGS.every((heading) => body.includes(heading)) &&
        hasBlogCategoryHeading(body)
      const hasCommunityHeadings = REQUIRED_COMMUNITY_HEADINGS.every(
        (heading) => body.includes(heading)
      )
      const hasWebsiteHeadings = REQUIRED_WEBSITE_HEADINGS.every((heading) =>
        body.includes(heading)
      )
      return [hasBlogHeadings, hasCommunityHeadings, hasWebsiteHeadings].filter(
        Boolean
      ).length === 1
        ? hasBlogHeadings
          ? 'blog'
          : hasCommunityHeadings
            ? 'community'
            : 'website'
        : null
    }
    if (
      isBlog &&
      (!REQUIRED_FORM_HEADINGS.every((heading) => body.includes(heading)) ||
        !hasBlogCategoryHeading(body))
    ) {
      return null
    }
    if (
      isCommunity &&
      !REQUIRED_COMMUNITY_HEADINGS.every((heading) => body.includes(heading))
    ) {
      return null
    }
    if (
      isWebsite &&
      !REQUIRED_WEBSITE_HEADINGS.every((heading) => body.includes(heading))
    )
      return null
    return isBlog ? 'blog' : isCommunity ? 'community' : 'website'
  }
  if (
    REQUIRED_FORM_HEADINGS.every((heading) => body.includes(heading)) &&
    hasBlogCategoryHeading(body)
  ) {
    return 'blog'
  }
  if (REQUIRED_COMMUNITY_HEADINGS.every((heading) => body.includes(heading))) {
    return 'community'
  }
  if (REQUIRED_WEBSITE_HEADINGS.every((heading) => body.includes(heading)))
    return 'website'
  return null
}

export function isApprovedSubmissionEvent(event) {
  const body = event?.issue?.body
  return (
    event?.label?.name === 'approved' &&
    event?.issue?.state === 'open' &&
    typeof body === 'string' &&
    submissionType(body) !== null
  )
}

const cleanValue = (value, field, maxLength) => {
  if (typeof value !== 'string') throw new Error(`Missing ${field}`)
  const cleaned = value.trim()
  if (!cleaned || cleaned === '_No response_') {
    throw new Error(`Missing ${field}`)
  }
  if (cleaned.length > maxLength) throw new Error(`${field} is too long`)
  if (/\r|\n|[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new Error(`${field} must be a single line`)
  }
  if (/[<>`]/.test(cleaned)) {
    throw new Error(`${field} contains unsupported markup`)
  }
  return cleaned
}

const normalizeSubmittedSubcategory = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return EMPTY_SUBCATEGORY_VALUES.has(normalized) ? '' : normalized
}

const isIgnoredSubcategory = (value) =>
  [...IGNORED_SUBCATEGORIES].some(
    (ignored) => classificationKey(ignored) === classificationKey(value)
  )

export function parseIssueForm(body) {
  if (typeof body !== 'string' || body.length > 20_000) {
    throw new Error('Issue form body is missing or too large')
  }

  const fields = new Map()
  const headingPattern = /^###\s+([^\r\n]+)\r?\n/gm
  const headings = [...body.matchAll(headingPattern)]
  for (const [index, match] of headings.entries()) {
    const heading = match[1].trim().toLocaleLowerCase()
    if (fields.has(heading))
      throw new Error(`Duplicate issue form field: ${heading}`)
    const valueStart = match.index + match[0].length
    const valueEnd = headings[index + 1]?.index ?? body.length
    fields.set(heading, body.slice(valueStart, valueEnd).trim())
  }

  const get = (heading) => fields.get(heading) ?? ''
  const description = get('short description')
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error('Description is too long')
  }
  if (/\r|\n|[\u0000-\u001f\u007f]/.test(description)) {
    throw new Error('Description must be a single line')
  }
  if (/[<>`]/.test(description)) {
    throw new Error('Description contains unsupported markup')
  }

  const combinedCategory = get('category / subcategory')
  const legacyCategory = get('main category')
  const legacySubcategory = get('subcategory')
  const categorySelection =
    get('category') || combinedCategory || legacyCategory
  const freeformSuggestion = get(
    'suggested new category or subcategory (optional)'
  )
  const categorySuggestion = get('suggested category') || freeformSuggestion
  const explicitSubcategory = get('subcategory')
  const subcategorySuggestion = get('suggested subcategory')
  const categoryParts = combinedCategory ? combinedCategory.split('/') : []
  const countryPlace = parseCustomCountryPlace(
    get('country or place not listed?')
  )
  return {
    name: cleanValue(get('blog name'), 'blog name', MAX_NAME_LENGTH),
    url: cleanValue(get('blog url'), 'blog URL', MAX_URL_LENGTH),
    description: description === '_No response_' ? '' : description,
    category: cleanValue(
      categoryParts.length ? categoryParts[0].trim() : categorySelection,
      'category',
      120
    ),
    subcategory: normalizeSubmittedSubcategory(
      explicitSubcategory ||
        (categoryParts.length > 1
          ? categoryParts.slice(1).join('/').trim()
          : legacySubcategory)
    ),
    ...(categorySuggestion && categorySuggestion !== '_No response_'
      ? {
          categorySuggestion: cleanValue(
            categorySuggestion,
            'category suggestion',
            80
          )
        }
      : {}),
    ...(subcategorySuggestion && subcategorySuggestion !== '_No response_'
      ? {
          suggestedSubcategory: cleanValue(
            subcategorySuggestion,
            'subcategory suggestion',
            80
          )
        }
      : {}),
    directoryType: get('directory type'),
    country: parseCountry(get('country')),
    ...(countryPlace ? { countryPlace } : {}),
    notes: get('additional notes')
  }
}

function parseCountry(value) {
  if (
    !value ||
    value === '_No response_' ||
    value === 'Not specified' ||
    value === OTHER_COUNTRY_OPTION
  ) {
    return undefined
  }
  if (/^[A-Z]{2}(?:-[A-Z]{3})?$/.test(value)) {
    return normalizeCountryCode(value)
  }
  const match = value.match(/^.+ \[([A-Z]{2}(?:-[A-Z]{3})?)\]$/)
  if (!match) throw new Error('Invalid country selection')
  return normalizeCountryCode(match[1])
}

function parseCustomCountryPlace(value) {
  if (!value || value === '_No response_') return undefined
  return cleanValue(value, 'country or place not listed', 120)
}

export function parseCommunityIssueForm(body) {
  if (typeof body !== 'string' || body.length > 20_000) {
    throw new Error('Issue form body is missing or too large')
  }

  const fields = new Map()
  const headingPattern = /^###\s+([^\r\n]+)\r?\n/gm
  const headings = [...body.matchAll(headingPattern)]
  for (const [index, match] of headings.entries()) {
    const heading = match[1].trim().toLocaleLowerCase()
    if (fields.has(heading))
      throw new Error(`Duplicate issue form field: ${heading}`)
    const valueStart = match.index + match[0].length
    const valueEnd = headings[index + 1]?.index ?? body.length
    fields.set(heading, body.slice(valueStart, valueEnd).trim())
  }

  const get = (heading) => fields.get(heading) ?? ''
  const description = cleanValue(
    get('description'),
    'description',
    MAX_DESCRIPTION_LENGTH
  )
  const rssUrl = get('rss feed url (optional)') || get('rss feed url')
  if (rssUrl && rssUrl !== '_No response_') validateBlogUrl(rssUrl)

  return {
    name: cleanValue(get('community name'), 'community name', MAX_NAME_LENGTH),
    url: cleanValue(get('website url'), 'website URL', MAX_URL_LENGTH),
    description,
    category: cleanValue(get('category'), 'category', 120),
    ...(get('suggested category') &&
    get('suggested category') !== '_No response_'
      ? {
          categorySuggestion: cleanValue(
            get('suggested category'),
            'category suggestion',
            80
          )
        }
      : {}),
    directoryType: get('directory type'),
    section: cleanValue(get('community type'), 'community type', 80),
    rssUrl: rssUrl && rssUrl !== '_No response_' ? rssUrl.trim() : null,
    notes: get('additional notes')
  }
}

export function parseWebsiteIssueForm(body) {
  if (typeof body !== 'string' || body.length > 20_000)
    throw new Error('Issue form body is missing or too large')
  const fields = new Map()
  const headingPattern = /^###\s+([^\r\n]+)\r?\n/gm
  const headings = [...body.matchAll(headingPattern)]
  for (const [index, match] of headings.entries()) {
    fields.set(
      match[1].trim().toLocaleLowerCase(),
      body
        .slice(
          match.index + match[0].length,
          headings[index + 1]?.index ?? body.length
        )
        .trim()
    )
  }
  const get = (heading) => fields.get(heading) ?? ''
  return {
    name: cleanValue(get('website name'), 'website name', MAX_NAME_LENGTH),
    url: cleanValue(get('website url'), 'website URL', MAX_URL_LENGTH),
    description: cleanValue(
      get('description'),
      'description',
      MAX_DESCRIPTION_LENGTH
    ),
    category: cleanValue(get('category'), 'category', 80),
    ...(get('suggested category') &&
    get('suggested category') !== '_No response_'
      ? {
          categorySuggestion: cleanValue(
            get('suggested category'),
            'category suggestion',
            80
          )
        }
      : {}),
    subcategory:
      get('subcategory') && get('subcategory') !== '_No response_'
        ? cleanValue(get('subcategory'), 'subcategory', 80)
        : undefined,
    ...((get('suggested subcategory') || get('suggested new subcategory')) &&
    (get('suggested subcategory') || get('suggested new subcategory')) !==
      '_No response_'
      ? {
          suggestedSubcategory: cleanValue(
            get('suggested subcategory') || get('suggested new subcategory'),
            'subcategory suggestion',
            80
          )
        }
      : {}),
    directoryType: get('directory type'),
    country:
      get('country') && get('country') !== '_No response_'
        ? cleanValue(get('country'), 'country', 120)
        : undefined
  }
}

export function extractSuggestedSubcategory(notes) {
  if (typeof notes !== 'string') return null
  const match = notes.match(
    /(?:^|\r?\n)\s*(?:[-*]\s*)?Suggested subcategory\s*:\s*([^\r\n]+)/i
  )
  if (!match) return null

  const suggestion = match[1].trim()
  if (!suggestion || suggestion.length > 120) {
    throw new Error('Suggested subcategory is missing or too long')
  }
  if (/[\u0000-\u001f\u007f<>`]/.test(suggestion)) {
    throw new Error('Suggested subcategory contains unsupported content')
  }
  return suggestion
}

const normalizeSubcategoryTitle = (value) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

const classificationKey = (value) =>
  normalizeSubcategoryTitle(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')

export function validateSuggestedSubcategory(value) {
  const title = normalizeSubcategoryTitle(value)
  if (
    !title ||
    title.length > 80 ||
    !/^[\p{L}\p{N}][\p{L}\p{N} &'’\-]*[\p{L}\p{N}]$/u.test(title)
  ) {
    throw new Error('Suggested subcategory contains an invalid name')
  }
  return title
}

const subcategoryKey = (value) => classificationKey(value)

const taxonomySlug = (value) => classificationKey(value).replace(/ /g, '-')

export function addSuggestedCategory(taxonomy, title, kind = 'blog') {
  const next = structuredClone(taxonomy)
  if (kind === 'blog') {
    if (
      next.categories.some(
        (item) => classificationKey(item.title) === classificationKey(title)
      )
    )
      throw new Error('Suggested category already exists')
    next.categories.push({
      slug: taxonomySlug(title),
      title,
      description: `${title} blogs.`,
      subsections: [{ title: 'General', match: '.*' }]
    })
  } else {
    if (
      next.some(
        (item) => classificationKey(item.title) === classificationKey(title)
      )
    )
      throw new Error('Suggested category already exists')
    next.push({
      slug: taxonomySlug(title),
      title,
      ...(kind === 'website' ? { subcategories: [] } : {})
    })
  }
  return next
}

const subcategoryMatch = (title) =>
  [...new Set(title.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') || '.*'

export function applySuggestedSubcategory(taxonomy, submission) {
  const nextTaxonomy = structuredClone(taxonomy)
  if (!submission.suggestedSubcategory) {
    return {
      taxonomy: nextTaxonomy,
      submission: { ...submission },
      status: 'none'
    }
  }

  const category = nextTaxonomy.categories.find(
    ({ slug }) => slug === submission.category
  )
  if (!category) throw new Error('Invalid main category')

  const title = validateSuggestedSubcategory(submission.suggestedSubcategory)
  const existing = (category.subsections ?? []).find(
    ({ title: existingTitle }) =>
      subcategoryKey(existingTitle) === subcategoryKey(title)
  )
  if (existing) {
    return {
      taxonomy: nextTaxonomy,
      submission: { ...submission, subcategory: existing.title },
      status: 'reused'
    }
  }

  category.subsections ??= []
  category.subsections.push({ title, match: subcategoryMatch(title) })
  return {
    taxonomy: nextTaxonomy,
    submission: { ...submission, subcategory: title },
    status: 'created',
    subsection: { title, match: subcategoryMatch(title) }
  }
}

function matchingBracket(text, openingIndex) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = openingIndex; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '[') depth += 1
    else if (character === ']' && --depth === 0) return index
  }
  throw new Error('Could not locate taxonomy subsection list')
}

export function insertSubcategoryInTaxonomyText(
  text,
  categorySlug,
  subsection
) {
  const slugIndex = text.indexOf(`"slug": ${JSON.stringify(categorySlug)}`)
  if (slugIndex === -1) throw new Error('Could not locate taxonomy category')
  const subsectionKey = text.indexOf('"subsections": [', slugIndex)
  if (subsectionKey === -1)
    throw new Error('Could not locate taxonomy subsections')
  const openingIndex = text.indexOf('[', subsectionKey)
  const closingIndex = matchingBracket(text, openingIndex)
  const closingLineStart = text.lastIndexOf('\n', closingIndex) + 1
  const indentation = text.slice(closingLineStart, closingIndex)
  const itemIndentation = `${indentation}  `
  const item = [
    `${itemIndentation}{`,
    `${itemIndentation}  "title": ${JSON.stringify(subsection.title)},`,
    `${itemIndentation}  "match": ${JSON.stringify(subsection.match)}`,
    `${itemIndentation}}`
  ].join('\n')
  let prefix = text.slice(0, closingIndex).replace(/[ \t\r\n]+$/, '')
  if (!prefix.endsWith('[') && !prefix.endsWith(',')) prefix += ','
  return `${prefix}\n${item}\n${indentation}${text.slice(closingIndex)}`
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}

export function validateBlogUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    throw new Error('Blog URL is missing or too long')
  }
  let url
  try {
    url = new URL(normalizeBlogSubmissionUrl(value))
  } catch {
    throw new Error('Blog URL must be a valid HTTP(S) URL')
  }
  const hostname = url.hostname.toLocaleLowerCase()
  if (
    url.username ||
    url.password ||
    url.protocol === 'file:' ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isPrivateIpv4(hostname) ||
    hostname.includes(':')
  ) {
    throw new Error('Blog URL points to a local or otherwise unsafe host')
  }
  if (!hostname.includes('.'))
    throw new Error('Blog URL must use a public hostname')
  return url.toString()
}

function taxonomyMaps(taxonomy) {
  const categories = new Map(
    taxonomy.categories.map((item) => [classificationKey(item.title), item])
  )
  return { categories }
}

function selectedSubcategory(value, category) {
  const normalized = normalizeSubmittedSubcategory(value)
  const separator = normalized.indexOf('/')
  if (separator === -1) return normalized

  const categoryTitle = normalized.slice(0, separator).trim()
  const subcategoryTitle = normalized.slice(separator + 1).trim()
  if (classificationKey(categoryTitle) !== classificationKey(category.title)) {
    throw new Error('Invalid subcategory for the selected main category')
  }
  return subcategoryTitle
}

export function validateSubmission(submission, blogs, taxonomy) {
  const name = cleanValue(submission.name, 'blog name', MAX_NAME_LENGTH)
  const url = validateBlogUrl(submission.url)
  const description = submission.description ?? ''
  if (
    typeof description !== 'string' ||
    description.length > MAX_DESCRIPTION_LENGTH
  ) {
    throw new Error('Description is missing or too long')
  }
  if (/\r|\n|[\u0000-\u001f\u007f<>`]/.test(description)) {
    throw new Error('Description contains unsupported content')
  }

  const { categories } = taxonomyMaps(taxonomy)
  const country = normalizeCountryCode(submission.country)
  const countryPlace = submission.countryPlace
    ? cleanValue(
        submission.countryPlace,
        'country or place not listed',
        MAX_NAME_LENGTH
      )
    : undefined
  const category = categories.get(classificationKey(submission.category))
  if (!category) throw new Error('Invalid main category')

  let subcategory
  const requestedSubcategory = normalizeSubmittedSubcategory(
    submission.subcategory
  )
  let suggestedSubcategory = isIgnoredSubcategory(requestedSubcategory)
    ? extractSuggestedSubcategory(submission.notes)
    : null
  if (requestedSubcategory && !isIgnoredSubcategory(requestedSubcategory)) {
    const requestedTitle = selectedSubcategory(requestedSubcategory, category)
    const match = (category.subsections ?? []).find(
      ({ title }) => subcategoryKey(title) === subcategoryKey(requestedTitle)
    )
    if (match) {
      subcategory = match.title
    } else {
      const title = validateSuggestedSubcategory(requestedTitle)
      suggestedSubcategory = title
    }
  }

  const duplicate = findListedBlog(blogs, url, { allowChildPaths: true })
  if (duplicate)
    throw new Error(`Duplicate blog URL already exists: ${duplicate.name}`)

  return {
    name,
    url,
    description,
    category: category.slug,
    subcategory,
    ...(country ? { country } : {}),
    ...(countryPlace ? { countryPlace } : {}),
    ...(country && countryPlace
      ? { countryReview: 'Listed country and custom location both supplied' }
      : {}),
    ...(suggestedSubcategory ? { suggestedSubcategory } : {})
  }
}

const communityCategories = new Map(
  communityTaxonomy.map(({ slug, title }) => [title, { slug, title }])
)

export function validateCommunitySubmission(
  submission,
  communities,
  blogs = [],
  taxonomyData = communityTaxonomy
) {
  const name = cleanValue(submission.name, 'community name', MAX_NAME_LENGTH)
  const url = validateBlogUrl(submission.url)
  const description = cleanValue(
    submission.description,
    'description',
    MAX_DESCRIPTION_LENGTH
  )
  const category = new Map(
    taxonomyData.map(({ slug, title }) => [title, { slug, title }])
  ).get(submission.category)
  if (!category) throw new Error('Invalid community category')
  const sectionByTitle = new Map([
    ['Forum', 'forums'],
    ['Independent Community', 'independent-communities']
  ])
  const section = sectionByTitle.get(submission.section)
  if (!section) throw new Error('Invalid community type')

  const duplicate = findListedBlog(communities, url, {
    allowChildPaths: false
  })
  if (duplicate) {
    throw new Error(`Duplicate community URL already exists: ${duplicate.name}`)
  }

  return {
    name,
    url,
    description,
    category: category.slug,
    section,
    ...(submission.rssUrl ? { rssUrl: validateBlogUrl(submission.rssUrl) } : {})
  }
}

export function validateIndependentWebsiteSubmission(
  submission,
  websites,
  blogs = [],
  communities = [],
  taxonomyData = independentWebTaxonomy
) {
  const name = cleanValue(submission.name, 'website name', MAX_NAME_LENGTH)
  const url = validateBlogUrl(submission.url)
  const description = cleanValue(
    submission.description,
    'description',
    MAX_DESCRIPTION_LENGTH
  )
  const category = taxonomyData.find(
    ({ title }) =>
      classificationKey(title) === classificationKey(submission.category)
  )
  if (!category) throw new Error('Invalid independent website category')
  const duplicate = findListedBlog(websites, url, { allowChildPaths: false })
  if (duplicate)
    throw new Error(`Duplicate website URL already exists: ${duplicate.name}`)
  const subcategory = normalizeSubmittedSubcategory(submission.subcategory)
  const requestedSuggestion = submission.suggestedSubcategory
    ? validateSuggestedSubcategory(submission.suggestedSubcategory)
    : null
  const existingSubcategory = (category.subcategories ?? []).find(
    (candidate) => subcategoryKey(candidate) === subcategoryKey(subcategory)
  )
  const legacySuggestion =
    subcategory && !isIgnoredSubcategory(subcategory) && !existingSubcategory
      ? validateSuggestedSubcategory(subcategory)
      : null
  const country = submission.country
    ? parseCountry(submission.country)
    : undefined
  return {
    name,
    url,
    description,
    category: category.title,
    ...(existingSubcategory ? { subcategory: existingSubcategory } : {}),
    ...(requestedSuggestion || legacySuggestion
      ? { suggestedSubcategory: requestedSuggestion || legacySuggestion }
      : {}),
    ...(country ? { country } : {})
  }
}

export function applySuggestedIndependentSubcategory(taxonomy, submission) {
  const nextTaxonomy = structuredClone(taxonomy)
  const category = nextTaxonomy.find(
    ({ title }) =>
      classificationKey(title) === classificationKey(submission.category)
  )
  if (!category) throw new Error('Invalid independent website category')

  const requested = normalizeSubmittedSubcategory(
    submission.suggestedSubcategory || submission.subcategory
  )
  if (!requested || isIgnoredSubcategory(requested)) {
    return {
      taxonomy: nextTaxonomy,
      submission: { ...submission },
      status: 'none'
    }
  }

  const title = validateSuggestedSubcategory(requested)
  const existing = (category.subcategories ?? []).find(
    (candidate) => subcategoryKey(candidate) === subcategoryKey(title)
  )
  if (existing) {
    return {
      taxonomy: nextTaxonomy,
      submission: { ...submission, subcategory: existing },
      status: 'reused'
    }
  }

  category.subcategories ??= []
  category.subcategories.push(title)
  return {
    taxonomy: nextTaxonomy,
    submission: { ...submission, subcategory: title },
    status: 'created',
    subsection: title
  }
}

export function buildBlogEntry(submission, addedDate, addedAt) {
  return {
    name: submission.name,
    url: submission.url,
    description: submission.description,
    category: submission.category,
    ...(submission.subcategory ? { subcategory: submission.subcategory } : {}),
    ...(submission.country ? { country: submission.country } : {}),
    topics: [],
    recentlyAdded: true,
    favourite: false,
    noLongerUpdated: false,
    clicks: 0,
    addedDate,
    ...(addedAt ? { addedAt } : {})
  }
}

const communityId = (name) =>
  name
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')

export function buildCommunityEntry(submission, addedDate, addedAt) {
  return {
    id: communityId(submission.name),
    name: submission.name,
    url: submission.url,
    description: submission.description,
    category: submission.category,
    section: submission.section,
    topics: [],
    recentlyAdded: true,
    favourite: false,
    noLongerUpdated: false,
    addedDate,
    clicks: 0,
    addedAt,
    ...(submission.rssUrl ? { rssUrl: submission.rssUrl } : {})
  }
}

export function buildIndependentWebsiteEntry(submission, addedDate, addedAt) {
  return {
    id: communityId(submission.name),
    name: submission.name,
    url: submission.url,
    description: submission.description,
    category: submission.category,
    ...(submission.subcategory ? { subcategory: submission.subcategory } : {}),
    ...(submission.country ? { country: submission.country } : {}),
    addedDate,
    clicks: 0,
    addedAt: addedAt ?? `${addedDate}T00:00:00.000Z`
  }
}

export function getAdditionMetadata(now = new Date()) {
  const addedAt = now.toISOString()
  return { addedDate: getLondonDateKey(now), addedAt }
}

export function appendBlogEntry(entries, entry) {
  if (findListedBlog(entries, entry.url, { allowChildPaths: true })) {
    return entries
  }
  return [...entries, entry]
}

export function submissionBranch(issueNumber, type = 'blog') {
  if (!/^\d+$/.test(String(issueNumber)))
    throw new Error('Invalid issue number')
  if (!['blog', 'community', 'website'].includes(type))
    throw new Error('Invalid submission type')
  return `${type}-submission/issue-${issueNumber}`
}

export function hasApprovalPermission(permission) {
  return ['admin', 'maintain', 'write'].includes(permission?.permission)
}

export function hasTaxonomyAuthorization(labels, permission, body) {
  if (!Array.isArray(labels) || !labels.includes('taxonomy-approved'))
    return false
  if (!hasApprovalPermission(permission)) return false
  if (typeof body !== 'string') return false
  return /^###\s+Taxonomy authorization\s*\r?\n\s*approved\s*$/im.test(body)
}

export function existingSubmissionPullRequest(pullRequests) {
  return pullRequests.find((pullRequest) => pullRequest?.number) ?? null
}

export function catalogueFiles(taxonomy, submission = null) {
  const files = ['data/blogs.json', 'docs/blogs.md', 'docs/recently-added.md']
  if (!submission) {
    return [
      ...files,
      'docs/personal-writing.md',
      ...taxonomy.categories
        .filter(({ slug }) => slug !== 'personal-writing')
        .map(({ slug }) => `docs/collections/${slug}.md`)
    ]
  }
  files.push(
    submission.category === 'personal-writing'
      ? 'docs/personal-writing.md'
      : `docs/collections/${submission.category}.md`
  )
  if (submission.country) {
    files.push(`docs${countryPath(submission.country)}.md`)
  }
  return files
}

export function communityCatalogueFiles() {
  return [
    'data/communities.json',
    'data/community-taxonomy.json',
    '.github/ISSUE_TEMPLATE/submit-community.yml',
    'docs/communities/online-communities.md'
  ]
}

export function independentWebsiteCatalogueFiles() {
  return [
    'data/websites.json',
    'data/independent-web-taxonomy.json',
    '.github/ISSUE_TEMPLATE/submit-independent-website.yml',
    'docs/independent-web/index.md',
    ...independentWebTaxonomy.map(
      ({ slug }) => `docs/independent-web/${slug}.md`
    )
  ]
}

export async function updateIndependentWebTaxonomyText(taxonomy) {
  return prettier.format(`${JSON.stringify(taxonomy, null, 2)}\n`, {
    filepath: 'data/independent-web-taxonomy.json'
  })
}

export function pullRequestDetails(
  entry,
  issueNumber,
  branch,
  base,
  suggestedSubcategory,
  suggestedSubcategoryStatus = 'none',
  countryPlace,
  suggestedCategoryStatus = 'none'
) {
  const suggestionSection = suggestedSubcategory
    ? `### Suggested subcategory (${suggestedSubcategoryStatus})\n\n**${suggestedSubcategory}**\n\nThe subcategory was ${suggestedSubcategoryStatus === 'created' ? 'added to the official taxonomy and assigned to this blog' : 'matched to an existing taxonomy entry and assigned to this blog'}.`
    : '### Suggested subcategory for review\n\nNo suggested subcategory was provided.'
  const countrySection = countryPlace
    ? `\n\n### Country/place for editorial review\n\n**${countryPlace}**${entry.country ? `\n\nThe listed country code is **${entry.country}**; review both values before merging.` : '\n\nNo country code was assigned automatically.'}`
    : ''
  const categorySection =
    suggestedCategoryStatus === 'created'
      ? '\n\n### Taxonomy change\n\nA new category was explicitly authorized and added to the taxonomy in this review PR.'
      : ''
  return {
    title: `Add blog: ${entry.name}`,
    head: branch,
    base,
    body: `## Approved blog submission\n\n- **Name:** ${entry.name}\n- **URL:** ${entry.url}\n- **Category:** ${entry.category}${entry.subcategory ? `\n- **Subcategory:** ${entry.subcategory}` : ''}${countrySection}${categorySection}\n\n${suggestionSection}\n\nAdds the approved submission from #${issueNumber}.\n\nCloses #${issueNumber}\n<!-- blogr-submission:${issueNumber} -->`
  }
}

export function communityPullRequestDetails(
  entry,
  issueNumber,
  branch,
  base,
  suggestedCategoryStatus = 'none'
) {
  return {
    title: `Add community: ${entry.name}`,
    head: branch,
    base,
    body: `## Approved community submission\n\n- **Name:** ${entry.name}\n- **URL:** ${entry.url}\n- **Category:** ${entry.category}\n- **Type:** ${entry.section}\n\n${suggestedCategoryStatus === 'created' ? 'A new category was explicitly authorized and added to the taxonomy in this review PR.\n\n' : ''}Adds the approved submission from #${issueNumber}.\n\nCloses #${issueNumber}\n<!-- community-submission:${issueNumber} -->`
  }
}

const apiRequest = async (token, path, options = {}) => {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok)
    throw new Error(`GitHub API request failed (${response.status})`)
  return data
}

const comment = (token, owner, repo, issueNumber, body) =>
  apiRequest(token, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  })

async function run() {
  const token = process.env.BLOGR_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  const issueNumber = process.env.ISSUE_NUMBER
  const approver = process.env.APPROVER_LOGIN
  if (!token || !repository || !issueNumber || !approver) {
    throw new Error('Required workflow environment is missing')
  }
  const [owner, repo] = repository.split('/')
  const permission = await apiRequest(
    token,
    `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(approver)}/permission`
  )
  if (!hasApprovalPermission(permission)) {
    throw new Error(
      'Only repository maintainers with write access may approve submissions'
    )
  }

  const issue = await apiRequest(
    token,
    `/repos/${owner}/${repo}/issues/${issueNumber}`
  )
  const labels = issue.labels.map((label) =>
    typeof label === 'string' ? label : label.name
  )
  const labeledType = submissionType(issue.body, labels)
  const bodyType = issue.body.match(
    /^###\s+Directory type\s*\r?\n\s*(Blog|Independent Website|Community)\s*$/im
  )?.[1]
  const type = bodyType
    ? {
        Blog: 'blog',
        'Independent Website': 'website',
        Community: 'community'
      }[bodyType]
    : labeledType
  if (issue.state !== 'open' || !labels.includes('approved') || !type) {
    throw new Error('Issue is not an open approved submission')
  }
  const taxonomyAuthorized = hasTaxonomyAuthorization(
    labels,
    permission,
    issue.body
  )

  const taxonomyText = await readFile(
    resolve('data/blog-taxonomy.json'),
    'utf8'
  )
  let taxonomy = JSON.parse(taxonomyText)
  let independentWebTaxonomyData = JSON.parse(
    await readFile(resolve('data/independent-web-taxonomy.json'), 'utf8')
  )
  let communityTaxonomyData = JSON.parse(
    await readFile(resolve('data/community-taxonomy.json'), 'utf8')
  )
  const blogs = JSON.parse(await readFile(resolve('data/blogs.json'), 'utf8'))
  const communities = JSON.parse(
    await readFile(resolve('data/communities.json'), 'utf8')
  )
  const websites = JSON.parse(
    await readFile(resolve('data/websites.json'), 'utf8')
  )
  let submission
  let nextTaxonomy = taxonomy
  let nextIndependentWebTaxonomy = independentWebTaxonomyData
  let nextCommunityTaxonomy = communityTaxonomyData
  let suggestedSubcategoryStatus = 'none'
  let suggestedCategoryStatus = 'none'
  let subsection
  if (type === 'blog') {
    validateBlogs(blogs)
    const parsedIssue = parseIssueForm(issue.body)
    const selectedBlogCategory = taxonomy.categories.find(
      ({ title }) =>
        classificationKey(title) === classificationKey(parsedIssue.category)
    )
    const selectedBlogSubcategory = selectedBlogCategory?.subsections?.some(
      ({ title }) =>
        subcategoryKey(title) === subcategoryKey(parsedIssue.subcategory)
    )
    if (
      (parsedIssue.category === OTHER_CATEGORY_OPTION ||
        parsedIssue.categorySuggestion ||
        parsedIssue.suggestedSubcategory ||
        extractSuggestedSubcategory(parsedIssue.notes) ||
        (parsedIssue.subcategory && !selectedBlogSubcategory)) &&
      !taxonomyAuthorized
    ) {
      throw new Error(
        'Taxonomy suggestions require the taxonomy-approved label and explicit authorization'
      )
    }
    if (parsedIssue.category === OTHER_CATEGORY_OPTION) {
      const title = validateSuggestedSubcategory(parsedIssue.categorySuggestion)
      taxonomy = addSuggestedCategory(taxonomy, title, 'blog')
      parsedIssue.category = title
      delete parsedIssue.categorySuggestion
      suggestedCategoryStatus = 'created'
    }
    const parsedSubmission = validateSubmission(parsedIssue, blogs, taxonomy)
    const result = applySuggestedSubcategory(taxonomy, parsedSubmission)
    nextTaxonomy = result.taxonomy
    submission = result.submission
    suggestedSubcategoryStatus = result.status
    subsection = result.subsection
  } else if (type === 'community') {
    validateCommunities(communities)
    const parsedIssue = parseCommunityIssueForm(issue.body)
    if (
      (parsedIssue.category === OTHER_CATEGORY_OPTION ||
        parsedIssue.categorySuggestion) &&
      !taxonomyAuthorized
    ) {
      throw new Error(
        'Taxonomy suggestions require the taxonomy-approved label and explicit authorization'
      )
    }
    if (parsedIssue.category === OTHER_CATEGORY_OPTION) {
      const title = validateSuggestedSubcategory(parsedIssue.categorySuggestion)
      communityTaxonomyData = addSuggestedCategory(
        communityTaxonomyData,
        title,
        'community'
      )
      nextCommunityTaxonomy = communityTaxonomyData
      parsedIssue.category = title
      delete parsedIssue.categorySuggestion
      suggestedCategoryStatus = 'created'
    }
    submission = validateCommunitySubmission(
      parsedIssue,
      communities,
      blogs,
      communityTaxonomyData
    )
  } else {
    const parsedIssue = parseWebsiteIssueForm(issue.body)
    const selectedWebsiteCategory = independentWebTaxonomyData.find(
      ({ title }) =>
        classificationKey(title) === classificationKey(parsedIssue.category)
    )
    const selectedWebsiteSubcategory =
      selectedWebsiteCategory?.subcategories?.some(
        (title) =>
          subcategoryKey(title) === subcategoryKey(parsedIssue.subcategory)
      )
    if (
      (parsedIssue.category === OTHER_CATEGORY_OPTION ||
        parsedIssue.categorySuggestion ||
        parsedIssue.suggestedSubcategory ||
        (parsedIssue.subcategory && !selectedWebsiteSubcategory)) &&
      !taxonomyAuthorized
    ) {
      throw new Error(
        'Taxonomy suggestions require the taxonomy-approved label and explicit authorization'
      )
    }
    if (parsedIssue.category === OTHER_CATEGORY_OPTION) {
      const title = validateSuggestedSubcategory(parsedIssue.categorySuggestion)
      independentWebTaxonomyData = addSuggestedCategory(
        independentWebTaxonomyData,
        title,
        'website'
      )
      parsedIssue.category = title
      delete parsedIssue.categorySuggestion
      suggestedCategoryStatus = 'created'
    }
    const parsedSubmission = validateIndependentWebsiteSubmission(
      parsedIssue,
      websites,
      blogs,
      communities,
      independentWebTaxonomyData
    )
    const result = applySuggestedIndependentSubcategory(
      independentWebTaxonomyData,
      parsedSubmission
    )
    nextIndependentWebTaxonomy = result.taxonomy
    submission = result.submission
    suggestedSubcategoryStatus = result.status
    subsection = result.subsection
  }
  const branch = submissionBranch(issueNumber, type)
  const repositoryInfo = await apiRequest(token, `/repos/${owner}/${repo}`)
  const existingPrs = await apiRequest(
    token,
    `/repos/${owner}/${repo}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=10`
  )
  const existing = existingSubmissionPullRequest(existingPrs)
  if (existing) {
    await comment(
      token,
      owner,
      repo,
      issueNumber,
      `A submission pull request already exists: #${existing.number} (${existing.html_url}).`
    )
    return
  }

  const { addedDate, addedAt } = getAdditionMetadata()
  const unassignedEntry =
    type === 'blog'
      ? buildBlogEntry(submission, addedDate, addedAt)
      : type === 'community'
        ? buildCommunityEntry(submission, addedDate, addedAt)
        : buildIndependentWebsiteEntry(submission, addedDate, addedAt)
  const registry = createD1RegistryClient({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN
  })
  const registered = await registry.query(
    'SELECT webring_id, canonical_url FROM webring_id_registry'
  )
  const entry = assignWebringId(
    unassignedEntry,
    [blogs, websites, communities],
    registered
  )
  await exec('git', ['checkout', '-b', branch])
  const generated =
    type === 'blog'
      ? [...catalogueFiles(nextTaxonomy, submission)]
      : type === 'community'
        ? communityCatalogueFiles()
        : independentWebsiteCatalogueFiles()
  if (type === 'blog') {
    const nextBlogs = appendBlogEntry(blogs, entry)
    await writeFile(
      resolve('data/blogs.json'),
      `${JSON.stringify(nextBlogs, null, 2)}\n`
    )
  } else if (type === 'community') {
    const nextCommunities = [...communities, entry]
    validateCommunities(nextCommunities)
    await writeFile(
      resolve('data/communities.json'),
      `${JSON.stringify(nextCommunities, null, 2)}\n`
    )
  } else {
    const nextWebsites = [...websites, entry]
    validateWebsites(nextWebsites, nextIndependentWebTaxonomy)
    await writeFile(
      resolve('data/websites.json'),
      `${JSON.stringify(nextWebsites, null, 2)}\n`
    )
  }
  if (type === 'blog' && suggestedSubcategoryStatus === 'created') {
    await writeFile(
      resolve('data/blog-taxonomy.json'),
      insertSubcategoryInTaxonomyText(
        taxonomyText,
        submission.category,
        subsection
      )
    )
    await exec(process.execPath, ['scripts/generate-submission-form.js'])
    generated.push(
      'data/blog-taxonomy.json',
      '.github/ISSUE_TEMPLATE/submit-blog.yml'
    )
  }
  if (type === 'blog' && suggestedCategoryStatus === 'created') {
    await writeFile(
      resolve('data/blog-taxonomy.json'),
      `${JSON.stringify(taxonomy, null, 2)}\n`
    )
    await exec(process.execPath, ['scripts/generate-submission-form.js'])
    generated.push(
      'data/blog-taxonomy.json',
      '.github/ISSUE_TEMPLATE/submit-blog.yml'
    )
  }
  if (type === 'website' && suggestedSubcategoryStatus === 'created') {
    await writeFile(
      resolve('data/independent-web-taxonomy.json'),
      await updateIndependentWebTaxonomyText(nextIndependentWebTaxonomy)
    )
    await exec(process.execPath, ['scripts/generate-submission-form.js'])
    generated.push('data/independent-web-taxonomy.json')
    generated.push('.github/ISSUE_TEMPLATE/submit-independent-website.yml')
  }
  if (type === 'website' && suggestedCategoryStatus === 'created') {
    await writeFile(
      resolve('data/independent-web-taxonomy.json'),
      await updateIndependentWebTaxonomyText(nextIndependentWebTaxonomy)
    )
    await exec(process.execPath, ['scripts/generate-submission-form.js'])
    generated.push(
      'data/independent-web-taxonomy.json',
      '.github/ISSUE_TEMPLATE/submit-independent-website.yml'
    )
  }
  if (type === 'community' && suggestedCategoryStatus === 'created') {
    await writeFile(
      resolve('data/community-taxonomy.json'),
      `${JSON.stringify(nextCommunityTaxonomy, null, 2)}\n`
    )
    await exec(process.execPath, ['scripts/generate-submission-form.js'])
    generated.push('data/community-taxonomy.json')
    generated.push('.github/ISSUE_TEMPLATE/submit-community.yml')
  }
  await exec(process.execPath, ['scripts/generate-blog-pages.js'])
  await exec(process.execPath, ['scripts/generate-function-data.js'])
  generated.push(
    'shared/blogr-function-data.js',
    'shared/cloudflare-function-data.js'
  )

  await exec('git', ['add', '--', ...generated])
  const { stdout: staged } = await exec('git', [
    'diff',
    '--cached',
    '--name-only'
  ])
  const stagedFiles = staged.trim().split('\n').filter(Boolean)
  if (stagedFiles.some((file) => !generated.includes(file))) {
    throw new Error(
      'Refusing to include files outside the catalogue and generated pages'
    )
  }
  await exec('git', ['config', 'user.name', 'github-actions[bot]'])
  await exec('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com'
  ])
  await exec('git', ['commit', '-m', `Add ${type} submission #${issueNumber}`])
  await exec('git', ['push', '--set-upstream', 'origin', branch])

  const details =
    type === 'blog'
      ? pullRequestDetails(
          entry,
          issueNumber,
          branch,
          repositoryInfo.default_branch,
          submission.suggestedSubcategory,
          suggestedSubcategoryStatus,
          submission.countryPlace,
          suggestedCategoryStatus
        )
      : type === 'community'
        ? communityPullRequestDetails(
            entry,
            issueNumber,
            branch,
            repositoryInfo.default_branch,
            suggestedCategoryStatus
          )
        : {
            title: `Add independent website: ${entry.name}`,
            head: branch,
            base: repositoryInfo.default_branch,
            body: `## Approved independent website submission\n\n- **Name:** ${entry.name}\n- **URL:** ${entry.url}\n- **Category:** ${entry.category}${entry.subcategory ? `\n- **Subcategory:** ${entry.subcategory}` : ''}\n\nThe subcategory was ${suggestedSubcategoryStatus === 'created' ? 'added to the official Independent Web taxonomy' : suggestedSubcategoryStatus === 'reused' ? 'matched to an existing Independent Web taxonomy entry' : 'not changed'}.${suggestedCategoryStatus === 'created' ? ' A new category was explicitly authorized and added to the taxonomy in this review PR.' : ''}\n\nAdds the approved submission from #${issueNumber}.\n\nCloses #${issueNumber}\n<!-- independent-web-submission:${issueNumber} -->`
          }
  const pullRequest = await apiRequest(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify(details)
  })
  await comment(
    token,
    owner,
    repo,
    issueNumber,
    `Approved submission is ready for review in PR #${pullRequest.number}: ${pullRequest.html_url}`
  )
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(async (error) => {
    const repository = process.env.GITHUB_REPOSITORY
    const issueNumber = process.env.ISSUE_NUMBER
    const token = process.env.BLOGR_TOKEN
    if (repository && issueNumber && token) {
      const [owner, repo] = repository.split('/')
      try {
        await comment(
          token,
          owner,
          repo,
          issueNumber,
          `The approved submission could not be processed automatically: ${error.message}`
        )
      } catch {
        // Keep the original failure as the workflow result without exposing tokens.
      }
    }
    console.error(error.message)
    process.exitCode = 1
  })
}
