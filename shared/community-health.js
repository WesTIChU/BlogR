export function classifyCommunityResponse(response) {
  const body = response.body.toLowerCase()
  const protectedResponse =
    [401, 403, 429].includes(response.status) ||
    response.headers['cf-mitigated'] ||
    response.headers['x-sucuri-id'] ||
    body.includes('verify you are human') ||
    body.includes('checking your browser') ||
    body.includes('cloudflare ray id')

  if (protectedResponse) {
    return { status: 'Restricted or bot-blocked', failureKind: 'protected' }
  }
  if (response.status >= 200 && response.status < 400) {
    return {
      status: response.redirected ? 'Redirected' : 'Healthy',
      failureKind: null
    }
  }
  if ([404, 410].includes(response.status)) {
    return { status: 'Potentially unreachable', failureKind: 'not-found' }
  }
  if (
    response.status === 408 ||
    response.status === 425 ||
    response.status >= 500
  ) {
    return { status: 'Temporarily unavailable', failureKind: 'timeout' }
  }
  return { status: 'Unknown', failureKind: 'review' }
}
