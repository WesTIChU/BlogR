/* global Request, Response */

import assert from 'node:assert/strict'
import test from 'node:test'
import taxonomy from '../../data/blog-taxonomy.json' with { type: 'json' }
import blogs from '../../data/blogs.json' with { type: 'json' }
import independentWebTaxonomy from '../../data/independent-web-taxonomy.json' with { type: 'json' }
import websites from '../../data/websites.json' with { type: 'json' }
import {
  buildIndependentWebsiteIssueBody,
  buildIssueBody,
  validateIndependentWebsiteInput,
  validateSubmissionInput,
  validateUrl
} from '../../functions/api/submit-blog-validation.js'
import { onRequestPost } from '../../functions/api/submit-blog.js'
import {
  parseIssueForm,
  validateSubmission
} from '../../scripts/process-blog-submission.js'
import {
  canonicalSubmissionUrl,
  inspectArticleUrl
} from '../../shared/submission-url.js'

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

test('validates independent websites and carries a new subcategory into review', () => {
  const submission = validateIndependentWebsiteInput({
    name: 'Independent Tool',
    url: 'https://independent-tool.example/',
    description: 'A useful independent tool.',
    category: 'Independent Tools',
    suggestedSubcategory: 'Small Web Utilities'
  })
  assert.equal(submission.subcategory, 'Small Web Utilities')
  assert.match(
    buildIndependentWebsiteIssueBody(submission),
    /Small Web Utilities/
  )
  assert.equal(
    independentWebTaxonomy
      .find(({ title }) => title === 'Independent Tools')
      .subcategories.includes('Small Web Utilities'),
    false
  )
})

test('adds HTTPS to protocol-less URLs without rewriting explicit HTTP', () => {
  assert.equal(validateUrl('ruggedscot.com'), 'https://ruggedscot.com/')
  assert.equal(validateUrl('www.ruggedscot.com'), 'https://www.ruggedscot.com/')
  assert.equal(validateUrl('http://ruggedscot.com/'), 'http://ruggedscot.com/')
  assert.equal(
    validateSubmissionInput(input({ url: 'ruggedscot.com' })).url,
    'https://ruggedscot.com/'
  )
})

test('recognises article URLs and suggests the blog section without rejecting subdirectory sites', () => {
  const article = inspectArticleUrl(
    'https://www.sdlindia.com/blogs/ayurveda-basics/what-is-prakriti'
  )
  assert.equal(article.isArticle, true)
  assert.equal(article.suggestedUrl, 'https://www.sdlindia.com/blogs/')
  assert.equal(
    canonicalSubmissionUrl(
      'https://www.sdlindia.com/blogs/article-one?utm_source=test'
    ),
    'https://sdlindia.com/blogs'
  )
  assert.equal(
    inspectArticleUrl('https://example.com/projects/project-name/').isArticle,
    false
  )
  assert.equal(
    inspectArticleUrl('https://alice.github.io/blog/').isArticle,
    false
  )
  assert.throws(
    () =>
      validateSubmissionInput(input({ url: 'sdlindia.com/blogs/article-one' })),
    (error) =>
      error.code === 'article-url' &&
      error.suggestedUrl === 'https://sdlindia.com/blogs/'
  )
  assert.throws(
    () =>
      validateSubmissionInput(
        input({ url: 'https://example.com/2026/10/article-title' })
      ),
    /individual article/
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
  assert.match(body, /### Directory type/)
  assert.match(body, /### Category\n\nTechnology/)
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

test('Pages Function routes independent websites to the dedicated review label', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('siteverify'))
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    if (options?.method === 'POST')
      return new Response(
        JSON.stringify({
          html_url: 'https://github.com/WesTIChU/BlogR/issues/100'
        }),
        { status: 201 }
      )
    return new Response('[]', { status: 200 })
  }
  try {
    const response = await onRequestPost({
      request: new Request('https://blogr.directory/api/submit-blog', {
        method: 'POST',
        body: JSON.stringify({
          type: 'website',
          name: 'Independent Tool',
          url: 'https://independent-tool.example/',
          description: 'A useful independent tool.',
          category: 'Independent Tools',
          suggestedSubcategory: 'Small Web Utilities',
          turnstileToken: 'verified'
        }),
        headers: { 'content-type': 'application/json' }
      }),
      env: {
        GITHUB_TOKEN: 'server-only',
        GITHUB_REPOSITORY: 'WesTIChU/BlogR',
        TURNSTILE_SECRET_KEY: 'turnstile-secret'
      }
    })
    assert.equal(response.status, 200)
    const issueRequest = calls.find(
      ({ url, options }) =>
        options?.method === 'POST' && url.endsWith('/issues')
    )
    const issue = JSON.parse(issueRequest.options.body)
    assert.deepEqual(issue.labels, ['independent-web-submission'])
    assert.match(issue.body, /Small Web Utilities/)
    assert.doesNotMatch(issue.body, /### Blog name/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Pages Function rejects a published duplicate before checking GitHub issues', async () => {
  const originalFetch = globalThis.fetch
  let githubCalls = 0
  globalThis.fetch = async (url) => {
    if (url.includes('siteverify')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    githubCalls += 1
    return new Response('unexpected', { status: 500 })
  }
  try {
    const response = await onRequestPost({
      request: new Request('https://blogr.directory/api/submit-blog', {
        method: 'POST',
        body: JSON.stringify({
          ...input({
            url: 'http://www.johnclare.blogspot.com/?utm_source=test'
          }),
          turnstileToken: 'verified'
        }),
        headers: { 'content-type': 'application/json' }
      }),
      env: {
        GITHUB_TOKEN: 'server-only',
        GITHUB_REPOSITORY: 'WesTIChU/BlogR',
        TURNSTILE_SECRET_KEY: 'turnstile-secret'
      }
    })
    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), {
      error: 'This blog is already listed in BlogR Directory.'
    })
    assert.equal(githubCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Pages Function rejects an Independent Web duplicate in its own directory', async () => {
  const originalFetch = globalThis.fetch
  let githubCalls = 0
  const existing = websites[0]
  globalThis.fetch = async (url) => {
    if (url.includes('siteverify')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    githubCalls += 1
    return new Response('unexpected', { status: 500 })
  }
  try {
    const response = await onRequestPost({
      request: new Request('https://blogr.directory/api/submit-blog', {
        method: 'POST',
        body: JSON.stringify({
          type: 'website',
          name: existing.name,
          url: `${existing.url}#duplicate`,
          description: 'A duplicate independent website.',
          category: existing.category,
          subcategory: existing.subcategory,
          turnstileToken: 'verified'
        }),
        headers: { 'content-type': 'application/json' }
      }),
      env: {
        GITHUB_TOKEN: 'server-only',
        GITHUB_REPOSITORY: 'WesTIChU/BlogR',
        TURNSTILE_SECRET_KEY: 'turnstile-secret'
      }
    })
    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), {
      error: 'This website is already listed in BlogR Directory.'
    })
    assert.equal(githubCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Pages Function rejects a pending duplicate using URL variations', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('siteverify')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    return new Response(
      JSON.stringify([
        {
          body: '### Blog URL\n\nhttp://www.pending.example/blog/?utm_medium=email#top\n'
        }
      ]),
      { status: 200 }
    )
  }
  try {
    const response = await onRequestPost({
      request: new Request('https://blogr.directory/api/submit-blog', {
        method: 'POST',
        body: JSON.stringify({
          ...input({ url: 'https://pending.example/blog/' }),
          turnstileToken: 'verified'
        }),
        headers: { 'content-type': 'application/json' }
      }),
      env: {
        GITHUB_TOKEN: 'server-only',
        GITHUB_REPOSITORY: 'WesTIChU/BlogR',
        TURNSTILE_SECRET_KEY: 'turnstile-secret'
      }
    })
    assert.equal(response.status, 409)
    assert.deepEqual(await response.json(), {
      error: 'This blog has already been submitted and is awaiting review.'
    })
    assert.equal(
      calls.some(
        ({ url, options }) =>
          options?.method === 'POST' && url.endsWith('/issues')
      ),
      false
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Pages Function rejects individual SDL India articles before creating an issue', async () => {
  const originalFetch = globalThis.fetch
  let githubCalls = 0
  globalThis.fetch = async (url) => {
    if (url.includes('siteverify'))
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    githubCalls++
    return new Response('unexpected', { status: 500 })
  }
  try {
    const response = await onRequestPost({
      request: new Request('https://blogr.directory/api/submit-blog', {
        method: 'POST',
        body: JSON.stringify({
          ...input({
            url: 'https://www.sdlindia.com/blogs/ayurveda-basics/what-is-prakriti'
          }),
          turnstileToken: 'verified'
        }),
        headers: { 'content-type': 'application/json' }
      }),
      env: {
        GITHUB_TOKEN: 'server-only',
        GITHUB_REPOSITORY: 'WesTIChU/BlogR',
        TURNSTILE_SECRET_KEY: 'turnstile-secret'
      }
    })
    assert.equal(response.status, 422)
    assert.deepEqual(await response.json(), {
      error:
        'It looks like you submitted an individual article. BlogR lists websites and blogs rather than individual posts. Did you mean to submit this blog instead?',
      code: 'article-url',
      suggestedUrl: 'https://www.sdlindia.com/blogs/'
    })
    assert.equal(githubCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('serializes simultaneous submissions for the same website identity', async () => {
  const originalFetch = globalThis.fetch
  let issueCreates = 0
  globalThis.fetch = async (url, options) => {
    if (url.includes('siteverify'))
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    if (options?.method === 'POST') {
      issueCreates++
      return new Response(
        JSON.stringify({
          html_url: 'https://github.com/WesTIChU/BlogR/issues/101'
        }),
        { status: 201 }
      )
    }
    return new Response(
      JSON.stringify(
        issueCreates ? [{ body: '### Blog URL\n\nhttps://example.com/\n' }] : []
      ),
      { status: 200 }
    )
  }
  const makeRequest = () =>
    onRequestPost({
      request: new Request('https://blogr.directory/api/submit-blog', {
        method: 'POST',
        body: JSON.stringify({
          ...input({ url: 'https://www.race-example.net/?utm_source=one' }),
          turnstileToken: 'verified'
        }),
        headers: { 'content-type': 'application/json' }
      }),
      env: {
        GITHUB_TOKEN: 'server-only',
        GITHUB_REPOSITORY: 'WesTIChU/BlogR',
        TURNSTILE_SECRET_KEY: 'turnstile-secret'
      }
    })
  try {
    const responses = await Promise.all([makeRequest(), makeRequest()])
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [200, 409]
    )
    assert.equal(issueCreates, 1)
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
