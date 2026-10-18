import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  COUNTRIES,
  COUNTRY_GROUPS,
  COUNTRY_NOT_SPECIFIED,
  countryOption
} from '../shared/countries.js'

const FORM_PATH = resolve('.github/ISSUE_TEMPLATE/submit-blog.yml')
const TAXONOMY_PATH = resolve('data/blog-taxonomy.json')
const INDEPENDENT_WEB_TAXONOMY_PATH = resolve(
  'data/independent-web-taxonomy.json'
)
const BEGIN = '  # BEGIN GENERATED TAXONOMY OPTIONS'
const END = '  # END GENERATED TAXONOMY OPTIONS'
const WEBSITE_BEGIN = '        # BEGIN GENERATED INDEPENDENT WEB CATEGORIES'
const WEBSITE_END = '        # END GENERATED INDEPENDENT WEB CATEGORIES'
const yamlString = (value) => JSON.stringify(value)
const compareTitles = (left, right) =>
  left.title.localeCompare(right.title, 'en', { sensitivity: 'base' })
const submissionCountryOption = (country) =>
  country.code === 'GB-SCT'
    ? `${country.name} [GB-SCO]`
    : countryOption(country)

const buildCountryOptions = () => {
  const groupedCodes = new Set(COUNTRY_GROUPS.flat())
  const groups = COUNTRY_GROUPS.map((codes) => {
    const countries = codes.map((code) =>
      COUNTRIES.find((country) => country.code === code)
    )
    if (countries.some((country) => !country)) {
      throw new Error(
        'Submission form country grouping contains an unknown code'
      )
    }
    return { codes, countries }
  })
  const remainingCountries = COUNTRIES.filter(
    ({ code }) => !groupedCodes.has(code)
  )
  const insertions = groups
    .map(({ codes, countries }) => ({
      index: COUNTRIES.slice(
        0,
        COUNTRIES.findIndex(({ code }) => code === codes[0])
      ).filter(({ code }) => !groupedCodes.has(code)).length,
      countries
    }))
    .sort((left, right) => left.index - right.index)
  let offset = 0
  for (const { index, countries } of insertions) {
    remainingCountries.splice(index + offset, 0, ...countries)
    offset += countries.length
  }
  return [
    COUNTRY_NOT_SPECIFIED,
    ...remainingCountries.map(submissionCountryOption),
    'Other / Not listed'
  ]
}

export function buildTaxonomyOptions(taxonomy) {
  const categories = [...(taxonomy.categories ?? [])].sort(compareTitles)
  const categorySubcategoryOptions = categories.flatMap(
    ({ title, subsections }) =>
      [...(subsections ?? [])]
        .sort(compareTitles)
        .map(({ title: subsectionTitle }) => `${title} / ${subsectionTitle}`)
  )
  const categoryOptions = [...categorySubcategoryOptions, 'Not sure / Other']
  const countryOptions = buildCountryOptions()
  if (new Set(categoryOptions).size !== categoryOptions.length) {
    throw new Error('Submission form taxonomy options contain duplicates')
  }
  if (categoryOptions.some((option) => !option)) {
    throw new Error('Submission form taxonomy options contain empty values')
  }
  if (
    new Set(countryOptions).size !== countryOptions.length ||
    countryOptions.some((option) => !option)
  ) {
    throw new Error(
      'Submission form country options contain duplicates or empties'
    )
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
    [
      '  - type: input',
      '    id: country-place',
      '    attributes:',
      `      label: ${yamlString('Country or place not listed?')}`,
      `      description: ${yamlString("If your country, territory or region isn't listed, enter it here.")}`,
      `      placeholder: ${yamlString('Enter your country or place')}`,
      '    validations:',
      '      required: false'
    ].join('\n'),
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

export function syncIndependentWebsiteForm(form, taxonomy) {
  const generated = taxonomy
    .map(({ title }) => `        - ${yamlString(title)}`)
    .join('\n')
  const pattern =
    /^        # BEGIN GENERATED INDEPENDENT WEB CATEGORIES\n[\s\S]*?^        # END GENERATED INDEPENDENT WEB CATEGORIES/m
  if (!pattern.test(form))
    throw new Error('Independent Web submission form markers are missing')
  return form.replace(pattern, `${WEBSITE_BEGIN}\n${generated}\n${WEBSITE_END}`)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const check = process.argv.includes('--check')
  const taxonomy = JSON.parse(await readFile(TAXONOMY_PATH, 'utf8'))
  const form = await readFile(FORM_PATH, 'utf8')
  const websiteTaxonomy = JSON.parse(
    await readFile(INDEPENDENT_WEB_TAXONOMY_PATH, 'utf8')
  )
  const websiteFormPath = resolve(
    '.github/ISSUE_TEMPLATE/submit-independent-website.yml'
  )
  const websiteForm = await readFile(websiteFormPath, 'utf8')
  const synced = syncSubmissionForm(form, taxonomy)
  const syncedWebsiteForm = syncIndependentWebsiteForm(
    websiteForm,
    websiteTaxonomy
  )

  if (check) {
    if (synced !== form || syncedWebsiteForm !== websiteForm) {
      throw new Error('submit-blog.yml is out of sync with blog-taxonomy.json')
    }
    console.log('Submission form taxonomy is up to date.')
  } else if (synced !== form || syncedWebsiteForm !== websiteForm) {
    await writeFile(FORM_PATH, synced)
    await writeFile(websiteFormPath, syncedWebsiteForm)
    console.log('Updated submit-blog.yml from blog-taxonomy.json.')
  }
}
