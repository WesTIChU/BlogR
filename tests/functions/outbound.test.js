import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestGet } from '../../functions/api/outbound.js'

/* global Request */

test('tracks a listed URL and redirects to the original destination', async () => {
  let sql = ''
  let bound = []
  const env = {
    OUTBOUND_CLICKS: {
      prepare(statement) {
        sql = statement
        return {
          bind(...values) {
            bound = values
            return { run: async () => ({ success: true }) }
          }
        }
      }
    }
  }
  const response = await onRequestGet({
    request: new Request(
      'https://blogr.directory/api/outbound?url=https%3A%2F%2Fwheelsbot.dev%2F'
    ),
    env
  })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://wheelsbot.dev/')
  assert.match(sql, /ON CONFLICT\(site_key\) DO UPDATE/)
  assert.match(sql, /total_clicks = outbound_clicks\.total_clicks \+ 1/)
  assert.equal(bound[0], 'https://wheelsbot.dev/')
})

test('tracks a listed community URL through the same D1 counter', async () => {
  let boundKey
  const env = {
    OUTBOUND_CLICKS: {
      prepare() {
        return {
          bind(key) {
            boundKey = key
            return { run: async () => ({ success: true }) }
          }
        }
      }
    }
  }
  const response = await onRequestGet({
    request: new Request(
      'https://blogr.directory/api/outbound?url=https%3A%2F%2Fforums.overclockers.co.uk%2F'
    ),
    env
  })
  assert.equal(response.status, 302)
  assert.equal(boundKey, 'https://forums.overclockers.co.uk/')
})

test('rejects unlisted destinations without touching D1', async () => {
  let called = false
  const response = await onRequestGet({
    request: new Request(
      'https://blogr.directory/api/outbound?url=https%3A%2F%2Fevil.example%2F'
    ),
    env: {
      OUTBOUND_CLICKS: {
        prepare() {
          called = true
        }
      }
    }
  })
  assert.equal(response.status, 404)
  assert.equal(called, false)
})
