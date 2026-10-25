/* global AbortController, URL, clearTimeout, document, fetch, setTimeout, TextDecoder, TextEncoder */

import {
  canonicalWebringUrl,
  expectedWidgetLinks,
  WEBRING_INSTALL_PATHS
} from './webring.js'

export const MAX_WIDGET_RESPONSE_BYTES = 128 * 1024
export const VERIFICATION_TIMEOUT_MS = 8_000
export const VERIFIED_FAILURE_GRACE_MS = 48 * 60 * 60 * 1000

const stripMarkupThatCannotContainRealLinks = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '')

const anchors = (html) => {
  const result = []
  const source = stripMarkupThatCannotContainRealLinks(html)
  for (const match of source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
    if (href) result.push(href)
  }
  return result
}

export const installationUrls = (registeredUrl) => {
  const base = new URL(registeredUrl)
  return WEBRING_INSTALL_PATHS.map((path) => {
    const url = new URL(path, base)
    url.search = ''
    url.hash = ''
    return url
  })
}

export const validateInstallationHtml = (html, membershipId, blogrBaseUrl) => {
  return validateInstallationLinks(
    anchors(html),
    membershipId,
    blogrBaseUrl,
    blogrBaseUrl
  )
}

export const validateInstallationLinks = (
  hrefs,
  membershipId,
  blogrBaseUrl,
  hrefBaseUrl = blogrBaseUrl
) => {
  const expected = new Set(
    Object.values(expectedWidgetLinks(membershipId, blogrBaseUrl))
  )
  const found = new Set(
    hrefs.map((href) => {
      try {
        return new URL(href, hrefBaseUrl).toString()
      } catch {
        return ''
      }
    })
  )
  return [...expected].every((link) => found.has(link))
}

const sameApprovedHost = (registered, candidate) => {
  const registeredHost = new URL(registered).hostname
    .toLowerCase()
    .replace(/^www\./, '')
  const candidateHost = candidate.hostname.toLowerCase().replace(/^www\./, '')
  return registeredHost === candidateHost
}

export const isSafeApprovedHost = (url) => {
  const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  // IPv6 literals are rejected conservatively. This prevents IPv4-mapped
  // literals and private IPv6 forms from bypassing hostname checks.
  if (host.includes(':')) return false
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host === '169.254.169.254' ||
    host === '::1' ||
    host === '::' ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe8') ||
    host.startsWith('fe9') ||
    host.startsWith('fea') ||
    host.startsWith('feb') ||
    host.startsWith('ff') ||
    host.startsWith('2001:db8:')
  )
    return false
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!ipv4) return true
  const [, first, second] = ipv4.map(Number)
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

export const verifyWebringInstallation = async (
  member,
  {
    fetchImpl = fetch,
    blogrBaseUrl = 'https://blogr.directory',
    timeoutMs = VERIFICATION_TIMEOUT_MS,
    maxBytes = MAX_WIDGET_RESPONSE_BYTES,
    browserLaunch = null,
    browserTimeoutMs = VERIFICATION_TIMEOUT_MS,
    browserWaitMs = 1_000
  } = {}
) => {
  const registered = canonicalWebringUrl(member.canonical_url)
  if (!isSafeApprovedHost(registered)) return { status: 'missing' }
  const candidates = []
  if (member.successful_installation_url) {
    try {
      const previous = new URL(member.successful_installation_url)
      if (sameApprovedHost(registered, previous)) candidates.push(previous)
    } catch {
      // Try the fixed paths below.
    }
  }
  for (const candidate of installationUrls(registered))
    if (!candidates.some((current) => current.href === candidate.href))
      candidates.push(candidate)

  let temporaryFailure = false
  for (const candidate of candidates) {
    if (
      !sameApprovedHost(registered, candidate) ||
      !isSafeApprovedHost(candidate)
    )
      continue
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(candidate, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html',
          'user-agent': 'BlogR-Webring-Verifier/1.0'
        }
      })
      if (!response.ok || response.status >= 300) continue
      const length = Number(response.headers.get('content-length') || 0)
      if (length > maxBytes) continue
      if (!response.body) {
        const html = await response.text()
        if (
          new TextEncoder().encode(html).byteLength <= maxBytes &&
          validateInstallationHtml(html, member.webring_id, blogrBaseUrl)
        )
          return { status: 'active', installationUrl: candidate.href }
        continue
      }
      const reader = response.body.getReader()
      const chunks = []
      let size = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > maxBytes) {
          await reader.cancel()
          break
        }
        chunks.push(part.value)
      }
      if (size <= maxBytes) {
        const combined = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) {
          combined.set(chunk, offset)
          offset += chunk.byteLength
        }
        const html = new TextDecoder().decode(combined)
        if (validateInstallationHtml(html, member.webring_id, blogrBaseUrl))
          return { status: 'active', installationUrl: candidate.href }
      }
    } catch {
      temporaryFailure = true
    } finally {
      clearTimeout(timer)
    }
  }

  if (browserLaunch && !temporaryFailure) {
    let browser
    try {
      browser = await browserLaunch()
      if (!browser) return { status: 'missing' }
      const page = await browser.newPage()
      for (const candidate of candidates) {
        if (
          !sameApprovedHost(registered, candidate) ||
          !isSafeApprovedHost(candidate)
        )
          continue
        try {
          const response = await page.goto(candidate.href, {
            timeout: browserTimeoutMs,
            waitUntil: 'domcontentloaded'
          })
          const finalUrl = new URL(page.url() || candidate.href)
          if (
            !sameApprovedHost(registered, finalUrl) ||
            !isSafeApprovedHost(finalUrl)
          )
            continue
          if (response && response.status() >= 300) continue
          if (browserWaitMs > 0)
            await new Promise((resolve) => setTimeout(resolve, browserWaitMs))
          const hrefs = await page.evaluate(() =>
            Array.from(document.querySelectorAll('a[href]')).map((anchor) =>
              anchor.getAttribute('href')
            )
          )
          if (
            validateInstallationLinks(
              hrefs.filter((href) => typeof href === 'string'),
              member.webring_id,
              blogrBaseUrl,
              finalUrl.toString()
            )
          )
            return { status: 'active', installationUrl: finalUrl.toString() }
        } catch {
          temporaryFailure = true
        }
      }
    } catch {
      return { status: 'temporary_failure' }
    } finally {
      try {
        await browser?.close()
      } catch {
        // Browser cleanup must not mask the verification result.
      }
    }
  }
  return { status: temporaryFailure ? 'temporary_failure' : 'missing' }
}

export const verificationStateAfterCheck = (member, result, now) => {
  if (member.verification_status === 'retired')
    return { verification_status: 'retired' }
  if (result.status === 'active')
    return {
      verification_status: 'active',
      last_successful_verification: now,
      last_checked_at: now,
      successful_installation_url: result.installationUrl,
      consecutive_failures: 0
    }
  if (result.status === 'temporary_failure') {
    const consecutiveFailures = Number(member.consecutive_failures || 0) + 1
    const lastSuccessful = Date.parse(member.last_successful_verification ?? '')
    const checkedAt = Date.parse(now)
    const graceExpired =
      Number.isFinite(lastSuccessful) &&
      Number.isFinite(checkedAt) &&
      checkedAt - lastSuccessful >= VERIFIED_FAILURE_GRACE_MS
    return {
      last_checked_at: now,
      consecutive_failures: consecutiveFailures,
      verification_status: graceExpired
        ? 'suspended'
        : member.verification_status
    }
  }
  const consecutiveFailures = Number(member.consecutive_failures || 0) + 1
  const lastSuccessful = Date.parse(member.last_successful_verification ?? '')
  const checkedAt = Date.parse(now)
  const graceExpired =
    Number.isFinite(lastSuccessful) &&
    Number.isFinite(checkedAt) &&
    checkedAt - lastSuccessful >= VERIFIED_FAILURE_GRACE_MS
  return {
    last_checked_at: now,
    consecutive_failures: consecutiveFailures,
    verification_status: graceExpired ? 'suspended' : member.verification_status
  }
}
