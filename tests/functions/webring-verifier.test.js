import assert from 'node:assert/strict'
import test from 'node:test'
import worker, {
  claimDueMember,
  D1_OPERATIONS_PER_MEMBER,
  MAX_D1_OPERATIONS_PER_RUN,
  MAX_HTTP_FETCHES_PER_RUN,
  MAX_HTTP_SUBREQUESTS,
  MAX_INTERNAL_SUBREQUESTS,
  MAX_MEMBERS_PER_RUN,
  VERIFICATION_CAPACITY,
  VERIFICATION_CONCURRENCY,
  VERIFICATION_RUNS,
  verificationCapacity
} from '../../workers/webring-verifier.js'

const workerEnv = (statements, count = 756) => ({
  WEBRING_VERIFY_ENABLED: 'true',
  WEBRING_PUBLIC_ENABLED: 'false',
  OUTBOUND_CLICKS: {
    prepare(sql) {
      statements.push(sql)
      const statement = {
        first: async () => ({ membership_count: count }),
        bind() {
          return {
            all: async () => ({ results: [] }),
            run: async () => ({ success: true, meta: { changes: 0 } })
          }
        }
      }
      return statement
    }
  }
})

test('verification can run while public Webring access is disabled', async () => {
  const statements = []
  const waits = []
  await worker.scheduled({}, workerEnv(statements), {
    waitUntil: (promise) => waits.push(promise)
  })
  await Promise.all(waits)
  assert.equal(
    statements.some((sql) => sql.includes('webring_id_registry')),
    false
  )
  assert.equal(
    statements.some((sql) => sql.includes('verification_lease_until')),
    true
  )
})

test('disabled verification performs no database work', async () => {
  let prepared = false
  await worker.scheduled(
    {},
    {
      WEBRING_VERIFY_ENABLED: 'false',
      OUTBOUND_CLICKS: { prepare: () => (prepared = true) }
    },
    { waitUntil: () => {} }
  )
  assert.equal(prepared, false)
})

test('free capacity supports the current catalogue for the 12-hour target', () => {
  assert.equal(MAX_MEMBERS_PER_RUN, 6)
  assert.equal(VERIFICATION_CONCURRENCY, 6)
  assert.equal(VERIFICATION_RUNS, 144)
  assert.equal(VERIFICATION_CAPACITY, 864)
  assert.equal(MAX_HTTP_FETCHES_PER_RUN, 36)
  assert.equal(MAX_D1_OPERATIONS_PER_RUN, 14)
  assert.ok(MAX_HTTP_FETCHES_PER_RUN < MAX_HTTP_SUBREQUESTS)
  assert.ok(MAX_D1_OPERATIONS_PER_RUN < MAX_INTERNAL_SUBREQUESTS)
  assert.equal(D1_OPERATIONS_PER_MEMBER, 2)
  assert.deepEqual(verificationCapacity(756), {
    memberships: 756,
    batchSize: 6,
    invocations: 126,
    externalFetchesExpected: 756,
    externalFetchesWorstCase: 4536,
    httpSubrequestsPerInvocation: 36,
    d1OperationsPerInvocation: 14,
    twelveHourCapacity: 864,
    withinTwelveHours: true,
    spareCapacity: 108
  })
  assert.equal(verificationCapacity(1000).withinTwelveHours, false)
  assert.equal(verificationCapacity(5000).withinTwelveHours, false)
})

test('verification leases prevent overlapping runs from claiming the same member', async () => {
  let attempts = 0
  const db = {
    prepare() {
      return {
        bind() {
          return {
            run: async () => ({ meta: { changes: attempts++ === 0 ? 1 : 0 } })
          }
        }
      }
    }
  }
  const member = { webring_id: 'br-0123456789abcdef0123456789abcdef' }
  assert.equal(await claimDueMember(db, member), true)
  assert.equal(await claimDueMember(db, member), false)
})
