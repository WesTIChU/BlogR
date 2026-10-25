import assert from 'node:assert/strict'
import test from 'node:test'
import worker, {
  claimDueMember,
  compareDueMembers,
  createBrowserFallbackLauncher,
  D1_OPERATIONS_PER_MEMBER,
  dueMembersQuery,
  MAX_D1_OPERATIONS_PER_RUN,
  MAX_HTTP_FETCHES_PER_RUN,
  MAX_HTTP_SUBREQUESTS,
  MAX_INTERNAL_SUBREQUESTS,
  MAX_MEMBERS_PER_RUN,
  MAX_SAFE_BATCH_SIZE,
  MAX_SAFE_CONCURRENCY,
  priorityCategory,
  RETRY_INTERVAL_MINUTES,
  retryDelayMinutes,
  runWithConcurrency,
  VERIFICATION_CAPACITY,
  VERIFICATION_CONCURRENCY,
  VERIFICATION_RUNS,
  verificationCapacity,
  verificationSettings
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

test('free capacity supports the current catalogue queue', () => {
  assert.equal(MAX_MEMBERS_PER_RUN, 8)
  assert.equal(VERIFICATION_CONCURRENCY, 6)
  assert.equal(VERIFICATION_RUNS, 288)
  assert.equal(VERIFICATION_CAPACITY, 2304)
  assert.equal(MAX_HTTP_FETCHES_PER_RUN, 48)
  assert.equal(MAX_D1_OPERATIONS_PER_RUN, 19)
  assert.ok(MAX_HTTP_FETCHES_PER_RUN < MAX_HTTP_SUBREQUESTS)
  assert.ok(MAX_D1_OPERATIONS_PER_RUN < MAX_INTERNAL_SUBREQUESTS)
  assert.equal(D1_OPERATIONS_PER_MEMBER, 2)
  assert.deepEqual(verificationCapacity(756), {
    memberships: 756,
    batchSize: 8,
    invocations: 95,
    externalFetchesExpected: 756,
    externalFetchesWorstCase: 4536,
    httpSubrequestsPerInvocation: 48,
    d1OperationsPerInvocation: 19,
    targetHoursCapacity: 2304,
    withinTargetHours: true,
    spareCapacity: 1548
  })
  assert.equal(verificationCapacity(745).invocations, 94)
  assert.equal(verificationCapacity(1000).invocations, 125)
  assert.equal(verificationCapacity(2000).invocations, 250)
  assert.equal(verificationCapacity(1000).withinTargetHours, true)
  assert.equal(verificationCapacity(2000).withinTargetHours, true)
  assert.equal(verificationCapacity(5000).withinTargetHours, false)
})

test('priority categories distinguish requested, new, retry and backlog members', () => {
  const now = Date.parse('2026-10-21T12:00:00.000Z')
  assert.equal(
    priorityCategory(
      { verification_requested_at: '2026-10-21T11:59:00.000Z' },
      now
    ),
    'requested'
  )
  assert.equal(
    priorityCategory(
      { created_at: '2026-10-21T11:59:00.000Z', last_checked_at: null },
      now
    ),
    'new'
  )
  assert.equal(
    priorityCategory(
      {
        created_at: '2026-01-01T00:00:00.000Z',
        last_checked_at: '2026-10-21T00:00:00.000Z',
        consecutive_failures: 1
      },
      now
    ),
    'retry'
  )
  assert.equal(
    priorityCategory(
      { created_at: '2026-01-01T00:00:00.000Z', last_checked_at: null },
      now
    ),
    'never_checked'
  )
})

test('a previously failed installed member uses the retry lane', () => {
  const fixture = {
    name: 'RuggedScot',
    canonical_url: 'https://ruggedscot.com/',
    webring_id: 'br-1c678e1dee200ef836a9ee89e44c86eb',
    last_checked_at: '2026-10-21T07:00:00.000Z',
    consecutive_failures: 1
  }
  assert.equal(
    priorityCategory(fixture, Date.parse('2026-10-21T12:00:00.000Z')),
    'retry'
  )
})

test('retry backoff starts at fifteen minutes and caps sensibly', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 10].map(retryDelayMinutes),
    [15, 30, 60, 120, 240, 480, 480]
  )
})

test('batch and concurrency settings are bounded by platform-safe defaults', () => {
  assert.deepEqual(verificationSettings(), { batchSize: 8, concurrency: 6 })
  assert.deepEqual(
    verificationSettings({
      WEBRING_VERIFY_BATCH_SIZE: '100',
      WEBRING_VERIFY_CONCURRENCY: '100'
    }),
    { batchSize: MAX_SAFE_BATCH_SIZE, concurrency: MAX_SAFE_CONCURRENCY }
  )
  assert.deepEqual(
    verificationSettings({
      WEBRING_VERIFY_BATCH_SIZE: '3',
      WEBRING_VERIFY_CONCURRENCY: '6'
    }),
    { batchSize: 3, concurrency: 3 }
  )
})

test('browser fallback is disabled by default', async () => {
  assert.equal(createBrowserFallbackLauncher({ BROWSER: {} }), null)
  assert.equal(
    createBrowserFallbackLauncher({
      WEBRING_BROWSER_VERIFY_ENABLED: 'false',
      BROWSER: {}
    }),
    null
  )
})

test('browser fallback launcher permits only one session per run', async () => {
  const bindings = []
  const launch = async (binding) => {
    bindings.push(binding)
    return { close: async () => {} }
  }
  const launcher = createBrowserFallbackLauncher(
    { WEBRING_BROWSER_VERIFY_ENABLED: 'true', BROWSER: 'binding' },
    launch
  )
  assert.ok(launcher)
  assert.ok(await launcher())
  assert.equal(await launcher(), null)
  assert.deepEqual(bindings, ['binding'])
})

test('bounded concurrency does not allow one slow member to block the batch', async () => {
  let active = 0
  let peak = 0
  const completed = []
  await runWithConcurrency(['a', 'b', 'c', 'd', 'e'], 2, async (id) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) =>
      globalThis.setTimeout(resolve, id === 'a' ? 15 : 1)
    )
    completed.push(id)
    active -= 1
  })
  assert.equal(peak, 2)
  assert.deepEqual(completed.sort(), ['a', 'b', 'c', 'd', 'e'])
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

test('expired leases remain claimable for recovery', async () => {
  let sql = ''
  const db = {
    prepare(statement) {
      sql = statement
      return {
        bind: () => ({ run: async () => ({ meta: { changes: 1 } }) })
      }
    }
  }
  assert.equal(
    await claimDueMember(db, {
      webring_id: 'br-0123456789abcdef0123456789abcdef'
    }),
    true
  )
  assert.match(
    sql,
    /verification_lease_until IS NULL OR julianday\(verification_lease_until\)/
  )
})

test('queue ordering prioritises new members, retries, then oldest regular checks', () => {
  const members = [
    {
      webring_id: 'regular',
      created_at: '2026-01-01T00:00:00Z',
      last_checked_at: '2026-10-01T00:00:00Z',
      consecutive_failures: 0
    },
    {
      webring_id: 'newer',
      created_at: '2026-10-21T01:00:00Z',
      last_checked_at: null,
      consecutive_failures: 0
    },
    {
      webring_id: 'retry',
      created_at: '2026-01-01T00:00:00Z',
      last_checked_at: '2026-10-21T06:00:00Z',
      consecutive_failures: 1
    },
    {
      webring_id: 'oldest',
      created_at: '2026-01-01T00:00:00Z',
      last_checked_at: '2026-09-01T00:00:00Z',
      consecutive_failures: 0
    },
    {
      webring_id: 'older-new',
      created_at: '2026-10-20T00:00:00Z',
      last_checked_at: null,
      consecutive_failures: 0
    }
  ]
  assert.deepEqual(
    members.sort(compareDueMembers).map(({ webring_id }) => webring_id),
    ['older-new', 'newer', 'retry', 'oldest', 'regular']
  )
})

test('queue query retries failures before the normal twenty-four-hour interval', async () => {
  const statements = []
  const waits = []
  await worker.scheduled({}, workerEnv(statements), {
    waitUntil: (promise) => waits.push(promise)
  })
  await Promise.all(waits)
  const query = statements.find((sql) => sql.includes('LIMIT ?'))
  assert.match(query, new RegExp(`-${RETRY_INTERVAL_MINUTES} minutes`))
  assert.match(query, /-24 hours/)
  assert.match(query, /printf\(/)
  assert.match(query, /consecutive_failures > 0/)
  assert.match(
    query,
    /ORDER BY CASE WHEN verification_requested_at IS NOT NULL THEN 0/
  )
  assert.match(query, /verification_requested_at IS NOT NULL/)
  assert.match(query, /created_at,\s*webring_id/)
})

test('ordinary slots cannot be consumed by the urgent queue lanes', () => {
  const regularQuery = dueMembersQuery()
  assert.match(
    regularQuery,
    /AND NOT \(\s*verification_requested_at IS NOT NULL/
  )
  assert.match(regularQuery, /last_checked_at IS NULL/)
  assert.match(regularQuery, /consecutive_failures > 0/)
})
