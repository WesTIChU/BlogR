import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import taxonomy from '../data/blog-taxonomy.json' with { type: 'json' }
import blogs from '../data/blogs.json' with { type: 'json' }
import communities from '../data/communities.json' with { type: 'json' }
import communityTaxonomy from '../data/community-taxonomy.json' with { type: 'json' }
import independentWebTaxonomy from '../data/independent-web-taxonomy.json' with { type: 'json' }
import websites from '../data/websites.json' with { type: 'json' }
import {
  appendBlogEntry,
  applySuggestedIndependentSubcategory,
  applySuggestedSubcategory,
  buildBlogEntry,
  buildCommunityEntry,
  catalogueFiles,
  communityCatalogueFiles,
  existingSubmissionPullRequest,
  extractSuggestedSubcategory,
  getAdditionMetadata,
  hasApprovalPermission,
  independentWebsiteCatalogueFiles,
  insertSubcategoryInTaxonomyText,
  isApprovedSubmissionEvent,
  parseCommunityIssueForm,
  parseIssueForm,
  parseWebsiteIssueForm,
  pullRequestDetails,
  submissionBranch,
  submissionType,
  validateBlogUrl,
  validateCommunitySubmission,
  validateIndependentWebsiteSubmission,
  validateSubmission,
  validateSuggestedSubcategory
} from './process-blog-submission.js'

const body = ({
  name = 'Example Blog',
  url = 'https://example.com/',
  description = 'A concise independent blog.',
  category = 'Technology',
  subcategory = 'Technology / Programming & Development',
  country = '',
  customCountry = '',
  notes = ''
} = {}) =>
  `### Blog name\n\n${name}\n\n### Blog URL\n\n${url}\n\n### Country\n\n${country}\n\n### Country or place not listed?\n\n${customCountry}\n\n### Short description\n\n${description}\n\n### Main category\n\n${category}\n\n### Subcategory\n\n${subcategory}\n\n### Additional notes\n\n${notes}\n`

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

const communityBody = ({
  name = 'Example Community',
  url = 'https://example.com/community',
  description = 'A friendly community for discussion and shared interests.',
  category = 'Technology',
  type = 'Forum',
  rss = '',
  notes = ''
} = {}) =>
  `### Community name\n\n${name}\n\n### Website URL\n\n${url}\n\n### Description\n\n${description}\n\n### Category\n\n${category}\n\n### Community type\n\n${type}\n\n### RSS feed URL (optional)\n\n${rss}\n\n### Additional notes\n\n${notes}\n`

const websiteBody = ({
  name = 'Example Independent Website',
  url = 'https://independent-example.test/',
  description = 'A useful independent web project.',
  category = 'Personal Websites',
  subcategory = 'Personal Homepages',
  country = ''
} = {}) =>
  `### Website name\n\n${name}\n\n### Website URL\n\n${url}\n\n### Description\n\n${description}\n\n### Category\n\n${category}\n\n### Subcategory\n\n${subcategory}\n\n### Country\n\n${country}\n`

test('validates independent website subcategories and creates new approved taxonomy entries', () => {
  const parsed = parseWebsiteIssueForm(
    websiteBody({ subcategory: 'New Web Project' })
  )
  const submission = validateIndependentWebsiteSubmission(parsed, [], [], [])
  const result = applySuggestedIndependentSubcategory(
    independentWebTaxonomy,
    submission
  )

  assert.equal(result.status, 'created')
  assert.equal(result.submission.subcategory, 'New Web Project')
  assert.deepEqual(
    result.taxonomy.find(({ title }) => title === 'Personal Websites')
      .subcategories,
    ['Personal Homepages', 'New Web Project']
  )
})

test('reuses an existing independent website subcategory without duplication', () => {
  const submission = validateIndependentWebsiteSubmission(
    parseWebsiteIssueForm(
      websiteBody({ subcategory: ' personal   homepages ' })
    ),
    [],
    [],
    []
  )
  const result = applySuggestedIndependentSubcategory(
    independentWebTaxonomy,
    submission
  )

  assert.equal(result.status, 'reused')
  assert.equal(result.submission.subcategory, 'Personal Homepages')
  assert.equal(
    result.taxonomy.find(({ title }) => title === 'Personal Websites')
      .subcategories.length,
    1
  )
})

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

test('parses the combined category and subcategory field', () => {
  const parsed = parseIssueForm(
    body().replace(
      '### Main category\n\nTechnology\n\n### Subcategory\n\nTechnology / Programming & Development',
      '### Category / Subcategory\n\nTechnology / Programming & Development'
    )
  )
  assert.equal(parsed.category, 'Technology')
  assert.equal(parsed.subcategory, 'Technology / Programming & Development')
  assert.deepEqual(validateSubmission(parsed, blogs, taxonomy), {
    name: 'Example Blog',
    url: 'https://example.com/',
    description: 'A concise independent blog.',
    category: 'technology',
    subcategory: 'Programming & Development'
  })
})

test('accepts categories and subcategories added to the taxonomy', () => {
  const changedTaxonomy = structuredClone(taxonomy)
  changedTaxonomy.categories.push({
    slug: 'new-category',
    title: 'New Category',
    subsections: [{ title: 'New Subcategory', match: '.*' }]
  })
  const parsed = parseIssueForm(
    body({
      name: 'New Category Blog',
      url: 'https://new-category.example/'
    }).replace(
      '### Main category\n\nTechnology\n\n### Subcategory\n\nTechnology / Programming & Development',
      '### Category / Subcategory\n\nNew Category / New Subcategory'
    )
  )

  assert.deepEqual(validateSubmission(parsed, blogs, changedTaxonomy), {
    name: 'New Category Blog',
    url: 'https://new-category.example/',
    description: 'A concise independent blog.',
    category: 'new-category',
    subcategory: 'New Subcategory'
  })
})

test('accepts issue 22 with no Personal Writing subcategory', () => {
  const parsed = parseIssueForm(`### Blog name

Notebook - Thamara Kandabada

### Blog URL

https://thamara.co.uk/notebook

### Short description

My personal blog where I write about anything and everything that interests me.

### Main category

Personal Writing

### Subcategory

None

### Country

United Kingdom [GB]

### Additional notes

_No response_
`)
  assert.equal(parsed.subcategory, '')
  assert.deepEqual(
    validateSubmission(
      parsed,
      blogs.filter((blog) => blog.url !== 'https://thamara.co.uk/notebook'),
      taxonomy
    ),
    {
      name: 'Notebook - Thamara Kandabada',
      url: 'https://thamara.co.uk/notebook',
      description:
        'My personal blog where I write about anything and everything that interests me.',
      category: 'personal-writing',
      subcategory: undefined,
      country: 'GB'
    }
  )
})

test('accepts optional country selections and preserves their codes', () => {
  const selections = [
    ['Scotland [GB-SCT]', 'GB-SCT'],
    ['Scotland [GB-SCO]', 'GB-SCT'],
    ['England [GB-ENG]', 'GB-ENG'],
    ['Wales [GB-WLS]', 'GB-WLS'],
    ['Northern Ireland [GB-NIR]', 'GB-NIR'],
    ['United Kingdom [GB]', 'GB'],
    ['GR', 'GR'],
    ['Canada [CA]', 'CA'],
    ['United States [US]', 'US']
  ]

  for (const [country, code] of selections) {
    const submission = validateSubmission(
      parseIssueForm(body({ country })),
      blogs,
      taxonomy
    )
    assert.equal(submission.country, code)
    assert.equal(buildBlogEntry(submission, '2026-10-10').country, code)
  }

  assert.equal(
    validateSubmission(parseIssueForm(body()), blogs, taxonomy).country,
    undefined
  )
  assert.throws(
    () => parseIssueForm(body({ country: 'Atlantis [ZZ]' })),
    /Invalid country/
  )
})

test('retains custom locations for review without storing invented country codes', () => {
  const custom = validateSubmission(
    parseIssueForm(
      body({ country: 'Other / Not listed', customCountry: 'Atlantis' })
    ),
    blogs,
    taxonomy
  )
  assert.equal(custom.country, undefined)
  assert.equal(custom.countryPlace, 'Atlantis')
  assert.equal(buildBlogEntry(custom, '2026-10-10').country, undefined)
  assert.match(
    pullRequestDetails(
      custom,
      42,
      'blog-submission/issue-42',
      'main',
      null,
      'none',
      custom.countryPlace
    ).body,
    /Atlantis/
  )

  const noCustom = validateSubmission(
    parseIssueForm(body({ country: 'Other / Not listed' })),
    blogs,
    taxonomy
  )
  assert.equal(noCustom.country, undefined)
  assert.equal(noCustom.countryPlace, undefined)
})

test('flags a listed country and custom location supplied together', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({ country: 'Ireland [IE]', customCountry: 'Northern Ireland' })
    ),
    blogs,
    taxonomy
  )
  assert.equal(submission.country, 'IE')
  assert.equal(submission.countryPlace, 'Northern Ireland')
  assert.equal(
    submission.countryReview,
    'Listed country and custom location both supplied'
  )
})

test('parses and validates a community submission without touching blogs', () => {
  const parsed = parseCommunityIssueForm(communityBody())
  assert.equal(submissionType(communityBody()), 'community')
  const submission = validateCommunitySubmission(parsed, communities)
  assert.deepEqual(submission, {
    name: 'Example Community',
    url: 'https://example.com/community',
    description: 'A friendly community for discussion and shared interests.',
    category: 'technology',
    section: 'forums'
  })
  const entry = buildCommunityEntry(
    submission,
    '2026-10-11',
    '2026-10-10T23:30:00.000Z'
  )
  assert.equal(entry.addedDate, '2026-10-11')
  assert.equal(entry.addedAt, '2026-10-10T23:30:00.000Z')
  assert.equal(entry.favourite, false)
  assert.deepEqual(communityCatalogueFiles(), [
    'data/communities.json',
    'docs/communities/online-communities.md'
  ])
})

test('approval detection accepts community forms alongside blog forms', () => {
  assert.equal(submissionType(body()), 'blog')
  assert.equal(submissionType(communityBody()), 'community')
  assert.equal(submissionType(body(), ['approved']), 'blog')
  assert.equal(submissionType(body(), ['community-submission']), null)
  assert.equal(
    submissionType(communityBody(), ['community-submission']),
    'community'
  )
  assert.equal(submissionType(communityBody(), ['blog-submission']), null)
  assert.equal(
    submissionType(communityBody(), [
      'blog-submission',
      'community-submission'
    ]),
    null
  )
  assert.equal(
    submissionType(`${body()}\n${communityBody()}`, ['approved']),
    null
  )
  assert.equal(submissionType(communityBody(), ['approved']), 'community')
})

test('community form categories match the community taxonomy', async () => {
  const form = await readFile(
    new URL('../.github/ISSUE_TEMPLATE/submit-community.yml', import.meta.url),
    'utf8'
  )
  const options = [...form.matchAll(/^        - (.+)$/gm)]
    .map(([, value]) => value)
    .slice(0, communityTaxonomy.length)
  assert.deepEqual(
    options,
    communityTaxonomy.map(({ title }) => title)
  )
})

test('rejects invalid, duplicate and incomplete community submissions', () => {
  assert.throws(
    () =>
      validateCommunitySubmission(
        parseCommunityIssueForm(communityBody({ url: 'javascript:bad' })),
        communities
      ),
    /URL/
  )
  assert.throws(
    () =>
      validateCommunitySubmission(
        parseCommunityIssueForm(communityBody({ url: communities[0].url })),
        communities
      ),
    /Duplicate community URL/
  )
  assert.doesNotThrow(() =>
    validateCommunitySubmission(
      parseCommunityIssueForm(communityBody({ url: blogs[0].url })),
      communities,
      blogs
    )
  )
  assert.throws(
    () =>
      validateCommunitySubmission(
        parseCommunityIssueForm(communityBody({ category: 'Unknown' })),
        communities
      ),
    /community category/
  )
  assert.throws(
    () => parseCommunityIssueForm(communityBody({ name: '', description: '' })),
    /community name|description/
  )
})

test('accepts the renamed arts category and film subcategory', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({
        category: 'Arts & Entertainment',
        subcategory: 'Arts & Entertainment / Film, TV & Theatre'
      })
    ),
    blogs,
    taxonomy
  )

  assert.equal(submission.category, 'arts-and-entertainment')
  assert.equal(submission.subcategory, 'Film, TV & Theatre')
})

test('accepts Arts & Entertainment gaming submissions', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({
        category: 'Arts & Entertainment',
        subcategory: 'Arts & Entertainment / Gaming'
      })
    ),
    blogs,
    taxonomy
  )

  assert.deepEqual(
    {
      category: submission.category,
      subcategory: submission.subcategory
    },
    { category: 'arts-and-entertainment', subcategory: 'Gaming' }
  )
})

test('creates a new subcategory for the selected approved main category', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({
        name: 'The Neveen Edit Test',
        url: 'https://test-neveenwood.com/',
        description: 'Beauty and lifestyle writing.',
        category: 'Lifestyle & Hobbies',
        subcategory: 'Beauty & Skin Health',
        country: 'United Kingdom [GB]'
      })
    ),
    blogs,
    taxonomy
  )

  assert.deepEqual(submission, {
    name: 'The Neveen Edit Test',
    url: 'https://test-neveenwood.com/',
    description: 'Beauty and lifestyle writing.',
    category: 'lifestyle-and-hobbies',
    subcategory: undefined,
    country: 'GB',
    suggestedSubcategory: 'Beauty & Skin Health'
  })

  const result = applySuggestedSubcategory(taxonomy, submission)
  assert.equal(result.status, 'created')
  assert.equal(result.submission.subcategory, 'Beauty & Skin Health')
  assert.equal(result.subsection.match, 'beauty|skin|health')
})

test('reuses an existing subcategory despite prefix, case, and punctuation differences', () => {
  const submission = validateSubmission(
    parseIssueForm(
      body({
        category: 'lifestyle & hobbies',
        subcategory: 'lifestyle & hobbies / EVERYDAY---LIFE'
      })
    ),
    blogs,
    taxonomy
  )

  assert.equal(submission.category, 'lifestyle-and-hobbies')
  assert.equal(submission.subcategory, 'Everyday Life')
  assert.equal(submission.suggestedSubcategory, undefined)
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

test('keeps blog and Independent Web duplicate checks separate', () => {
  const existingBlog = blogs[0]
  const existingWebsite = websites[0]

  assert.throws(
    () =>
      validateSubmission(
        parseIssueForm(
          body({
            url:
              existingBlog.url.replace(/^https?:\/\/www\./, 'http://') +
              '?utm_source=test#section'
          })
        ),
        blogs,
        taxonomy
      ),
    /Duplicate blog URL/
  )
  assert.doesNotThrow(() =>
    validateSubmission(
      parseIssueForm(body({ url: existingWebsite.url })),
      blogs,
      taxonomy
    )
  )

  assert.throws(
    () =>
      validateIndependentWebsiteSubmission(
        parseWebsiteIssueForm(
          websiteBody({
            url:
              existingWebsite.url.replace(/^https?:\/\//, 'http://') +
              '?utm_medium=email#section'
          })
        ),
        websites,
        blogs,
        communities
      ),
    /Duplicate website URL/
  )
  assert.doesNotThrow(() =>
    validateIndependentWebsiteSubmission(
      parseWebsiteIssueForm(websiteBody({ url: existingBlog.url })),
      websites,
      blogs,
      communities
    )
  )

  assert.doesNotThrow(() =>
    validateIndependentWebsiteSubmission(
      parseWebsiteIssueForm(
        websiteBody({ url: 'https://imaginary.nu/second-path' })
      ),
      [{ url: 'https://imaginary.nu/first-path' }],
      [],
      []
    )
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

test('records the approval timestamp for Recently Added ordering', () => {
  const submission = validateSubmission(parseIssueForm(body()), blogs, taxonomy)
  const entry = buildBlogEntry(
    submission,
    '2026-10-09',
    '2026-10-09T16:30:00.000Z'
  )
  assert.equal(entry.addedDate, '2026-10-09')
  assert.equal(entry.addedAt, '2026-10-09T16:30:00.000Z')
})

test('uses the Europe/London calendar date for a UTC approval timestamp', () => {
  assert.deepEqual(getAdditionMetadata(new Date('2026-10-10T23:30:00.000Z')), {
    addedDate: '2026-10-11',
    addedAt: '2026-10-10T23:30:00.000Z'
  })
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

test('approval catalogue files include only the submission pages and its country page', () => {
  const files = catalogueFiles(taxonomy, {
    category: 'arts-and-entertainment',
    country: 'GR'
  })
  assert.deepEqual(files, [
    'data/blogs.json',
    'docs/blogs.md',
    'docs/recently-added.md',
    'docs/collections/arts-and-entertainment.md',
    'docs/country/greece.md'
  ])
  assert.equal(files.includes('docs/collections/travel-outdoors.md'), false)
})

test('independent website approvals include taxonomy, form and directory outputs', () => {
  const files = independentWebsiteCatalogueFiles()
  assert.equal(files.includes('data/websites.json'), true)
  assert.equal(files.includes('data/independent-web-taxonomy.json'), true)
  assert.equal(
    files.includes('.github/ISSUE_TEMPLATE/submit-independent-website.yml'),
    true
  )
  assert.equal(files.includes('docs/independent-web/index.md'), true)
  assert.equal(files.length, independentWebTaxonomy.length + 4)
})
