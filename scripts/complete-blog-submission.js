const API_ROOT = 'https://api.github.com'

const apiRequest = async (token, path, options = {}) => {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  })
  const text = await response.text()
  if (!response.ok)
    throw new Error(`GitHub API request failed (${response.status})`)
  return text ? JSON.parse(text) : null
}

export function submissionIssueNumber(body) {
  const match =
    typeof body === 'string' &&
    body.match(
      /<!--\s*(?:blogr-submission|community-submission):(?:community:)?(\d+)\s*-->/
    )
  return match ? Number(match[1]) : null
}

export function mergedSubmissionIssue(event) {
  const pullRequest = event?.pull_request
  if (
    !pullRequest?.merged ||
    pullRequest.base?.ref !== event.repository.default_branch
  )
    return null
  if (
    !/^(?:blog|community)-submission\/issue-\d+$/.test(
      pullRequest.head?.ref ?? ''
    )
  )
    return null
  return submissionIssueNumber(pullRequest.body)
}

async function run() {
  const event = JSON.parse(process.env.GITHUB_EVENT_PAYLOAD)
  const issueNumber = mergedSubmissionIssue(event)
  if (!issueNumber) return
  const token = process.env.GITHUB_TOKEN
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/')
  const type = event.pull_request.head.ref.startsWith('community-')
    ? 'community'
    : 'blog'
  const marker = `<!-- blogr-submission-merged:${event.pull_request.number} -->`
  const comments = await apiRequest(
    token,
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`
  )
  if (!comments.some(({ body }) => body?.includes(marker))) {
    await apiRequest(
      token,
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({
          body: `The approved ${type} was merged in PR #${event.pull_request.number}: ${event.pull_request.html_url}\n\n${marker}`
        })
      }
    )
  }
  const issue = await apiRequest(
    token,
    `/repos/${owner}/${repo}/issues/${issueNumber}`
  )
  if (issue.state !== 'closed') {
    await apiRequest(token, `/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' })
    })
  }
}

if (process.env.GITHUB_EVENT_PAYLOAD) {
  run().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
