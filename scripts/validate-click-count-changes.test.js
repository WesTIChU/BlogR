import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  ALLOWED_CLICK_FIELDS,
  validateClickChanges
} from './validate-click-count-changes.js'

const entry = (overrides = {}) => ({
  name: 'Example',
  url: 'https://example.test/',
  description: 'Description',
  category: 'technology',
  clicks: 0,
  ...overrides
})

test('allows click changes in a single catalogue file', () => {
  assert.doesNotThrow(() =>
    validateClickChanges([entry()], [entry({ clicks: 42 })], 'data/blogs.json')
  )
})

test('rejects non-click catalogue metadata changes', () => {
  assert.throws(
    () => validateClickChanges([entry()], [entry({ description: 'Changed' })]),
    /non-click metadata change/
  )
})

test('rejects catalogue entry additions and invalid click fields', () => {
  assert.throws(
    () => validateClickChanges([entry()], [entry(), entry({ name: 'New' })]),
    /cannot be added/
  )
  assert.throws(
    () => validateClickChanges([entry()], [entry({ clicks: -1 })]),
    /invalid clicks value/
  )
})

test('keeps the approved field allowlist explicit', () => {
  assert.deepEqual([...ALLOWED_CLICK_FIELDS], ['clicks'])
})

test('workflow allows either catalogue file without requiring both', async () => {
  const workflow = await readFile(
    '.github/workflows/sync-click-counts.yml',
    'utf8'
  )
  assert.match(workflow, /mapfile -t staged_files/)
  assert.match(
    workflow,
    /data\/blogs\.json\|data\/websites\.json\|data\/communities\.json/
  )
  assert.match(workflow, /shared\/blogr-function-data\.js/)
  assert.match(workflow, /shared\/cloudflare-function-data\.js/)
  assert.doesNotMatch(
    workflow,
    /expected=\$'data\/blogs\.json\\ndata\/websites\.json'/
  )
  assert.match(workflow, /validate-click-count-changes\.js/)
  assert.match(workflow, /generate-function-data\.js --check/)
})
