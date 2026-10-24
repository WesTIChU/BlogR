import { taxonomy } from '../../shared/blogr-function-data.js'
import {
  communityTaxonomy,
  independentWebTaxonomy
} from '../../shared/cloudflare-function-data.js'
import {
  countryOption,
  getCountryInfo,
  normalizeCountryCode
} from '../../shared/countries.js'
import { normalizeBlogSubmissionUrl } from '../../shared/new-blog-entries.js'

/* global URL */

export const MAX_NAME_LENGTH = 120
export const MAX_DESCRIPTION_LENGTH = 500
export const MAX_URL_LENGTH = 2048
export const MAX_COUNTRY_PLACE_LENGTH = 120
export const OTHER_COUNTRY_OPTION = 'Other / Not listed'
export const OTHER_CATEGORY_OPTION = 'Other / Suggest a new category'
export const OTHER_SUBCATEGORY_OPTION = 'Other / Suggest a new subcategory'
export const MAX_TAXONOMY_SUGGESTION_LENGTH = 80

const cleanSingleLine = (value, field, maxLength) => {
  if (typeof value !== 'string') throw new Error(`Missing ${field}`)
  const cleaned = value.trim()
  if (!cleaned) throw new Error(`Missing ${field}`)
  if (cleaned.length > maxLength) throw new Error(`${field} is too long`)
  // eslint-disable-next-line no-control-regex
  if (/\r|\n|[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new Error(`${field} must be a single line`)
  }
  if (/[<>`]/.test(cleaned)) {
    throw new Error(`${field} contains unsupported markup`)
  }
  return cleaned
}

const cleanDescription = (value) => {
  if (typeof value !== 'string') throw new Error('Missing description')
  const cleaned = value.trim().replace(/[\r\n]+/g, ' ')
  if (!cleaned) throw new Error('Missing description')
  if (cleaned.length > MAX_DESCRIPTION_LENGTH)
    throw new Error('Description is too long')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>`]/.test(cleaned)) {
    throw new Error('Description contains unsupported content')
  }
  return cleaned.replace(/\s+/g, ' ')
}

export const cleanTaxonomySuggestion = (value, field) => {
  if (typeof value !== 'string') throw new Error(`Missing ${field}`)
  const cleaned = value.trim()
  if (!cleaned) throw new Error(`Missing ${field}`)
  if (cleaned.length > MAX_TAXONOMY_SUGGESTION_LENGTH) {
    throw new Error(`${field} is too long`)
  }
  if (!/^[\p{L}\p{N}][-\p{L}\p{N} &'’]*[\p{L}\p{N}]$/u.test(cleaned)) {
    throw new Error(`${field} contains unsupported content`)
  }
  return cleaned
}

const isPrivateIpv4 = (hostname) => {
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

export const validateUrl = (value) => {
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
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.includes(':') ||
    isPrivateIpv4(hostname) ||
    !hostname.includes('.')
  ) {
    throw new Error('Blog URL must be a public HTTP(S) URL')
  }
  return url.toString()
}

const categoryByTitle = (title) =>
  taxonomy.categories.find(
    (category) =>
      category.title.toLocaleLowerCase() === title.toLocaleLowerCase()
  )

export function validateSubmissionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid submission')
  }
  const name = cleanSingleLine(input.name, 'blog name', MAX_NAME_LENGTH)
  const url = validateUrl(input.url)
  const description = cleanDescription(input.description)
  const categoryTitle = cleanSingleLine(
    input.category,
    'main category',
    MAX_NAME_LENGTH
  )
  const category = categoryByTitle(categoryTitle)
  const categorySuggestion =
    categoryTitle === OTHER_CATEGORY_OPTION
      ? cleanTaxonomySuggestion(input.categorySuggestion, 'category suggestion')
      : undefined
  if (!category && !categorySuggestion) throw new Error('Invalid main category')

  const subcategory =
    typeof input.subcategory === 'string' ? input.subcategory.trim() : ''
  const subcategorySuggestion =
    subcategory === OTHER_SUBCATEGORY_OPTION
      ? cleanTaxonomySuggestion(
          input.subcategorySuggestion,
          'subcategory suggestion'
        )
      : undefined
  if (
    subcategory &&
    subcategory !== 'Not sure / Other' &&
    subcategory !== OTHER_SUBCATEGORY_OPTION
  ) {
    if (!category) throw new Error('Choose a category before a subcategory')
    if (
      !(category.subsections ?? []).some(({ title }) => title === subcategory)
    ) {
      throw new Error('Invalid subcategory for the selected main category')
    }
  }

  let country
  if (input.country && input.country !== 'other') {
    country = normalizeCountryCode(input.country)
  }
  const countryPlace = input.countryPlace
    ? cleanSingleLine(
        input.countryPlace,
        'country or place not listed',
        MAX_COUNTRY_PLACE_LENGTH
      )
    : undefined
  if (countryPlace && input.country !== 'other') {
    throw new Error(
      'Choose Other / Not listed before entering a custom location'
    )
  }

  return {
    name,
    url,
    description,
    category: category?.title ?? OTHER_CATEGORY_OPTION,
    subcategory:
      subcategory &&
      subcategory !== 'Not sure / Other' &&
      subcategory !== OTHER_SUBCATEGORY_OPTION
        ? subcategory
        : undefined,
    ...(categorySuggestion ? { categorySuggestion } : {}),
    ...(subcategorySuggestion
      ? { suggestedSubcategory: subcategorySuggestion }
      : {}),
    ...(country ? { country } : {}),
    ...(countryPlace ? { countryPlace } : {})
  }
}

const categoryOrSuggestion = (value, suggestion, categories, field) => {
  const title = cleanSingleLine(value, field, MAX_NAME_LENGTH)
  if (title === OTHER_CATEGORY_OPTION) {
    return {
      title,
      suggestion: cleanTaxonomySuggestion(suggestion, `${field} suggestion`)
    }
  }
  const match = categories.find(
    ({ title: candidate }) =>
      candidate.toLocaleLowerCase() === title.toLocaleLowerCase()
  )
  if (!match) throw new Error(`Invalid ${field}`)
  return { title: match.title, category: match }
}

export function validateIndependentWebsiteInput(input) {
  const name = cleanSingleLine(input.name, 'website name', MAX_NAME_LENGTH)
  const url = validateUrl(input.url)
  const description = cleanDescription(input.description)
  const selectedCategory = categoryOrSuggestion(
    input.category,
    input.categorySuggestion,
    independentWebTaxonomy,
    'website category'
  )
  const category = selectedCategory.category
  const subcategory =
    typeof input.subcategory === 'string' ? input.subcategory.trim() : ''
  const selectedSubcategory =
    subcategory === 'Not sure / Other' ? '' : subcategory
  const allowed = category?.subcategories ?? []
  const suggestedSubcategory =
    typeof input.suggestedSubcategory === 'string'
      ? input.suggestedSubcategory.trim()
      : ''
  if (
    selectedSubcategory &&
    selectedSubcategory !== OTHER_SUBCATEGORY_OPTION &&
    !allowed.includes(selectedSubcategory)
  )
    throw new Error('Invalid subcategory for the selected website category')
  if (suggestedSubcategory) {
    if (selectedSubcategory) {
      throw new Error(
        'Clear the selected subcategory before suggesting a new one'
      )
    }
    if (
      suggestedSubcategory.length > 80 ||
      !/^[\p{L}\p{N}][\p{L}\p{N} &'’-]*[\p{L}\p{N}]$/u.test(
        suggestedSubcategory
      )
    ) {
      throw new Error('Suggested subcategory contains an invalid name')
    }
  }
  return {
    name,
    url,
    description,
    category: selectedCategory.title,
    ...(selectedCategory.suggestion
      ? { categorySuggestion: selectedCategory.suggestion }
      : {}),
    ...(selectedSubcategory && selectedSubcategory !== OTHER_SUBCATEGORY_OPTION
      ? { subcategory: selectedSubcategory }
      : suggestedSubcategory
        ? { subcategory: suggestedSubcategory, suggestedSubcategory }
        : {}),
    ...(input.country
      ? {
          country: cleanSingleLine(
            input.country,
            'country',
            MAX_COUNTRY_PLACE_LENGTH
          )
        }
      : {})
  }
}

export function validateCommunityInput(input) {
  const name = cleanSingleLine(input.name, 'community name', MAX_NAME_LENGTH)
  const url = validateUrl(input.url)
  const description = cleanDescription(input.description)
  const selectedCategory = categoryOrSuggestion(
    input.category,
    input.categorySuggestion,
    communityTaxonomy,
    'community category'
  )
  const communityType = cleanSingleLine(
    input.communityType,
    'community type',
    80
  )
  if (!['Forum', 'Independent Community'].includes(communityType))
    throw new Error('Invalid community type')
  return {
    name,
    url,
    description,
    category: selectedCategory.title,
    ...(selectedCategory.suggestion
      ? { categorySuggestion: selectedCategory.suggestion }
      : {}),
    communityType
  }
}

export const buildIssueBody = (submission) => {
  const country = submission.country
    ? submission.country === 'GB-SCT'
      ? 'Scotland [GB-SCO]'
      : countryOption(getCountryInfo(submission.country))
    : submission.countryPlace
      ? OTHER_COUNTRY_OPTION
      : 'Not specified'
  const reviewNote = submission.countryPlace
    ? `Custom country or place supplied for editorial review: ${submission.countryPlace}`
    : ''
  return [
    '### Blog name',
    '',
    submission.name,
    '',
    '### Blog URL',
    '',
    submission.url,
    '',
    '### Country',
    '',
    country,
    '',
    '### Country or place not listed?',
    '',
    submission.countryPlace ?? '',
    '',
    '### Short description',
    '',
    submission.description,
    '',
    '### Directory type',
    '',
    'Blog',
    '',
    '### Category',
    '',
    submission.category,
    '',
    '### Subcategory',
    '',
    submission.subcategory ?? '',
    '',
    '### Suggested category',
    '',
    submission.categorySuggestion ?? '',
    '',
    '### Suggested subcategory',
    '',
    submission.suggestedSubcategory ?? '',
    '',
    '### Additional notes',
    '',
    reviewNote,
    ''
  ].join('\n')
}

export const buildIndependentWebsiteIssueBody = (submission) =>
  [
    '### Directory type',
    '',
    'Independent Website',
    '',
    '### Website name',
    '',
    submission.name,
    '',
    '### Website URL',
    '',
    submission.url,
    '',
    '### Description',
    '',
    submission.description,
    '',
    '### Category',
    '',
    submission.category,
    '',
    '### Suggested category',
    '',
    submission.categorySuggestion ?? '',
    '',
    '### Subcategory',
    '',
    submission.subcategory ?? '',
    '',
    '### Suggested subcategory',
    '',
    submission.suggestedSubcategory ?? '',
    '',
    '### Country',
    '',
    submission.country ?? '',
    ''
  ].join('\n')

export const buildCommunityIssueBody = (submission) =>
  [
    '### Directory type',
    '',
    'Community',
    '',
    '### Community name',
    '',
    submission.name,
    '',
    '### Website URL',
    '',
    submission.url,
    '',
    '### Description',
    '',
    submission.description,
    '',
    '### Category',
    '',
    submission.category,
    '',
    '### Suggested category',
    '',
    submission.categorySuggestion ?? '',
    '',
    '### Community type',
    '',
    submission.communityType,
    ''
  ].join('\n')
