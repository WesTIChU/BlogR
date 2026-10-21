import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestPost } from '../../functions/api/webring/recheck.js'

/* global Request */

const id = 'br-0123456789abcdef0123456789abcdef'

const request = (ip = `test-${Math.random()}`) =>
  new Request(`https://blogr.directory/api/webring/recheck?id=${id}`, {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip }
  })

const environment = ({ requestedAt = null, changes = 1 } = {}) => {
  const statements = []
  return {
    statements,
    env: {
      WEBRING_PUBLIC_ENABLED: 'true',
      OUTBOUND_CLICKS: {
        prepare(sql) {
          statements.push(sql)
          return {
            bind() {
              return {
                first: async () => ({
                  verification_requested_at: requestedAt
                }),
                run: async () => ({ meta: { changes } })
              }
            }
          }
        }
      }
    }
  }
}

test('recheck requests queue work without executing verification', async () => {
  const { env, statements } = environment()
  const response = await onRequestPost({ request: request(), env })
  assert.equal(response.status, 202)
  assert.deepEqual(await response.json(), { queued: true })
  assert.equal(
    statements.some((sql) => sql.includes('UPDATE')),
    true
  )
})

test('recheck requests have a durable fifteen-minute per-membership cooldown', async () => {
  const { env, statements } = environment({
    requestedAt: new Date().toISOString()
  })
  const response = await onRequestPost({ request: request(), env })
  assert.equal(response.status, 202)
  assert.deepEqual(await response.json(), {
    queued: true,
    alreadyQueued: true
  })
  assert.equal(
    statements.some((sql) => sql.includes('UPDATE')),
    false
  )
})

test('recheck requests are rate limited per source IP', async () => {
  const ip = `rate-${Math.random()}`
  let calls = 0
  const env = environment().env
  env.OUTBOUND_CLICKS.prepare = () => {
    calls += 1
    return {
      bind() {
        return {
          first: async () => ({
            verification_requested_at: new Date().toISOString()
          }),
          run: async () => ({ meta: { changes: 0 } })
        }
      }
    }
  }
  for (let index = 0; index < 6; index += 1)
    assert.equal(
      (await onRequestPost({ request: request(ip), env })).status,
      202
    )
  assert.equal((await onRequestPost({ request: request(ip), env })).status, 429)
  assert.equal(calls, 6)
})

test('recheck requests respect the public feature flag and membership status', async () => {
  const disabled = await onRequestPost({
    request: request(),
    env: { WEBRING_PUBLIC_ENABLED: 'false' }
  })
  assert.equal(disabled.status, 404)

  const { env } = environment()
  env.OUTBOUND_CLICKS.prepare = () => ({
    bind: () => ({ first: async () => null })
  })
  const missing = await onRequestPost({ request: request(), env })
  assert.equal(missing.status, 404)
})
