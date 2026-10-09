import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildStatusData,
  deriveStatus,
  getPublicStatus
} from './blog-health-status.js'

const now = new Date('2026-10-08T12:00:00.000Z')
const result = (overrides = {}) => ({
  originalUrl: 'https://example.com/',
  status: 'Potentially unreachable',
  checkedAt: now.toISOString(),
  failureKind: 'dns',
  ...overrides
})

test('transitions online, warning, and repeatedly unreachable', () => {
  assert.deepEqual(deriveStatus(result({ status: 'Healthy' })), {
    status: 'online',
    consecutiveFailures: 0
  })
  assert.deepEqual(deriveStatus(result({ failureKind: 'tls' })), {
    status: 'warning',
    consecutiveFailures: 0
  })
  assert.equal(
    deriveStatus(
      result(),
      { consecutiveFailures: 2, checkedAt: '2026-10-07T12:00:00.000Z' },
      now
    ).status,
    'repeatedly-unreachable'
  )
})

test('does not count multiple checks on the same day as daily failures', () => {
  assert.deepEqual(
    deriveStatus(
      result(),
      { consecutiveFailures: 2, checkedAt: '2026-10-08T08:00:00.000Z' },
      now
    ),
    { status: 'warning', consecutiveFailures: 2 }
  )
})

test('resets consecutive failures after recovery', () => {
  const recovered = deriveStatus(
    result({ status: 'Healthy', failureKind: undefined }),
    { consecutiveFailures: 7 }
  )
  assert.deepEqual(recovered, { status: 'online', consecutiveFailures: 0 })
})

test('marks results older than 72 hours unknown', () => {
  const stale = deriveStatus(
    result({ checkedAt: '2026-10-05T11:59:59.999Z' }),
    { consecutiveFailures: 2 },
    now
  )
  assert.deepEqual(stale, { status: 'unknown', consecutiveFailures: 0 })
})

test('TLS, timeout, 403 and bot protection remain warnings', () => {
  for (const failureKind of ['tls', 'timeout', 'protected']) {
    assert.equal(deriveStatus(result({ failureKind })).status, 'warning')
  }
  assert.equal(
    deriveStatus(result({ httpStatus: 403, failureKind: 'protected' })).status,
    'warning'
  )
})

test('ordinary redirects are online while unrelated redirects are warnings', () => {
  assert.equal(
    deriveStatus(result({ status: 'Redirected', redirectType: 'ordinary' }))
      .status,
    'online'
  )
  assert.equal(
    deriveStatus(result({ status: 'Redirected', redirectType: 'unrelated' }))
      .status,
    'warning'
  )
})

test('builds compact status data without mutating results', () => {
  const input = [result({ status: 'Healthy', failureKind: undefined })]
  const output = buildStatusData(input, new Map(), now)
  assert.deepEqual(output, [
    {
      url: 'https://example.com/',
      status: 'online',
      checkedAt: now.toISOString(),
      consecutiveFailures: 0
    }
  ])
  assert.equal(input[0].status, 'Healthy')
})

test('public status defaults missing and stale entries to unknown', () => {
  assert.deepEqual(getPublicStatus(null, now), {
    status: 'unknown',
    checkedAt: null
  })
  assert.equal(
    getPublicStatus(
      { status: 'online', checkedAt: '2026-10-05T11:59:59.999Z' },
      now
    ).status,
    'unknown'
  )
  assert.equal(
    getPublicStatus({ status: 'warning', checkedAt: now.toISOString() }, now)
      .status,
    'warning'
  )
})
