import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  mergedSubmissionIssue,
  submissionIssueNumber
} from './complete-blog-submission.js'

const healthWorkflow = await readFile(
  '.github/workflows/blog-health.yml',
  'utf8'
)
const completionWorkflow = await readFile(
  '.github/workflows/complete-approved-blog-submission.yml',
  'utf8'
)

test('extracts the linked issue from a generated pull request', () => {
  assert.equal(submissionIssueNumber('text <!-- blogr-submission:42 -->'), 42)
  assert.equal(submissionIssueNumber('unrelated pull request'), null)
})

test('only completes merged submission pull requests for the default branch', () => {
  const event = {
    repository: { default_branch: 'main' },
    pull_request: {
      merged: true,
      body: '<!-- blogr-submission:42 -->',
      html_url: 'https://github.com/example/repo/pull/7',
      number: 7,
      base: { ref: 'main' },
      head: { ref: 'blog-submission/issue-42' }
    }
  }
  assert.equal(mergedSubmissionIssue(event), 42)
  assert.equal(
    mergedSubmissionIssue({
      ...event,
      pull_request: { ...event.pull_request, merged: false }
    }),
    null
  )
  assert.equal(
    mergedSubmissionIssue({
      ...event,
      pull_request: { ...event.pull_request, head: { ref: 'feature' } }
    }),
    null
  )
})

test('only merged generated submission PRs qualify for the health audit', () => {
  const event = {
    repository: { default_branch: 'main' },
    pull_request: {
      merged: true,
      body: '<!-- blogr-submission:42 -->',
      base: { ref: 'main' },
      head: { ref: 'blog-submission/issue-42' }
    }
  }
  assert.equal(mergedSubmissionIssue(event), 42)
  assert.equal(
    mergedSubmissionIssue({
      ...event,
      pull_request: { ...event.pull_request, head: { ref: 'ordinary-feature' } }
    }),
    null
  )
})

test('recognises merged community submission pull requests', () => {
  const event = {
    repository: { default_branch: 'main' },
    pull_request: {
      merged: true,
      body: '<!-- community-submission:42 -->',
      base: { ref: 'main' },
      head: { ref: 'community-submission/issue-42' }
    }
  }
  assert.equal(mergedSubmissionIssue(event), 42)
})

test('health audit keeps scheduled/manual triggers and is reusable', () => {
  assert.match(healthWorkflow, /workflow_call:/)
  assert.match(healthWorkflow, /schedule:/)
  assert.match(healthWorkflow, /workflow_dispatch:/)
  assert.match(healthWorkflow, /run: pnpm audit:blogs/)
  assert.match(healthWorkflow, /docs\/public\/health-status\.json/)
  assert.match(healthWorkflow, /group: blog-metadata-publish/)
  assert.match(healthWorkflow, /contents: write/)
  assert.match(completionWorkflow, /contents: write/)
  assert.match(
    completionWorkflow,
    /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/
  )
  assert.match(completionWorkflow, /contents: none/)
  assert.match(
    completionWorkflow,
    /uses: \.\/\.github\/workflows\/blog-health\.yml/
  )
  assert.match(
    completionWorkflow,
    /github\.event\.pull_request\.base\.ref ==\s+github\.event\.repository\.default_branch/
  )
  assert.match(
    completionWorkflow,
    /startsWith\(github\.event\.pull_request\.head\.ref, 'blog-submission\/issue-'\)/
  )
  assert.match(completionWorkflow, /community-submission\/issue-/)
  assert.match(
    completionWorkflow,
    /contains\(github\.event\.pull_request\.body, '<!-- blogr-submission:'\)/
  )
})
