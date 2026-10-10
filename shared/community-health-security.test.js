/* global URL */

import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import {
  normalizeCommunityCatalogue,
  validateCommunityStatusCoverage
} from './community-catalogue.js'
import { checkCommunity } from './community-health-check.js'
import {
  isNonPublicIp,
  requestOnce,
  resolvePublicHost
} from './public-health-request.js'

const entry = {
  id: 'test',
  name: 'Test Community',
  url: 'https://public.test/'
}

test('blocks private, loopback, link-local, metadata and IPv6 local destinations', async () => {
  for (const host of [
    'localhost',
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '[::1]',
    '[fc00::1]',
    '[fe80::1]',
    'metadata.google.internal'
  ]) {
    await assert.rejects(resolvePublicHost(new URL(`https://${host}/`)), {
      code: 'PRIVATE_DESTINATION'
    })
  }
  assert.equal(isNonPublicIp('::ffff:127.0.0.1'), true)
})

test('rejects DNS answers containing a private address', async () => {
  await assert.rejects(
    resolvePublicHost(new URL('https://public.test/'), {
      dnsLookup: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.10', family: 4 }
      ]
    }),
    { code: 'PRIVATE_DESTINATION' }
  )
})

test('validates every redirect and pins each resolved address set', async () => {
  const resolved = []
  const requested = []
  const result = await checkCommunity(entry, {
    resolveHost: async (url) => {
      resolved.push(url.hostname)
      return [
        {
          address: resolved.length === 1 ? '93.184.216.34' : '203.0.113.10',
          family: 4
        }
      ]
    },
    request: async (url, method, addresses) => {
      requested.push({ url: url.toString(), method, addresses })
      return requested.length === 1
        ? {
            status: 302,
            headers: { location: 'https://redirect.test/final' },
            body: ''
          }
        : { status: 200, headers: {}, body: '' }
    }
  })

  assert.equal(result.status, 'Redirected')
  assert.deepEqual(resolved, ['public.test', 'redirect.test'])
  assert.deepEqual(
    requested.map(({ addresses }) => addresses[0].address),
    ['93.184.216.34', '203.0.113.10']
  )
})

test('uses pinned DNS addresses for the actual network connection', async () => {
  const server = http.createServer((_request, response) => {
    response.end('public response')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address()
    const result = await requestOnce(
      new URL(`http://public.test:${port}/`),
      'GET',
      [{ address: '127.0.0.1', family: 4 }]
    )
    assert.equal(result.status, 200)
    assert.equal(result.body, 'public response')
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
})

test('normal public catalogue URLs are accepted and normalised', () => {
  const result = normalizeCommunityCatalogue([
    { id: 'one', name: 'One', url: 'HTTPS://Example.com:443/#fragment' }
  ])
  assert.equal(result[0].url, 'https://example.com/')
})

test('rejects duplicate normalised catalogue URLs', () => {
  assert.throws(
    () =>
      normalizeCommunityCatalogue([
        { id: 'one', name: 'One', url: 'https://example.com/' },
        { id: 'two', name: 'Two', url: 'https://EXAMPLE.com:443/#other' }
      ]),
    /Duplicate community URL/
  )
})

test('rejects invalid catalogue records', () => {
  assert.throws(
    () =>
      normalizeCommunityCatalogue([
        { id: 'one', name: 'One', url: 'ftp://example.com' }
      ]),
    /Invalid community URL/
  )
})

test('requires exact community status catalogue coverage', () => {
  const catalogue = normalizeCommunityCatalogue([
    { id: 'one', name: 'One', url: 'https://one.example/' },
    { id: 'two', name: 'Two', url: 'https://two.example/' }
  ])
  assert.doesNotThrow(() =>
    validateCommunityStatusCoverage(catalogue, [
      { url: 'https://one.example/' },
      { url: 'https://two.example/' }
    ])
  )
  assert.throws(
    () =>
      validateCommunityStatusCoverage(catalogue, [
        { url: 'https://one.example/' }
      ]),
    /does not cover/
  )
  assert.throws(
    () =>
      validateCommunityStatusCoverage(catalogue, [
        { url: 'https://one.example/' },
        { url: 'https://one.example/' }
      ]),
    /coverage is invalid/
  )
})
