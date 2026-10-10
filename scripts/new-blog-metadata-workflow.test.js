import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile(
  '.github/workflows/new-blog-metadata.yml',
  'utf8'
)
const updatesWorkflow = await readFile(
  '.github/workflows/blog-updates.yml',
  'utf8'
)
const healthWorkflow = await readFile(
  '.github/workflows/blog-health.yml',
  'utf8'
)
const trigger = workflow.split('concurrency:')[0]

test('initial metadata refresh runs only for catalogue pushes', () => {
  assert.match(trigger, /push:/)
  assert.match(trigger, /data\/blogs\.json/)
  assert.match(workflow, /refresh-new-blog-metadata\.js/)
  assert.match(workflow, /BLOG_HEALTH_URLS/)
  assert.match(workflow, /git push/)
})

test('metadata writers share a serialized concurrency group', () => {
  for (const source of [workflow, updatesWorkflow, healthWorkflow]) {
    assert.match(source, /group: blog-metadata-publish/)
    assert.match(source, /cancel-in-progress: false/)
  }
})

test('initial refresh does not trigger itself with metadata-only commits', () => {
  assert.match(trigger, /paths:\s*\n\s+- data\/blogs\.json/)
  assert.doesNotMatch(trigger, /data\/blog-updates\.json/)
  assert.match(workflow, /Commit initial metadata only when changed/)
})

test('health-history heredoc delimiters are flush with the run block', () => {
  const lines = workflow.split('\n')
  const heredocStarts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes("<<'NODE'"))

  assert.equal(heredocStarts.length, 2)
  for (const { index } of heredocStarts) {
    const delimiter = lines
      .slice(index + 1)
      .find((line) => line.trim() === 'NODE')
    assert.equal(delimiter, '          NODE')
  }
})
