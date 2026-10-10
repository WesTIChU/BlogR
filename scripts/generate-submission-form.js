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

export function buildTaxonomyOptions(taxonomy) {
  const categories = taxonomy.categories ?? []
  const categoryTitles = categories.map(({ title }) => title)
  const subcategoryTitles = categories.flatMap(({ title, subsections }) =>
    (subsections ?? []).map(
      ({ title: subsectionTitle }) => `${title} / ${subsectionTitle}`
    )
  )
  const categoryOptions = [
    ...categoryTitles,
    'Not sure / Let the editor decide'
  ]
  const subcategoryOptions = [
    ...new Set([
      ...subcategoryTitles,
      'Not sure / Let the editor decide',
      'Other / Suggest a subcategory'
    ])
  ]
  const countryOptions = [
    COUNTRY_NOT_SPECIFIED,
    ...COUNTRIES.map(countryOption)
  ]
  if (
    new Set(categoryOptions).size !== categoryOptions.length ||
    new Set(subcategoryOptions).size !== subcategoryOptions.length
  ) {
    throw new Error('Submission form taxonomy options contain duplicates')
  }
  if (
    categoryOptions.some((option) => !option) ||
    subcategoryOptions.some((option) => !option)
  ) {
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
      'category',
      'Main category',
      'Choose the directory category that best fits. This is a suggestion for editorial review.',
      categoryOptions,
      true,
      categoryOptions.length - 1
    ),
    dropdown(
      'subcategory',
      'Subcategory',
      'Choose an existing subcategory if one fits. This is optional and suggestions are reviewed manually.',
      subcategoryOptions,
      false
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
