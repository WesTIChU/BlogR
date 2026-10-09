import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergedSubmissionIssue,
  submissionIssueNumber
} from './complete-blog-submission.js'

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
