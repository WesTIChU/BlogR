import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestGet } from '../../functions/api/webring/[action].js'

/* global Request */

const id = 'br-0123456789abcdef0123456789abcdef'
const other = 'br-fedcba9876543210fedcba9876543210'

test('webring navigation wraps and records clicks without blocking redirects', async () => {
  const statements = []
  const env = {
    WEBRING_PUBLIC_ENABLED: 'true',
    OUTBOUND_CLICKS: {
      prepare(sql) {
        statements.push(sql)
        if (sql.includes('ORDER BY webring_id'))
          return {
            all: async () => ({
              results: [
                { webring_id: id, canonical_url: 'https://one.example/' },
                { webring_id: other, canonical_url: 'https://two.example/' }
              ]
            })
          }
        return {
          bind() {
            if (sql.includes('WHERE webring_id = ? AND'))
              return {
                first: async () => ({
                  webring_id: id,
                  canonical_url: 'https://one.example/'
                })
              }
            return { run: async () => ({ success: false }) }
          }
        }
      }
    }
  }
  const response = await onRequestGet({
    request: new Request(
      `https://blogr.directory/api/webring/previous?id=${id}`
    ),
    env,
    params: { action: 'previous' }
  })
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('location'), 'https://two.example/')
  assert.equal(
    statements.some((sql) =>
      sql.includes('INSERT OR IGNORE INTO webring_clicks')
    ),
    true
  )
})

test('webring navigation remains disabled until explicitly enabled', async () => {
  const response = await onRequestGet({
    request: new Request(`https://blogr.directory/api/webring/next?id=${id}`),
    env: { WEBRING_PUBLIC_ENABLED: 'false' },
    params: { action: 'next' }
  })
  assert.equal(response.status, 404)
})

test('webring navigation never redirects to an unsafe stored destination', async () => {
  const response = await onRequestGet({
    request: new Request(`https://blogr.directory/api/webring/next?id=${id}`),
    env: {
      WEBRING_PUBLIC_ENABLED: 'true',
      OUTBOUND_CLICKS: {
        prepare() {
          return {
            all: async () => ({
              results: [
                { webring_id: id, canonical_url: 'https://one.example/' },
                { webring_id: other, canonical_url: 'http://127.0.0.1/' }
              ]
            }),
            bind() {
              return {
                first: async () => ({
                  webring_id: id,
                  canonical_url: 'https://one.example/'
                })
              }
            }
          }
        }
      }
    },
    params: { action: 'next' }
  })
  assert.equal(response.status, 503)
})
