/* global Request, Response */

import assert from 'node:assert/strict'
import test from 'node:test'
import taxonomy from '../../data/blog-taxonomy.json' with { type: 'json' }
import blogs from '../../data/blogs.json' with { type: 'json' }
import {
  parseIssueForm,
  validateSubmission
} from '../../scripts/process-blog-submission.js'
import {
  buildIssueBody,
  validateSubmissionInput,
  validateUrl
} from './submit-blog-validation.js'
import { onRequestPost } from './submit-blog.js'

const input = (overrides = {}) => ({
  name: 'Example Blog',
  url: 'https://example.com/',
  description: 'A useful description\nwith a second line.',
  category: 'Technology',
  subcategory: 'Programming & Development',
  country: 'GB-SCO',
  ...overrides
})

test('validates the public submission fields against the canonical taxonomy', () => {
  const submission = validateSubmissionInput(input())
  assert.equal(submission.country, 'GB-SCT')
  assert.equal(
    submission.description,
    'A useful description with a second line.'
  )
  assert.equal(submission.subcategory, 'Programming & Development')
  assert.match(buildIssueBody(submission), /Scotland \[GB-SCO\]/)
})

test('rejects unsafe URLs and mismatched subcategories', () => {
  assert.throws(() => validateUrl('javascript:alert(1)'), /HTTP\(S\)/)
  assert.throws(() => validateUrl('http://localhost/'), /public HTTP/)
  assert.throws(
    () => validateSubmissionInput(input({ subcategory: 'Book Reviews' })),
    /Invalid subcategory/
  )
})

test('keeps custom locations editorial-only and compatible with the issue parser', () => {
  const submission = validateSubmissionInput({
    ...input({ country: 'other' }),
    countryPlace: 'Atlantis'
  })
  const body = buildIssueBody(submission)
  const parsed = parseIssueForm(body)
  assert.equal(parsed.countryPlace, 'Atlantis')
  assert.equal(parsed.country, undefined)
  const validated = validateSubmission(parsed, blogs, taxonomy)
  assert.equal(validated.countryPlace, 'Atlantis')
  assert.equal(validated.country, undefined)
  assert.match(body, /### Category \/ Subcategory/)
})

test('Pages Function verifies Turnstile and creates a review-only GitHub issue', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('siteverify')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    if (options?.method === 'POST') {
      return new Response(
        JSON.stringify({
          html_url: 'https://github.com/WesTIChU/BlogR/issues/99'
        }),
        { status: 201 }
      )
    }
    return new Response('[]', { status: 200 })
  }
  try {
    const response = await onRequestPost({
      request: new Request('https://blogr.directory/api/submit-blog', {
        method: 'POST',
        body: JSON.stringify({ ...input(), turnstileToken: 'verified' }),
        headers: {
          'content-type': 'application/json',
          'CF-Connecting-IP': '203.0.113.4'
        }
      }),
      env: {
        GITHUB_TOKEN: 'server-only',
        GITHUB_REPOSITORY: 'WesTIChU/BlogR',
        TURNSTILE_SECRET_KEY: 'turnstile-secret',
        SUBMISSION_RATE_LIMIT: { limit: async () => ({ success: true }) }
      }
    })
    assert.equal(response.status, 200)
    assert.equal(
      (await response.json()).issueUrl,
      'https://github.com/WesTIChU/BlogR/issues/99'
    )
    const issueRequest = calls.find(
      ({ url, options }) =>
        options?.method === 'POST' && url.endsWith('/issues')
    )
    const issue = JSON.parse(issueRequest.options.body)
    assert.deepEqual(issue.labels, ['blog-submission'])
    assert.doesNotMatch(issue.body, /approved/)
    assert.match(issue.body, /Scotland \[GB-SCO\]/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Pages Function fails safely when configuration or rate limiting is unavailable', async () => {
  const request = new Request('https://blogr.directory/api/submit-blog', {
    method: 'POST'
  })
  assert.equal((await onRequestPost({ request, env: {} })).status, 503)
  assert.equal(
    (
      await onRequestPost({
        request,
        env: {
          GITHUB_TOKEN: 'token',
          GITHUB_REPOSITORY: 'WesTIChU/BlogR',
          TURNSTILE_SECRET_KEY: 'secret',
          SUBMISSION_RATE_LIMIT: { limit: async () => ({ success: false }) }
        }
      })
    ).status,
    429
  )
})
