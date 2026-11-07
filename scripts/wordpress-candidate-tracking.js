export const candidateDecisions = new Set([
  'new',
  'already-listed',
  'added',
  'rejected',
  'needs-review',
  'previously-processed'
])

export const normalizeCandidateUrl = (value) => {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.protocol = 'https:'
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    url.pathname = url.pathname.replace(/\/{2,}/g, '/')
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '')
    return url.href
  } catch {
    return null
  }
}

export const reconcileCandidateTracking = ({
  candidates,
  listedUrls,
  previous = {},
  now = new Date().toISOString()
}) => {
  const next = { ...previous }
  for (const candidate of candidates) {
    const canonicalUrl = normalizeCandidateUrl(
      candidate.canonicalUrl || candidate.siteUrl
    )
    if (!canonicalUrl) continue
    const old = next[canonicalUrl]
    const listed = listedUrls.has(canonicalUrl)
    const decision = listed
      ? old?.decision === 'added'
        ? 'added'
        : 'already-listed'
      : old?.decision && old.decision !== 'new'
        ? old.decision
        : 'new'
    next[canonicalUrl] = {
      canonicalUrl,
      siteName: candidate.siteName || old?.siteName || null,
      sources: [
        ...new Set([...(old?.sources || []), ...(candidate.sources || [])])
      ],
      tags: [...new Set([...(old?.tags || []), candidate.tag].filter(Boolean))],
      firstSeenAt: old?.firstSeenAt || now,
      lastSeenAt: now,
      lastCheckedAt: old?.lastCheckedAt || null,
      decision,
      reason: old?.reason || (listed ? 'Present in a BlogR catalogue.' : null),
      postCount: Math.max(old?.postCount || 0, candidate.postCount || 0)
    }
  }
  return next
}
