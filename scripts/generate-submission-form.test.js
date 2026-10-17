import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import taxonomy from '../data/blog-taxonomy.json' with { type: 'json' }
import {
  buildTaxonomyOptions,
  syncSubmissionForm
} from './generate-submission-form.js'

const form = await readFile('.github/ISSUE_TEMPLATE/submit-blog.yml', 'utf8')
const syncWorkflow = await readFile(
  '.github/workflows/sync-submission-form.yml',
  'utf8'
)

const generatedOptions = (block) => {
  const dropdown = block.split('\n  - type: dropdown')[1]
  return [...dropdown.matchAll(/^        - (.+)$/gm)].map(([, value]) =>
    JSON.parse(value)
  )
}

test('committed submission form taxonomy matches the authoritative taxonomy', () => {
  assert.equal(syncSubmissionForm(form, taxonomy), form)
})

test('generates every prefixed subcategory once', () => {
  const block = buildTaxonomyOptions(taxonomy)
  const sourceCategoryTitles = taxonomy.categories.map(({ title }) => title)
  const sortedCategories = [...taxonomy.categories].sort((left, right) =>
    left.title.localeCompare(right.title, 'en', { sensitivity: 'base' })
  )
  const expected = [
    ...sortedCategories.flatMap(({ title, subsections }) =>
      [...subsections]
        .sort((left, right) =>
          left.title.localeCompare(right.title, 'en', { sensitivity: 'base' })
        )
        .map(({ title: subsectionTitle }) => `${title} / ${subsectionTitle}`)
    ),
    'Not sure / Other'
  ]
  assert.deepEqual(generatedOptions(block), expected)
  assert.deepEqual(
    taxonomy.categories.map(({ title }) => title),
    sourceCategoryTitles
  )
  assert.equal((block.match(/Not sure \/ Other/g) || []).length, 1)
  assert.doesNotMatch(block, /Not sure \/ Let the editor decide/)
  assert.doesNotMatch(block, /Other \/ Suggest a subcategory/)
})

test('updates added, renamed, and removed categories and subcategories exactly', () => {
  const original = {
    categories: [
      {
        title: 'Original Category',
        subsections: [{ title: 'Original Subcategory' }]
      }
    ]
  }
  const changed = {
    categories: [
      {
        title: 'Renamed Category',
        subsections: [{ title: 'New Subcategory' }, { title: 'Another One' }]
      },
      {
        title: 'New Category',
        subsections: [{ title: 'New Category Subcategory' }]
      }
    ]
  }

  assert.deepEqual(generatedOptions(buildTaxonomyOptions(original)), [
    'Original Category / Original Subcategory',
    'Not sure / Other'
  ])
  assert.deepEqual(generatedOptions(buildTaxonomyOptions(changed)), [
    'New Category / New Category Subcategory',
    'Renamed Category / Another One',
    'Renamed Category / New Subcategory',
    'Not sure / Other'
  ])
})

test('dropdown defaults are valid zero-based option indices', () => {
  const block = buildTaxonomyOptions(taxonomy)
  const dropdowns = block.split('\n  - type: dropdown').slice(1)

  for (const dropdown of dropdowns) {
    const optionCount = (dropdown.match(/^        - /gm) || []).length
    const defaultMatch = dropdown.match(/^      default: (\d+)$/m)
    if (!defaultMatch) continue

    const defaultIndex = Number(defaultMatch[1])
    assert.ok(defaultIndex >= 0 && defaultIndex < optionCount, {
      defaultIndex,
      optionCount
    })
  }
})

test('the sync workflow only reacts to taxonomy changes and publishes safely', () => {
  const trigger = syncWorkflow.split('concurrency:')[0]
  assert.match(trigger, /push:/)
  assert.match(trigger, /workflow_dispatch:/)
  assert.match(trigger, /data\/blog-taxonomy\.json/)
  assert.doesNotMatch(trigger, /submit-blog\.yml/)
  assert.match(syncWorkflow, /group: submission-form-publish/)
  assert.match(syncWorkflow, /cancel-in-progress: false/)
  assert.match(
    syncWorkflow,
    /generated_file='\.github\/ISSUE_TEMPLATE\/submit-blog\.yml'/
  )
  assert.match(syncWorkflow, /git add "\$generated_file"/)
  assert.match(
    syncWorkflow,
    /Refusing to publish files other than the generated submission form/
  )
  assert.match(syncWorkflow, /gh pr create/)
})
