import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planRegistrySync,
  synchroniseWebringMembers,
  synchroniseWebringRegistry
} from './webring-registry.js'

const id = (hex) => `br-${hex.repeat(32 / hex.length)}`
const entry = (url, webringId) => ({ url, webringId })

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
