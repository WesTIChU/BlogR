import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COUNTRIES,
  COUNTRY_NOT_SPECIFIED,
  countryOption
} from '../shared/countries.js'

const FORM_PATH = resolve('.github/ISSUE_TEMPLATE/submit-blog.yml')
const TAXONOMY_PATH = resolve('data/blog-taxonomy.json')
const BEGIN = '  # BEGIN GENERATED TAXONOMY OPTIONS'
const END = '  # END GENERATED TAXONOMY OPTIONS'

const yamlString = (value) => JSON.stringify(value)
const compareTitles = (left, right) =>
  left.title.localeCompare(right.title, 'en', { sensitivity: 'base' })

export function buildTaxonomyOptions(taxonomy) {
  const categories = [...(taxonomy.categories ?? [])].sort(compareTitles)
  const categorySubcategoryOptions = categories.flatMap(
    ({ title, subsections }) =>
      [...(subsections ?? [])]
        .sort(compareTitles)
        .map(({ title: subsectionTitle }) => `${title} / ${subsectionTitle}`)
  )
  const categoryOptions = [...categorySubcategoryOptions, 'Not sure / Other']
  const countryOptions = [
    COUNTRY_NOT_SPECIFIED,
    ...COUNTRIES.map(countryOption)
  ]
  if (new Set(categoryOptions).size !== categoryOptions.length) {
    throw new Error('Submission form taxonomy options contain duplicates')
  }
  if (categoryOptions.some((option) => !option)) {
    throw new Error('Submission form taxonomy options contain empty values')
  }

  const dropdown = (
    id,
    label,
    description,
    options,
    required,
    defaultOption
  ) => {
    if (
      defaultOption !== undefined &&
      (!Number.isInteger(defaultOption) ||
        defaultOption < 0 ||
        defaultOption >= options.length)
    ) {
      throw new Error(
        `Invalid default index ${defaultOption} for ${id}: expected 0-${options.length - 1}`
      )
    }

    return [
      '  - type: dropdown',
      `    id: ${id}`,
      '    attributes:',
      `      label: ${yamlString(label)}`,
      `      description: ${yamlString(description)}`,
      '      options:',
      ...options.map((option) => `        - ${yamlString(option)}`),
      ...(defaultOption === undefined
        ? []
        : [`      default: ${defaultOption}`]),
      '    validations:',
      `      required: ${required}`
    ].join('\n')
  }

  return [
    BEGIN,
    dropdown(
      'category-subcategory',
      'Category / Subcategory',
      'Choose the directory category and subcategory that best fit. This is a suggestion for editorial review.',
      categoryOptions,
      true,
      undefined
    ),
    dropdown(
      'country',
      'Country',
      'Optional. Select where the blogger is based, not where the website is hosted. We do not collect IP addresses or automatically detect locations.',
      countryOptions,
      false
    ),
    END
  ].join('\n')
}

export function syncSubmissionForm(form, taxonomy) {
  const generated = buildTaxonomyOptions(taxonomy)
  const markerPattern =
    /^  # BEGIN GENERATED TAXONOMY OPTIONS\n[\s\S]*?^  # END GENERATED TAXONOMY OPTIONS/m
  if (!markerPattern.test(form)) {
    throw new Error('Submission form taxonomy markers are missing')
  }
  return form.replace(markerPattern, generated)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const check = process.argv.includes('--check')
  const taxonomy = JSON.parse(await readFile(TAXONOMY_PATH, 'utf8'))
  const form = await readFile(FORM_PATH, 'utf8')
  const synced = syncSubmissionForm(form, taxonomy)

  if (check) {
    if (synced !== form) {
      throw new Error('submit-blog.yml is out of sync with blog-taxonomy.json')
    }
    console.log('Submission form taxonomy is up to date.')
  } else if (synced !== form) {
    await writeFile(FORM_PATH, synced)
    console.log('Updated submit-blog.yml from blog-taxonomy.json.')
  }
}
