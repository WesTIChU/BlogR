import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import taxonomy from '../data/blog-taxonomy.json' with { type: 'json' }
import {
  buildTaxonomyOptions,
  syncSubmissionForm
} from './generate-submission-form.js'

const form = await readFile('.github/ISSUE_TEMPLATE/submit-blog.yml', 'utf8')

test('committed submission form taxonomy matches the authoritative taxonomy', () => {
  assert.equal(syncSubmissionForm(form, taxonomy), form)
})

test('generates every main category and prefixed subcategory once', () => {
  const block = buildTaxonomyOptions(taxonomy)
  for (const category of taxonomy.categories) {
    assert.match(
      block,
      new RegExp(`"${category.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)
    )
    for (const subsection of category.subsections) {
      assert.match(
        block,
        new RegExp(
          `"${category.title} / ${subsection.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
        )
      )
    }
  }
  assert.equal(
    (block.match(/Not sure \/ Let the editor decide/g) || []).length,
    2
  )
  assert.match(block, /default: 10/)
  assert.doesNotMatch(block, /default: 11/)
  assert.match(block, /Other \/ Suggest a subcategory/)
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
