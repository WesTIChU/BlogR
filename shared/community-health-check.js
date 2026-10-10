import { normalizeBlogHealthUrl } from './blog-health-url.js'
/* global URL */

import { classifyCommunityResponse } from './community-health.js'
import { requestOnce, resolvePublicHost } from './public-health-request.js'

export async function checkCommunity(
  entry,
  {
    maxRedirects = 5,
    request = requestOnce,
    resolveHost = resolvePublicHost,
    requestOptions = {}
  } = {}
) {
  const checkedAt = new Date().toISOString()
  const redirects = []
  let currentUrl = normalizeBlogHealthUrl(entry.url)
  const visited = new Set()

  try {
    for (
      let redirectCount = 0;
      redirectCount <= maxRedirects;
      redirectCount++
    ) {
      const currentKey = currentUrl.toString()
      if (visited.has(currentKey)) {
        throw Object.assign(new Error('Redirect loop detected'), {
          code: 'REDIRECT_LOOP'
        })
      }
      visited.add(currentKey)

      const addresses = await resolveHost(currentUrl)
      const result = await request(currentUrl, 'GET', addresses, requestOptions)
      if (![301, 302, 303, 307, 308].includes(result.status)) {
        const classification = classifyCommunityResponse({
          ...result,
          redirected: redirects.length > 0
        })
        return {
          ...entry,
          checkedAt,
          httpStatus: result.status,
          finalUrl: currentUrl.toString(),
          ...classification,
          error: null
        }
      }

      const location = result.headers.location
      if (!location) {
        throw Object.assign(
          new Error('Redirect response had no Location header'),
          { code: 'REDIRECT_WITHOUT_LOCATION' }
        )
      }
      const nextUrl = normalizeBlogHealthUrl(
        new URL(location, currentUrl).toString()
      )
      redirects.push({
        from: currentUrl.toString(),
        to: nextUrl.toString(),
        httpStatus: result.status
      })
      if (redirectCount === maxRedirects) {
        throw Object.assign(new Error(`More than ${maxRedirects} redirects`), {
          code: 'REDIRECT_LIMIT'
        })
      }
      currentUrl = nextUrl
    }
  } catch (error) {
    return {
      ...entry,
      checkedAt,
      httpStatus: null,
      finalUrl: currentUrl.toString(),
      status: 'Potentially unreachable',
      failureKind:
        error.code === 'PRIVATE_DESTINATION'
          ? 'review'
          : ['TIMEOUT', 'DNS_TIMEOUT', 'ETIMEDOUT'].includes(error.code)
            ? 'timeout'
            : 'connection',
      error: { code: error.code || 'CHECK_ERROR', message: error.message }
    }
  }
}
