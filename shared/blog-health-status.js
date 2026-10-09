export const PUBLIC_STATUSES = [
  'online',
  'warning',
  'repeatedly-unreachable',
  'unknown'
]

export const STALE_AFTER_MS = 72 * 60 * 60 * 1000

export const PUBLIC_STATUS_COLORS = Object.freeze({
  online: '#22C55E',
  warning: '#EAB308',
  'repeatedly-unreachable': '#EF4444',
  unknown: '#94A3B8'
})

const countableFailureKinds = new Set(['dns', 'connection', 'not-found'])
const MIN_DAILY_INTERVAL_MS = 20 * 60 * 60 * 1000
const MAX_DAILY_INTERVAL_MS = 48 * 60 * 60 * 1000

const isStale = (checkedAt, now) => {
  const checkedTime = Date.parse(checkedAt || '')
  return (
    !Number.isFinite(checkedTime) ||
    now.getTime() - checkedTime > STALE_AFTER_MS
  )
}

export function isOnlineResult(result) {
  return (
    ['Healthy', 'Redirected'].includes(result.status) &&
    result.redirectType !== 'unrelated'
  )
}

export function getFailureKind(result) {
  if (result.failureKind) return result.failureKind
  const code = result.error?.code || ''
  if (code === 'DNS_ERROR' || code === 'ENOTFOUND') return 'dns'
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'connection'
  if (result.httpStatus === 404 || result.httpStatus === 410) return 'not-found'
  return 'review'
}

export function deriveStatus(result, previous = {}, now = new Date()) {
  if (isStale(result.checkedAt, now)) {
    return { status: 'unknown', consecutiveFailures: 0 }
  }

  if (isOnlineResult(result)) {
    return { status: 'online', consecutiveFailures: 0 }
  }

  const failureKind = getFailureKind(result)
  let consecutiveFailures = 0
  if (countableFailureKinds.has(failureKind)) {
    const previousCount = Number(previous.consecutiveFailures || 0)
    const previousTime = Date.parse(previous.checkedAt || '')
    const elapsed = now.getTime() - previousTime
    const isDailyCheck =
      Number.isFinite(previousTime) &&
      elapsed >= MIN_DAILY_INTERVAL_MS &&
      elapsed <= MAX_DAILY_INTERVAL_MS

    consecutiveFailures = previousCount
      ? previous.checkedAt
        ? isDailyCheck
          ? previousCount + 1
          : elapsed < MIN_DAILY_INTERVAL_MS
            ? previousCount
            : 1
        : previousCount + 1
      : 1
  }

  return {
    status: consecutiveFailures >= 3 ? 'repeatedly-unreachable' : 'warning',
    consecutiveFailures
  }
}

export function buildStatusData(
  results,
  previousByUrl = new Map(),
  now = new Date()
) {
  return results.map((result) => {
    const previous = previousByUrl.get(result.originalUrl) || {}
    const derived = deriveStatus(result, previous, now)
    return {
      url: result.originalUrl,
      status: derived.status,
      checkedAt: result.checkedAt,
      consecutiveFailures: derived.consecutiveFailures
    }
  })
}

export function getPublicStatus(entry, now = new Date()) {
  if (!entry || !PUBLIC_STATUSES.includes(entry.status)) {
    return { status: 'unknown', checkedAt: null }
  }
  const checkedAt = Date.parse(entry.checkedAt || '')
  if (
    !Number.isFinite(checkedAt) ||
    checkedAt > now.getTime() ||
    now.getTime() - checkedAt > STALE_AFTER_MS
  ) {
    return { status: 'unknown', checkedAt: entry.checkedAt || null }
  }
  return { status: entry.status, checkedAt: entry.checkedAt }
}
