import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createD1RegistryClient,
  planRegistrySync,
  synchroniseWebringMembers,
  synchroniseWebringRegistry
} from './webring-registry.js'

const id = (hex) => `br-${hex.repeat(32 / hex.length)}`
const entry = (url, webringId) => ({ url, webringId })

const client = (response) =>
  createD1RegistryClient({
    accountId: 'account',
    databaseId: 'database',
    apiToken: 'super-secret-token',
    fetchImpl: async (_url, init) => {
      assert.equal(init.headers.Authorization, 'Bearer super-secret-token')
      return response
    }
  })

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body)
})

test('reports authentication failures without exposing credentials or request bodies', async () => {
  await assert.rejects(
    client(
      jsonResponse(
        {
          success: false,
          errors: [{ code: 10000, message: 'Authentication error' }]
        },
        401
      )
    ).query('SELECT * FROM private_table', ['super-secret-token']),
    (error) => {
      assert.match(error.message, /HTTP 401/)
      assert.match(error.message, /10000.*Authentication error/)
      assert.doesNotMatch(error.message, /super-secret-token|private_table/)
      return true
    }
  )
})

test('reports D1 Write permission failures from batch requests', async () => {
  await assert.rejects(
    client(
      jsonResponse(
        {
          success: false,
          errors: [
            {
              code: 7500,
              message: 'You do not have permission to perform this operation.'
            }
          ]
        },
        403
      )
    ).batch([
      { sql: 'UPDATE private_table SET value = ?', params: ['secret'] }
    ]),
    (error) => {
      assert.match(error.message, /HTTP 403/)
      assert.match(error.message, /7500.*You do not have permission/)
      assert.match(error.message, /D1 Write permission/)
      assert.doesNotMatch(error.message, /secret|private_table/)
      return true
    }
  )
})

test('handles invalid JSON responses for both query and batch requests', async () => {
  const response = {
    ok: false,
    status: 502,
    text: async () => '<html>Bad gateway</html>'
  }
  await assert.rejects(
    client(response).query('SELECT 1'),
    /request failed \(HTTP 502\): invalid JSON response/
  )
  await assert.rejects(
    client(response).batch([]),
    /batch request failed \(HTTP 502\): invalid JSON response/
  )
})

test('sends a single D1 query as an object and parses its result rows', async () => {
  let request
  const registry = createD1RegistryClient({
    accountId: 'account',
    databaseId: 'database',
    apiToken: 'token',
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body)
      return jsonResponse({
        success: true,
        result: [{ results: [{ webring_id: 'br-test' }] }]
      })
    }
  })
  assert.deepEqual(await registry.query('SELECT ?', ['value']), [
    { webring_id: 'br-test' }
  ])
  assert.deepEqual(request, { sql: 'SELECT ?', params: ['value'] })
})

test('sends multiple D1 statements using the supported batch object', async () => {
  let request
  const registry = createD1RegistryClient({
    accountId: 'account',
    databaseId: 'database',
    apiToken: 'token',
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body)
      return jsonResponse({
        success: true,
        result: [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]
      })
    }
  })
  assert.deepEqual(
    await registry.batch([
      { sql: 'UPDATE one SET value = ?', params: ['one'] },
      { sql: 'UPDATE two SET value = ?', params: ['two'] }
    ]),
    [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]
  )
  assert.deepEqual(request, {
    batch: [
      { sql: 'UPDATE one SET value = ?', params: ['one'] },
      { sql: 'UPDATE two SET value = ?', params: ['two'] }
    ]
  })
})

test('rejects duplicate IDs and duplicate URLs with different IDs', () => {
  assert.throws(() =>
    planRegistrySync(
      [
        [
          entry('https://a.example', id('a')),
          entry('https://b.example', id('a'))
        ]
      ],
      []
    )
  )
  assert.throws(() =>
    planRegistrySync(
      [
        [
          entry('https://a.example', id('a')),
          entry('https://a.example/', id('b'))
        ]
      ],
      []
    )
  )
})

test('retires absent IDs and does not delete their registry rows', () => {
  const old = {
    webring_id: id('a'),
    canonical_url: 'https://gone.example/',
    membership_status: 'active'
  }
  const plan = planRegistrySync(
    [[entry('https://stay.example', id('b'))]],
    [old]
  )
  assert.deepEqual(plan.retired, [old.webring_id])
})

test('a removed membership remains permanently bound to its canonical URL', () => {
  const old = {
    webring_id: id('a'),
    canonical_url: 'https://gone.example/',
    membership_status: 'retired'
  }
  assert.deepEqual(planRegistrySync([], [old]), { upserts: [], retired: [] })
  assert.throws(
    () =>
      planRegistrySync(
        [[entry('https://other.example/', old.webring_id)]],
        [old]
      ),
    /permanently bound/
  )
})

test('requires safe restoration of a retired website ID', () => {
  const old = {
    webring_id: id('a'),
    canonical_url: 'https://gone.example/',
    membership_status: 'retired'
  }
  assert.throws(
    () => planRegistrySync([[entry('https://gone.example/', id('b'))]], [old]),
    /Restore/
  )
  const plan = planRegistrySync(
    [[entry('https://gone.example/', old.webring_id)]],
    [old]
  )
  assert.deepEqual(plan.upserts, [
    { webring_id: old.webring_id, canonical_url: old.canonical_url }
  ])
})

test('is idempotent for repeated synchronisation', () => {
  const row = {
    webring_id: id('a'),
    canonical_url: 'https://a.example/',
    membership_status: 'active'
  }
  const plan = planRegistrySync(
    [[entry(row.canonical_url, row.webring_id)]],
    [row]
  )
  assert.deepEqual(plan, {
    upserts: [{ webring_id: row.webring_id, canonical_url: row.canonical_url }],
    retired: []
  })
})

test('does not partially retire the registry when a batch is interrupted', async () => {
  const statements = []
  const db = {
    prepare(sql) {
      return { bind: (...params) => ({ sql, params }) }
    },
    async batch(batch) {
      statements.push(...batch)
      throw new Error('temporary D1 failure')
    },
    query: async () => [
      {
        webring_id: id('a'),
        canonical_url: 'https://gone.example/',
        membership_status: 'active'
      }
    ]
  }
  await assert.rejects(
    synchroniseWebringRegistry(db, [[entry('https://stay.example', id('b'))]]),
    /temporary D1 failure/
  )
  assert.equal(statements.length, 2)
})

test('never treats an empty catalogue load as a complete synchronisation', async () => {
  let queried = false
  const db = { query: async () => (queried = true) }
  await assert.rejects(
    synchroniseWebringRegistry(db, [[]]),
    /catalogues could not be loaded/
  )
  assert.equal(queried, false)
})

test('synchronises active, retired, and restored memberships separately', async () => {
  const batches = []
  const db = {
    query: async (sql) =>
      sql.includes('SELECT')
        ? [
            {
              webring_id: id('c'),
              canonical_url: 'https://removed.example/'
            }
          ]
        : [],
    async batch(statements) {
      batches.push(statements)
    }
  }
  await synchroniseWebringMembers(
    db,
    [
      [
        entry('https://gone.example/', id('a')),
        entry('https://new.example', id('b'))
      ]
    ],
    '2026-01-01T00:00:00Z'
  )
  assert.equal(batches.length, 2)
  assert.equal(batches[0].length, 2)
  assert.match(batches[1][0].sql, /membership_status = 'retired'/)
})
