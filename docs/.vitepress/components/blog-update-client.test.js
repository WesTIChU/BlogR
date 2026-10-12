import assert from 'node:assert/strict'
import test from 'node:test'

const loadIsolatedClient = (suffix) =>
  import(`./blog-update-client.js?test=${suffix}-${Date.now()}`)

test('loads metadata once and shares the result across callers', async () => {
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return {
      ok: true,
      json: async () => ({ 'https://example.com/': { status: 'success' } })
    }
  }
  try {
    const client = await loadIsolatedClient('shared')
    const [first, second] = await Promise.all([
      client.loadBlogUpdates(),
      client.loadBlogUpdates()
    ])
    assert.equal(requests, 1)
    assert.equal(first['https://example.com/'].status, 'success')
    assert.strictEqual(first, second)
    assert.equal(client.blogUpdatesLoaded.value, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fails closed when metadata is missing or unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, json: async () => null })
  try {
    const client = await loadIsolatedClient('failed')
    assert.deepEqual(await client.loadBlogUpdates(), {})
    assert.equal(client.blogUpdatesLoaded.value, true)
    assert.equal(client.blogUpdatesError.value, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
