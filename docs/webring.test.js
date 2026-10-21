import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const page = await readFile(
  resolve(dirname(fileURLToPath(import.meta.url)), 'webring/index.md'),
  'utf8'
)

test('Webring information page is static while public controls are disabled', () => {
  assert.match(page, /title: Join the BlogR Webring/)
  assert.match(page, /# ► Join the BlogR Webring/)
  assert.match(page, /## How the Webring works/)
  assert.match(page, /## Who can join\?/)
  assert.match(page, /## How to install the widget/)
  assert.match(page, /## Automatic verification/)
  assert.match(page, /## Frequently asked questions/)
  assert.match(page, /Previous.*Random.*Next/s)
  assert.match(page, /Joining is free/)
  assert.match(page, /must remain installed/)
  assert.match(page, /Only verified websites participate/)
  assert.match(page, /12 hours/)
  assert.doesNotMatch(page, /<WebringPage\s*\/>|\/api\/webring\//)
})
