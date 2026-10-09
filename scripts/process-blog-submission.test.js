import assert from 'node:assert/strict'
import test from 'node:test'
import taxonomy from '../data/blog-taxonomy.json' with { type: 'json' }
import blogs from '../data/blogs.json' with { type: 'json' }
import {
  appendBlogEntry,
  applySuggestedSubcategory,
  buildBlogEntry,
  catalogueFiles,
  existingSubmissionPullRequest,
  extractSuggestedSubcategory,
  hasApprovalPermission,
  insertSubcategoryInTaxonomyText,
  isApprovedSubmissionEvent,
  parseIssueForm,
  pullRequestDetails,
  submissionBranch,
  validateBlogUrl,
  validateSubmission,
  validateSuggestedSubcategory
} from './process-blog-submission.js'

const body = ({
  name = 'Example Blog',
  url = 'https://example.com/',
  description = 'A concise independent blog.',
  category = 'Technology',
  subcategory = 'Technology / Programming & Development',
  notes = ''
} = {}) =>
  `### Blog name\n\n${name}\n\n### Blog URL\n\n${url}\n\n### Short description\n\n${description}\n\n### Main category\n\n${category}\n\n### Subcategory\n\n${subcategory}\n\n### Additional notes\n\n${notes}\n`

const taxonomyWithoutFootball = () => {
  const copy = structuredClone(taxonomy)
  const category = copy.categories.find(
    ({ slug }) => slug === 'lifestyle-and-hobbies'
  )
  category.subsections = category.subsections.filter(
    ({ title }) => title !== 'Football & Sports'
  )
  return copy
}

test('parses a valid issue form and maps taxonomy choices', () => {
  const parsed = parseIssueForm(body())
  const submission = validateSubmission(parsed, blogs, taxonomy)
  assert.deepEqual(submission, {
    name: 'Example Blog',
    url: 'https://example.com/',
    description: 'A concise independent blog.',
    category: 'technology',
    subcategory: 'Programming & Development'
  })
})

test('rejects invalid, local, credentialed, and missing URLs', () => {
  for (const url of [
    '',
    'javascript:alert(1)',
    'https://localhost/blog',
    'https://127.0.0.1/',
    'https://user:pass@example.com/'
  ]) {
    assert.throws(() => validateBlogUrl(url), /URL/)
  }
  assert.throws(
    () =>
      validateSubmission(parseIssueForm(body({ url: '' })), blogs, taxonomy),
    /blog URL/
  )
})

test('rejects missing required fields and unsafe markup', () => {
  assert.throws(() => parseIssueForm(body({ name: '' })), /blog name/)
  assert.throws(
    () => parseIssueForm(body({ description: '<script>x</script>' })),
    /markup/
  )
})

test('rejects duplicate URLs after normalization', () => {
  const existing = blogs[0]
  assert.throws(
    () =>
      validateSubmission(
        parseIssueForm(body({ url: `${existing.url}#duplicate` })),
        blogs,
        taxonomy
      ),
    /Duplicate blog URL/
  )
})

test('rejects invalid categories and mismatched subcategories', () => {
  assert.throws(
    () =>
      validateSubmission(
        parseIssueForm(body({ category: 'Not sure / Let the editor decide' })),
        blogs,
        taxonomy
      ),
    /main category/
  )
  assert.throws(
    () =>
      validateSubmission(
        parseIssueForm(body({ subcategory: 'Books & Writing / Literature' })),
        blogs,
        taxonomy
      ),
    /subcategory/
  )
})

test('allows optional descriptions and suggestion placeholders without inventing data', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({ description: '', subcategory: 'Other / Suggest a subcategory' })
    ),
    blogs,
    taxonomy
  )
  const entry = buildBlogEntry(submission, '2026-10-09')
  assert.equal(entry.description, '')
  assert.equal('subcategory' in entry, false)
  assert.equal(entry.addedDate, '2026-10-09')
})

test('extracts a suggested subcategory from additional notes without adding it', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({
        subcategory: 'Other / Suggest a subcategory',
        notes: 'Suggested subcategory: Football & Sports'
      })
    ),
    blogs,
    taxonomy
  )
  const entry = buildBlogEntry(submission, '2026-10-09')
  assert.equal(submission.suggestedSubcategory, 'Football & Sports')
  assert.equal('subcategory' in entry, false)
  assert.equal('suggestedSubcategory' in entry, false)

  const details = pullRequestDetails(
    entry,
    1,
    'blog-submission/issue-1',
    'main',
    submission.suggestedSubcategory,
    'created'
  )
  assert.match(details.body, /Suggested subcategory \(created\)/)
  assert.match(details.body, /Football & Sports/)
  assert.match(details.body, /added to the official taxonomy/)
})

test('reports when Other was selected without a suggested subcategory', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({ subcategory: 'Other / Suggest a subcategory', notes: '' })
    ),
    blogs,
    taxonomy
  )
  assert.equal(submission.suggestedSubcategory, undefined)
  assert.equal(extractSuggestedSubcategory('Additional context only'), null)
  const details = pullRequestDetails(
    buildBlogEntry(submission, '2026-10-09'),
    1,
    'blog-submission/issue-1',
    'main'
  )
  assert.match(details.body, /No suggested subcategory was provided/)
})

test('normal existing subcategories do not interpret additional notes as suggestions', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({
        notes: 'Suggested subcategory: Should be ignored',
        subcategory: 'Technology / Programming & Development'
      })
    ),
    blogs,
    taxonomy
  )
  assert.equal(submission.subcategory, 'Programming & Development')
  assert.equal(submission.suggestedSubcategory, undefined)
})

test('creates and assigns a new suggested subcategory without mutating the source taxonomy', () => {
  const testTaxonomy = taxonomyWithoutFootball()
  const submission = validateSubmission(
    parseIssueForm(
      body({
        category: 'Lifestyle & Hobbies',
        subcategory: 'Other / Suggest a subcategory',
        notes: 'Suggested subcategory: Football & Sports'
      })
    ),
    blogs,
    testTaxonomy
  )
  const original = structuredClone(testTaxonomy)
  const result = applySuggestedSubcategory(testTaxonomy, submission)
  const category = result.taxonomy.categories.find(
    ({ slug }) => slug === 'lifestyle-and-hobbies'
  )

  assert.deepEqual(testTaxonomy, original)
  assert.equal(result.status, 'created')
  assert.equal(result.submission.subcategory, 'Football & Sports')
  assert.deepEqual(category.subsections.at(-1), {
    title: 'Football & Sports',
    match: 'football|sports'
  })
})

test('reuses an existing suggested subcategory without creating a duplicate', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({
        category: 'Lifestyle & Hobbies',
        subcategory: 'Other / Suggest a subcategory',
        notes: 'Suggested subcategory:  everyday   life '
      })
    ),
    blogs,
    taxonomy
  )
  const result = applySuggestedSubcategory(taxonomy, submission)
  const category = result.taxonomy.categories.find(
    ({ slug }) => slug === 'lifestyle-and-hobbies'
  )

  assert.equal(result.status, 'reused')
  assert.equal(result.submission.subcategory, 'Everyday Life')
  assert.equal(
    category.subsections.filter(({ title }) => title === 'Everyday Life')
      .length,
    1
  )
})

test('rejects unsafe or malformed suggested subcategory names', () => {
  for (const suggestion of ['', 'Bad / Path', '<script>', 'name: value']) {
    assert.throws(
      () => validateSuggestedSubcategory(suggestion),
      /invalid name/
    )
  }
})

test('inserts a new taxonomy subsection without reformatting existing taxonomy text', () => {
  const source = JSON.stringify(taxonomyWithoutFootball(), null, 2)
  const updated = insertSubcategoryInTaxonomyText(
    source,
    'lifestyle-and-hobbies',
    {
      title: 'Football & Sports',
      match: 'football|sports'
    }
  )
  const parsed = JSON.parse(updated)
  const category = parsed.categories.find(
    ({ slug }) => slug === 'lifestyle-and-hobbies'
  )
  assert.deepEqual(category.subsections.at(-1), {
    title: 'Football & Sports',
    match: 'football|sports'
  })
  const restored = updated.replace(
    /,\n        \{\n          "title": "Football & Sports",\n          "match": "football\|sports"\n        \}/,
    ''
  )
  assert.equal(restored, source)
})

test('adding one blog preserves every existing entry and appends in source order', () => {
  const existing = [
    {
      name: 'Existing favourite',
      url: 'https://existing.example/',
      favourite: true,
      recentlyAdded: false,
      category: 'technology'
    },
    {
      name: 'Existing older entry',
      url: 'https://older.example/',
      favourite: false,
      recentlyAdded: true,
      category: 'travel-outdoors'
    }
  ]
  const snapshot = structuredClone(existing)
  const entry = {
    name: 'New blog',
    url: 'https://new.example/',
    favourite: false,
    recentlyAdded: true,
    category: 'lifestyle-and-hobbies'
  }
  const result = appendBlogEntry(existing, entry)

  assert.deepEqual(existing, snapshot)
  assert.deepEqual(result.slice(0, existing.length), snapshot)
  assert.deepEqual(result.at(-1), entry)
})

test('repeated insertion of the same URL is idempotent', () => {
  const existing = [
    { name: 'Existing', url: 'https://example.com/', favourite: true }
  ]
  const entry = {
    name: 'Duplicate',
    url: 'https://EXAMPLE.com/#same-url',
    favourite: false
  }
  const once = appendBlogEntry(existing, entry)
  const twice = appendBlogEntry(once, entry)

  assert.equal(once, existing)
  assert.equal(twice, once)
  assert.deepEqual(twice, existing)
})

test('creates deterministic branches and linked pull request details', () => {
  const branch = submissionBranch(42)
  const details = pullRequestDetails(
    buildBlogEntry(
      {
        name: 'Example Blog',
        url: 'https://example.com/',
        description: 'Description',
        category: 'technology',
        subcategory: 'Programming & Development'
      },
      '2026-10-09'
    ),
    42,
    branch,
    'main'
  )
  assert.equal(branch, 'blog-submission/issue-42')
  assert.equal(details.head, branch)
  assert.equal(details.base, 'main')
  assert.match(details.body, /Closes #42/)
  assert.match(details.body, /blogr-submission:42/)
})

test('only write-capable maintainers may approve submissions', () => {
  assert.equal(hasApprovalPermission({ permission: 'write' }), true)
  assert.equal(hasApprovalPermission({ permission: 'maintain' }), true)
  assert.equal(hasApprovalPermission({ permission: 'admin' }), true)
  assert.equal(hasApprovalPermission({ permission: 'triage' }), false)
  assert.equal(hasApprovalPermission({ permission: 'read' }), false)
  assert.equal(hasApprovalPermission(null), false)
})

test('accepts the labeled event without requiring a missing form label', () => {
  assert.equal(
    isApprovedSubmissionEvent({
      label: { name: 'approved' },
      issue: {
        state: 'open',
        labels: [{ name: 'approved' }],
        body: body()
      }
    }),
    true
  )
  assert.equal(
    isApprovedSubmissionEvent({
      label: { name: 'approved' },
      issue: { state: 'open', body: '### Blog name\n\nNot a complete form' }
    }),
    false
  )
})

test('repeated approval events reuse the existing pull request', () => {
  const existing = {
    number: 9,
    html_url: 'https://github.com/example/repo/pull/9'
  }
  assert.deepEqual(existingSubmissionPullRequest([existing]), existing)
  assert.equal(existingSubmissionPullRequest([]), null)
})

test('catalogue generation is limited to data and known generated pages', () => {
  const files = catalogueFiles(taxonomy)
  assert.equal(files.includes('data/blogs.json'), true)
  assert.equal(
    files.includes('.github/workflows/process-approved-blog-submission.yml'),
    false
  )
  assert.equal(files.length, taxonomy.categories.length + 3)
})
