import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const linter = path.resolve('scripts/lint-markdown.js')

function runLinter(markdown) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'blogr-markdown-'))
  const file = path.join(directory, 'fixture.md')
  writeFileSync(file, markdown)
  try {
    return spawnSync(process.execPath, [linter, file], {
      encoding: 'utf8'
    })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('ignores repeated words in generated component attributes', () => {
  const result = runLinter(
    '* <BlogHealthLink name="Ban Ban Ton Ton" website-name="Ban Ban Ton Ton" url="https://example.com/" />\n'
  )

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.doesNotMatch(result.stdout, /Repeated word detected/)
})

test('still detects repeated words in normal Markdown prose', () => {
  const result = runLinter('* This is the the genuine mistake.\n')

  assert.notEqual(result.status, 0)
  assert.match(
    `${result.stdout}${result.stderr}`,
    /Repeated word detected: "the"/
  )
})

test('the Markdown linter remains runnable as a standalone command', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'blogr-markdown-'))
  const file = path.join(directory, 'fixture.md')
  writeFileSync(file, '* This is valid prose.\n')
  try {
    execFileSync(process.execPath, [linter, file], { stdio: 'ignore' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
