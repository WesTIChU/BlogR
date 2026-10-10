import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import communityTaxonomy from '../data/community-taxonomy.json' with { type: 'json' }
import { normalizeBlogHealthUrl } from '../shared/blog-health-url.js'
import { getLondonDateKey } from '../shared/recently-added.js'
import { validateBlogs, validateCommunities } from './generate-blog-pages.js'

const exec = promisify(execFile)
const API_ROOT = 'https://api.github.com'
const MAX_NAME_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500
const MAX_URL_LENGTH = 2048
const IGNORED_SUBCATEGORIES = new Set([
  'Not sure / Let the editor decide',
  'Other / Suggest a subcategory'
])
const REQUIRED_FORM_HEADINGS = [
  '### Blog name',
  '### Blog URL',
  '### Main category'
]
const REQUIRED_COMMUNITY_HEADINGS = [
  '### Community name',
  '### Website URL',
  '### Description',
  '### Category',
  '### Community type'
]

export function submissionType(body, labels = null) {
  if (typeof body !== 'string') return null
  if (Array.isArray(labels)) {
    const isBlog = labels.includes('blog-submission')
    const isCommunity = labels.includes('community-submission')
    if (isBlog && isCommunity) return null
    if (!isBlog && !isCommunity) {
      const hasBlogHeadings = REQUIRED_FORM_HEADINGS.every((heading) =>
        body.includes(heading)
      )
      const hasCommunityHeadings = REQUIRED_COMMUNITY_HEADINGS.every(
        (heading) => body.includes(heading)
      )
      return hasBlogHeadings === hasCommunityHeadings
        ? null
        : hasBlogHeadings
          ? 'blog'
          : 'community'
    }
    if (
      isBlog &&
      !REQUIRED_FORM_HEADINGS.every((heading) => body.includes(heading))
    ) {
      return null
    }
    if (
      isCommunity &&
      !REQUIRED_COMMUNITY_HEADINGS.every((heading) => body.includes(heading))
    ) {
      return null
    }
    return isBlog ? 'blog' : 'community'
  }
  if (REQUIRED_FORM_HEADINGS.every((heading) => body.includes(heading))) {
    return 'blog'
  }
  if (REQUIRED_COMMUNITY_HEADINGS.every((heading) => body.includes(heading))) {
    return 'community'
  }
  return null
}

export function isApprovedSubmissionEvent(event) {
  const body = event?.issue?.body
  return (
    event?.label?.name === 'approved' &&
    event?.issue?.state === 'open' &&
    typeof body === 'string' &&
    submissionType(body) !== null
  )
}

const cleanValue = (value, field, maxLength) => {
  if (typeof value !== 'string') throw new Error(`Missing ${field}`)
  const cleaned = value.trim()
  if (!cleaned || cleaned === '_No response_') {
    throw new Error(`Missing ${field}`)
  }
  if (cleaned.length > maxLength) throw new Error(`${field} is too long`)
  if (/\r|\n|[\u0000-\u001f\u007f]/.test(cleaned)) {
    throw new Error(`${field} must be a single line`)
  }
  if (/[<>`]/.test(cleaned)) {
    throw new Error(`${field} contains unsupported markup`)
  }
  return cleaned
}

export function parseIssueForm(body) {
  if (typeof body !== 'string' || body.length > 20_000) {
    throw new Error('Issue form body is missing or too large')
  }

  const fields = new Map()
  const headingPattern = /^###\s+([^\r\n]+)\r?\n/gm
  const headings = [...body.matchAll(headingPattern)]
  for (const [index, match] of headings.entries()) {
    const heading = match[1].trim().toLocaleLowerCase()
    if (fields.has(heading))
      throw new Error(`Duplicate issue form field: ${heading}`)
    const valueStart = match.index + match[0].length
    const valueEnd = headings[index + 1]?.index ?? body.length
    fields.set(heading, body.slice(valueStart, valueEnd).trim())
  }

  const get = (heading) => fields.get(heading) ?? ''
  const description = get('short description')
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error('Description is too long')
  }
  if (/\r|\n|[\u0000-\u001f\u007f]/.test(description)) {
    throw new Error('Description must be a single line')
  }
  if (/[<>`]/.test(description)) {
    throw new Error('Description contains unsupported markup')
  }

  return {
    name: cleanValue(get('blog name'), 'blog name', MAX_NAME_LENGTH),
    url: cleanValue(get('blog url'), 'blog URL', MAX_URL_LENGTH),
    description: description === '_No response_' ? '' : description,
    category: cleanValue(get('main category'), 'main category', 120),
    subcategory:
      get('subcategory') === '_No response_' ? '' : get('subcategory'),
    notes: get('additional notes')
  }
}

export function parseCommunityIssueForm(body) {
  if (typeof body !== 'string' || body.length > 20_000) {
    throw new Error('Issue form body is missing or too large')
  }

  const fields = new Map()
  const headingPattern = /^###\s+([^\r\n]+)\r?\n/gm
  const headings = [...body.matchAll(headingPattern)]
  for (const [index, match] of headings.entries()) {
    const heading = match[1].trim().toLocaleLowerCase()
    if (fields.has(heading))
      throw new Error(`Duplicate issue form field: ${heading}`)
    const valueStart = match.index + match[0].length
    const valueEnd = headings[index + 1]?.index ?? body.length
    fields.set(heading, body.slice(valueStart, valueEnd).trim())
  }

  const get = (heading) => fields.get(heading) ?? ''
  const description = cleanValue(
    get('description'),
    'description',
    MAX_DESCRIPTION_LENGTH
  )
  const rssUrl = get('rss feed url (optional)') || get('rss feed url')
  if (rssUrl && rssUrl !== '_No response_') validateBlogUrl(rssUrl)

  return {
    name: cleanValue(get('community name'), 'community name', MAX_NAME_LENGTH),
    url: cleanValue(get('website url'), 'website URL', MAX_URL_LENGTH),
    description,
    category: cleanValue(get('category'), 'category', 120),
    section: cleanValue(get('community type'), 'community type', 80),
    rssUrl: rssUrl && rssUrl !== '_No response_' ? rssUrl.trim() : null,
    notes: get('additional notes')
  }
}

export function extractSuggestedSubcategory(notes) {
  if (typeof notes !== 'string') return null
  const match = notes.match(
    /(?:^|\r?\n)\s*(?:[-*]\s*)?Suggested subcategory\s*:\s*([^\r\n]+)/i
  )
  if (!match) return null

  const suggestion = match[1].trim()
  if (!suggestion || suggestion.length > 120) {
    throw new Error('Suggested subcategory is missing or too long')
  }
  if (/[\u0000-\u001f\u007f<>`]/.test(suggestion)) {
    throw new Error('Suggested subcategory contains unsupported content')
  }
  return suggestion
}

const normalizeSubcategoryTitle = (value) => value.trim().replace(/\s+/g, ' ')

export function validateSuggestedSubcategory(value) {
  const title = normalizeSubcategoryTitle(value)
  if (
    !title ||
    title.length > 80 ||
    !/^[\p{L}\p{N}][\p{L}\p{N} &'’\-]*[\p{L}\p{N}]$/u.test(title)
  ) {
    throw new Error('Suggested subcategory contains an invalid name')
  }
  return title
}

const subcategoryKey = (value) =>
  normalizeSubcategoryTitle(value).toLocaleLowerCase()

const subcategoryMatch = (title) =>
  [...new Set(title.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|') || '.*'

export function applySuggestedSubcategory(taxonomy, submission) {
  const nextTaxonomy = structuredClone(taxonomy)
  if (!submission.suggestedSubcategory) {
    return {
      taxonomy: nextTaxonomy,
      submission: { ...submission },
      status: 'none'
    }
  }

  const category = nextTaxonomy.categories.find(
    ({ slug }) => slug === submission.category
  )
  if (!category) throw new Error('Invalid main category')

  const title = validateSuggestedSubcategory(submission.suggestedSubcategory)
  const existing = (category.subsections ?? []).find(
    ({ title: existingTitle }) =>
      subcategoryKey(existingTitle) === subcategoryKey(title)
  )
  if (existing) {
    return {
      taxonomy: nextTaxonomy,
      submission: { ...submission, subcategory: existing.title },
      status: 'reused'
    }
  }

  category.subsections ??= []
  category.subsections.push({ title, match: subcategoryMatch(title) })
  return {
    taxonomy: nextTaxonomy,
    submission: { ...submission, subcategory: title },
    status: 'created',
    subsection: { title, match: subcategoryMatch(title) }
  }
}

function matchingBracket(text, openingIndex) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = openingIndex; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '[') depth += 1
    else if (character === ']' && --depth === 0) return index
  }
  throw new Error('Could not locate taxonomy subsection list')
}

export function insertSubcategoryInTaxonomyText(
  text,
  categorySlug,
  subsection
) {
  const slugIndex = text.indexOf(`"slug": ${JSON.stringify(categorySlug)}`)
  if (slugIndex === -1) throw new Error('Could not locate taxonomy category')
  const subsectionKey = text.indexOf('"subsections": [', slugIndex)
  if (subsectionKey === -1)
    throw new Error('Could not locate taxonomy subsections')
  const openingIndex = text.indexOf('[', subsectionKey)
  const closingIndex = matchingBracket(text, openingIndex)
  const closingLineStart = text.lastIndexOf('\n', closingIndex) + 1
  const indentation = text.slice(closingLineStart, closingIndex)
  const itemIndentation = `${indentation}  `
  const item = [
    `${itemIndentation}{`,
    `${itemIndentation}  "title": ${JSON.stringify(subsection.title)},`,
    `${itemIndentation}  "match": ${JSON.stringify(subsection.match)}`,
    `${itemIndentation}}`
  ].join('\n')
  let prefix = text.slice(0, closingIndex).replace(/[ \t\r\n]+$/, '')
  if (!prefix.endsWith('[') && !prefix.endsWith(',')) prefix += ','
  return `${prefix}\n${item}\n${indentation}${text.slice(closingIndex)}`
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}

export function validateBlogUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    throw new Error('Blog URL is missing or too long')
  }
  let url
  try {
    url = normalizeBlogHealthUrl(value.trim())
  } catch {
    throw new Error('Blog URL must be a valid HTTP(S) URL')
  }
  const hostname = url.hostname.toLocaleLowerCase()
  if (
    url.username ||
    url.password ||
    url.protocol === 'file:' ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    isPrivateIpv4(hostname) ||
    hostname.includes(':')
  ) {
    throw new Error('Blog URL points to a local or otherwise unsafe host')
  }
  if (!hostname.includes('.'))
    throw new Error('Blog URL must use a public hostname')
  return url.toString()
}

function taxonomyMaps(taxonomy) {
  const categories = new Map(
    taxonomy.categories.map((item) => [item.title, item])
  )
  const subcategories = new Map()
  for (const category of taxonomy.categories) {
    for (const subsection of category.subsections ?? []) {
      subcategories.set(`${category.title} / ${subsection.title}`, {
        category,
        title: subsection.title
      })
    }
  }
  return { categories, subcategories }
}

export function validateSubmission(submission, blogs, taxonomy) {
  const name = cleanValue(submission.name, 'blog name', MAX_NAME_LENGTH)
  const url = validateBlogUrl(submission.url)
  const description = submission.description ?? ''
  if (
    typeof description !== 'string' ||
    description.length > MAX_DESCRIPTION_LENGTH
  ) {
    throw new Error('Description is missing or too long')
  }
  if (/\r|\n|[\u0000-\u001f\u007f<>`]/.test(description)) {
    throw new Error('Description contains unsupported content')
  }

  const { categories, subcategories } = taxonomyMaps(taxonomy)
  const category = categories.get(submission.category)
  if (!category) throw new Error('Invalid main category')

  let subcategory
  const requestedSubcategory = (submission.subcategory ?? '').trim()
  const suggestedSubcategory = IGNORED_SUBCATEGORIES.has(requestedSubcategory)
    ? extractSuggestedSubcategory(submission.notes)
    : null
  if (
    requestedSubcategory &&
    !IGNORED_SUBCATEGORIES.has(requestedSubcategory)
  ) {
    const match = subcategories.get(requestedSubcategory)
    if (!match || match.category.slug !== category.slug) {
      throw new Error('Invalid subcategory for the selected main category')
    }
    subcategory = match.title
  }

  const normalizedUrl = normalizeBlogHealthUrl(url).toString()
  const duplicate = blogs.find(
    (blog) => normalizeBlogHealthUrl(blog.url).toString() === normalizedUrl
  )
  if (duplicate)
    throw new Error(`Duplicate blog URL already exists: ${duplicate.name}`)

  return {
    name,
    url,
    description,
    category: category.slug,
    subcategory,
    ...(suggestedSubcategory ? { suggestedSubcategory } : {})
  }
}

const communityCategories = new Map(
  communityTaxonomy.map(({ slug, title }) => [title, { slug, title }])
)

export function validateCommunitySubmission(
  submission,
  communities,
  blogs = []
) {
  const name = cleanValue(submission.name, 'community name', MAX_NAME_LENGTH)
  const url = validateBlogUrl(submission.url)
  const description = cleanValue(
    submission.description,
    'description',
    MAX_DESCRIPTION_LENGTH
  )
  const category = communityCategories.get(submission.category)
  if (!category) throw new Error('Invalid community category')
  const sectionByTitle = new Map([
    ['Forum', 'forums'],
    ['Independent Community', 'independent-communities']
  ])
  const section = sectionByTitle.get(submission.section)
  if (!section) throw new Error('Invalid community type')

  const normalizedUrl = normalizeBlogHealthUrl(url).toString()
  const duplicate = [...communities, ...blogs].find(
    (community) =>
      normalizeBlogHealthUrl(community.url).toString() === normalizedUrl
  )
  if (duplicate) {
    throw new Error(`Duplicate community URL already exists: ${duplicate.name}`)
  }

  return {
    name,
    url,
    description,
    category: category.slug,
    section,
    ...(submission.rssUrl ? { rssUrl: validateBlogUrl(submission.rssUrl) } : {})
  }
}

export function buildBlogEntry(submission, addedDate, addedAt) {
  return {
    name: submission.name,
    url: submission.url,
    description: submission.description,
    category: submission.category,
    ...(submission.subcategory ? { subcategory: submission.subcategory } : {}),
    topics: [],
    recentlyAdded: true,
    favourite: false,
    noLongerUpdated: false,
    addedDate,
    ...(addedAt ? { addedAt } : {})
  }
}

const communityId = (name) =>
  name
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')

export function buildCommunityEntry(submission, addedDate, addedAt) {
  return {
    id: communityId(submission.name),
    name: submission.name,
    url: submission.url,
    description: submission.description,
    category: submission.category,
    section: submission.section,
    topics: [],
    recentlyAdded: true,
    favourite: false,
    noLongerUpdated: false,
    addedDate,
    addedAt,
    ...(submission.rssUrl ? { rssUrl: submission.rssUrl } : {})
  }
}

export function getAdditionMetadata(now = new Date()) {
  const addedAt = now.toISOString()
  return { addedDate: getLondonDateKey(now), addedAt }
}

export function appendBlogEntry(entries, entry) {
  const normalizedUrl = normalizeBlogHealthUrl(entry.url).toString()
  if (
    entries.some(
      (existing) =>
        normalizeBlogHealthUrl(existing.url).toString() === normalizedUrl
    )
  ) {
    return entries
  }
  return [...entries, entry]
}

export function submissionBranch(issueNumber, type = 'blog') {
  if (!/^\d+$/.test(String(issueNumber)))
    throw new Error('Invalid issue number')
  if (!['blog', 'community'].includes(type))
    throw new Error('Invalid submission type')
  return `${type}-submission/issue-${issueNumber}`
}

export function hasApprovalPermission(permission) {
  return ['admin', 'maintain', 'write'].includes(permission?.permission)
}

export function existingSubmissionPullRequest(pullRequests) {
  return pullRequests.find((pullRequest) => pullRequest?.number) ?? null
}

export function catalogueFiles(taxonomy) {
  return [
    'data/blogs.json',
    'docs/blogs.md',
    'docs/recently-added.md',
    'docs/personal-writing.md',
    ...taxonomy.categories
      .filter(({ slug }) => slug !== 'personal-writing')
      .map(({ slug }) => `docs/collections/${slug}.md`)
  ]
}

export function communityCatalogueFiles() {
  return ['data/communities.json', 'docs/communities/online-communities.md']
}

export function pullRequestDetails(
  entry,
  issueNumber,
  branch,
  base,
  suggestedSubcategory,
  suggestedSubcategoryStatus = 'none'
) {
  const suggestionSection = suggestedSubcategory
    ? `### Suggested subcategory (${suggestedSubcategoryStatus})\n\n**${suggestedSubcategory}**\n\nThe subcategory was ${suggestedSubcategoryStatus === 'created' ? 'added to the official taxonomy and assigned to this blog' : 'matched to an existing taxonomy entry and assigned to this blog'}.`
    : '### Suggested subcategory for review\n\nNo suggested subcategory was provided.'
  return {
    title: `Add blog: ${entry.name}`,
    head: branch,
    base,
    body: `## Approved blog submission\n\n- **Name:** ${entry.name}\n- **URL:** ${entry.url}\n- **Category:** ${entry.category}${entry.subcategory ? `\n- **Subcategory:** ${entry.subcategory}` : ''}\n\n${suggestionSection}\n\nAdds the approved submission from #${issueNumber}.\n\nCloses #${issueNumber}\n<!-- blogr-submission:${issueNumber} -->`
  }
}

export function communityPullRequestDetails(entry, issueNumber, branch, base) {
  return {
    title: `Add community: ${entry.name}`,
    head: branch,
    base,
    body: `## Approved community submission\n\n- **Name:** ${entry.name}\n- **URL:** ${entry.url}\n- **Category:** ${entry.category}\n- **Type:** ${entry.section}\n\nAdds the approved submission from #${issueNumber}.\n\nCloses #${issueNumber}\n<!-- community-submission:${issueNumber} -->`
  }
}

const apiRequest = async (token, path, options = {}) => {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok)
    throw new Error(`GitHub API request failed (${response.status})`)
  return data
}

const comment = (token, owner, repo, issueNumber, body) =>
  apiRequest(token, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body })
  })

async function run() {
  const token = process.env.BLOGR_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  const issueNumber = process.env.ISSUE_NUMBER
  const approver = process.env.APPROVER_LOGIN
  if (!token || !repository || !issueNumber || !approver) {
    throw new Error('Required workflow environment is missing')
  }
  const [owner, repo] = repository.split('/')
  const permission = await apiRequest(
    token,
    `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(approver)}/permission`
  )
  if (!hasApprovalPermission(permission)) {
    throw new Error(
      'Only repository maintainers with write access may approve submissions'
    )
  }

  const issue = await apiRequest(
    token,
    `/repos/${owner}/${repo}/issues/${issueNumber}`
  )
  const labels = issue.labels.map((label) =>
    typeof label === 'string' ? label : label.name
  )
  const type = submissionType(issue.body, labels)
  if (issue.state !== 'open' || !labels.includes('approved') || !type) {
    throw new Error('Issue is not an open approved submission')
  }

  const taxonomyText = await readFile(
    resolve('data/blog-taxonomy.json'),
    'utf8'
  )
  const taxonomy = JSON.parse(taxonomyText)
  const blogs = JSON.parse(await readFile(resolve('data/blogs.json'), 'utf8'))
  const communities = JSON.parse(
    await readFile(resolve('data/communities.json'), 'utf8')
  )
  let submission
  let nextTaxonomy = taxonomy
  let suggestedSubcategoryStatus = 'none'
  let subsection
  if (type === 'blog') {
    validateBlogs(blogs)
    const parsedSubmission = validateSubmission(
      parseIssueForm(issue.body),
      blogs,
      taxonomy
    )
    const result = applySuggestedSubcategory(taxonomy, parsedSubmission)
    nextTaxonomy = result.taxonomy
    submission = result.submission
    suggestedSubcategoryStatus = result.status
    subsection = result.subsection
  } else {
    validateCommunities(communities)
    submission = validateCommunitySubmission(
      parseCommunityIssueForm(issue.body),
      communities,
      blogs
    )
  }
  const branch = submissionBranch(issueNumber, type)
  const repositoryInfo = await apiRequest(token, `/repos/${owner}/${repo}`)
  const existingPrs = await apiRequest(
    token,
    `/repos/${owner}/${repo}/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=10`
  )
  const existing = existingSubmissionPullRequest(existingPrs)
  if (existing) {
    await comment(
      token,
      owner,
      repo,
      issueNumber,
      `A submission pull request already exists: #${existing.number} (${existing.html_url}).`
    )
    return
  }

  const { addedDate, addedAt } = getAdditionMetadata()
  const entry =
    type === 'blog'
      ? buildBlogEntry(submission, addedDate, addedAt)
      : buildCommunityEntry(submission, addedDate, addedAt)
  await exec('git', ['checkout', '-b', branch])
  const generated =
    type === 'blog'
      ? [...catalogueFiles(nextTaxonomy)]
      : communityCatalogueFiles()
  if (type === 'blog') {
    const nextBlogs = appendBlogEntry(blogs, entry)
    await writeFile(
      resolve('data/blogs.json'),
      `${JSON.stringify(nextBlogs, null, 2)}\n`
    )
  } else {
    const nextCommunities = [...communities, entry]
    validateCommunities(nextCommunities)
    await writeFile(
      resolve('data/communities.json'),
      `${JSON.stringify(nextCommunities, null, 2)}\n`
    )
  }
  if (type === 'blog' && suggestedSubcategoryStatus === 'created') {
    await writeFile(
      resolve('data/blog-taxonomy.json'),
      insertSubcategoryInTaxonomyText(
        taxonomyText,
        submission.category,
        subsection
      )
    )
    await exec(process.execPath, ['scripts/generate-submission-form.js'])
    generated.push(
      'data/blog-taxonomy.json',
      '.github/ISSUE_TEMPLATE/submit-blog.yml'
    )
  }
  await exec(process.execPath, ['scripts/generate-blog-pages.js'])

  await exec('git', ['add', '--', ...generated])
  const { stdout: staged } = await exec('git', [
    'diff',
    '--cached',
    '--name-only'
  ])
  const stagedFiles = staged.trim().split('\n').filter(Boolean)
  if (stagedFiles.some((file) => !generated.includes(file))) {
    throw new Error(
      'Refusing to include files outside the catalogue and generated pages'
    )
  }
  await exec('git', ['config', 'user.name', 'github-actions[bot]'])
  await exec('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com'
  ])
  await exec('git', ['commit', '-m', `Add ${type} submission #${issueNumber}`])
  await exec('git', ['push', '--set-upstream', 'origin', branch])

  const details =
    type === 'blog'
      ? pullRequestDetails(
          entry,
          issueNumber,
          branch,
          repositoryInfo.default_branch,
          submission.suggestedSubcategory,
          suggestedSubcategoryStatus
        )
      : communityPullRequestDetails(
          entry,
          issueNumber,
          branch,
          repositoryInfo.default_branch
        )
  const pullRequest = await apiRequest(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify(details)
  })
  await comment(
    token,
    owner,
    repo,
    issueNumber,
    `Approved submission is ready for review in PR #${pullRequest.number}: ${pullRequest.html_url}`
  )
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(async (error) => {
    const repository = process.env.GITHUB_REPOSITORY
    const issueNumber = process.env.ISSUE_NUMBER
    const token = process.env.BLOGR_TOKEN
    if (repository && issueNumber && token) {
      const [owner, repo] = repository.split('/')
      try {
        await comment(
          token,
          owner,
          repo,
          issueNumber,
          `The approved submission could not be processed automatically: ${error.message}`
        )
      } catch {
        // Keep the original failure as the workflow result without exposing tokens.
      }
    }
    console.error(error.message)
    process.exitCode = 1
  })
}
