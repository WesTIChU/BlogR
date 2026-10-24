import {
  crossSectionMatches,
  entriesForSubmissionType,
  findListedBlog,
  hasPendingSubmission
} from '../../shared/blog-duplicate.js'
import { blogs } from '../../shared/blogr-function-data.js'
import { communities, websites } from '../../shared/cloudflare-function-data.js'
import {
  buildCommunityIssueBody,
  buildIndependentWebsiteIssueBody,
  buildIssueBody,
  validateCommunityInput,
  validateIndependentWebsiteInput,
  validateSubmissionInput
} from './submit-blog-validation.js'

/* global FormData, Response, fetch */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })

const githubRequest = async (env, path, options = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      'user-agent': 'BlogR-public-submission-form',
      ...options.headers
    }
  })
  return response
}

const getOpenSubmissionIssues = async (env, repository, label) => {
  const issues = []
  for (let page = 1; page <= 10; page += 1) {
    const response = await githubRequest(
      env,
      `/repos/${repository}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100&page=${page}`
    )
    if (!response.ok) throw new Error('Unable to inspect open submissions')
    const pageIssues = await response.json()
    if (!Array.isArray(pageIssues))
      throw new Error('Invalid open submissions response')
    issues.push(...pageIssues)
    if (pageIssues.length < 100) return issues
  }
  throw new Error('Open submission list is too large to inspect safely')
}

const verifyTurnstile = async (token, request, env) => {
  if (typeof token !== 'string' || !token || !env.TURNSTILE_SECRET_KEY)
    return false
  const form = new FormData()
  form.set('secret', env.TURNSTILE_SECRET_KEY)
  form.set('response', token)
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) form.set('remoteip', ip)
  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: form
    }
  )
  if (!response.ok) return false
  return (await response.json()).success === true
}

export async function onRequestPost({ request, env }) {
  if (
    !env.GITHUB_TOKEN ||
    !env.GITHUB_REPOSITORY ||
    !env.TURNSTILE_SECRET_KEY
  ) {
    return json({ error: 'The submission service is not configured yet.' }, 503)
  }
  if (env.SUBMISSION_RATE_LIMIT) {
    const key = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    let allowed
    try {
      allowed = await env.SUBMISSION_RATE_LIMIT.limit({ key })
    } catch {
      return json({ error: 'Submissions are temporarily unavailable.' }, 503)
    }
    if (!allowed.success)
      return json({ error: 'Please wait before trying again.' }, 429)
  }

  let payload
  try {
    const rawBody = await request.text()
    if (rawBody.length > 15_000) {
      return json({ error: 'The submission is too large.' }, 413)
    }
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid submission data.' }, 400)
  }

  let turnstileValid
  try {
    turnstileValid =
      !!payload &&
      typeof payload === 'object' &&
      (await verifyTurnstile(payload.turnstileToken, request, env))
  } catch {
    return json({ error: 'The spam check is temporarily unavailable.' }, 503)
  }
  if (!turnstileValid) {
    return json({ error: 'Please complete the spam check and try again.' }, 400)
  }

  let submission
  const type = payload?.type ?? 'blog'
  try {
    submission =
      type === 'website'
        ? validateIndependentWebsiteInput(payload)
        : type === 'community'
          ? validateCommunityInput(payload)
          : validateSubmissionInput(payload)
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Invalid submission.' },
      400
    )
  }

  let listed
  try {
    listed = findListedBlog(
      entriesForSubmissionType(type, { blogs, websites, communities }),
      submission.url
    )
  } catch {
    return json(
      { error: 'Duplicate checking is temporarily unavailable.' },
      503
    )
  }
  if (listed)
    return json(
      {
        error: `This ${type === 'website' ? 'website' : type === 'community' ? 'community' : 'blog'} is already listed in BlogR Directory.`
      },
      409
    )

  const repository = env.GITHUB_REPOSITORY
  let existing
  try {
    existing = await getOpenSubmissionIssues(
      env,
      repository,
      type === 'website'
        ? 'independent-web-submission'
        : type === 'community'
          ? 'community-submission'
          : 'blog-submission'
    )
  } catch {
    return json({ error: 'Submissions are temporarily unavailable.' }, 502)
  }
  if (hasPendingSubmission(existing, submission.url)) {
    return json(
      {
        error: `This ${type === 'website' ? 'website' : type === 'community' ? 'community' : 'blog'} has already been submitted and is awaiting review.`
      },
      409
    )
  }

  const crossSection = crossSectionMatches(type, submission.url, {
    blogs,
    websites,
    communities
  })
  const crossSectionNote = crossSection.length
    ? `\n\n### Cross-section duplicate warning\n\nThis URL is already listed in: ${crossSection.map(({ type: section }) => section).join(', ')}. This is a warning only; the administrator must decide whether the dual listing is legitimate.`
    : ''

  try {
    const response = await githubRequest(env, `/repos/${repository}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `${type === 'website' ? 'Independent website' : type === 'community' ? 'Community' : 'Blog'} submission: ${submission.name}`,
        body: `${type === 'website' ? buildIndependentWebsiteIssueBody(submission) : type === 'community' ? buildCommunityIssueBody(submission) : buildIssueBody(submission)}${crossSectionNote}`,
        labels: [
          type === 'website'
            ? 'independent-web-submission'
            : type === 'community'
              ? 'community-submission'
              : 'blog-submission'
        ]
      })
    })
    if (!response.ok)
      return json({ error: 'Submissions are temporarily unavailable.' }, 502)
    const issue = await response.json()
    return json({ ok: true, issueUrl: issue.html_url })
  } catch {
    return json({ error: 'Submissions are temporarily unavailable.' }, 502)
  }
}
