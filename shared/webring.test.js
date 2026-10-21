/* global Response */

import assert from 'node:assert/strict'
import test from 'node:test'
import blogs from '../data/blogs.json' with { type: 'json' }
import communities from '../data/communities.json' with { type: 'json' }
import websites from '../data/websites.json' with { type: 'json' }
import {
  isSafeApprovedHost,
  validateInstallationHtml,
  verificationStateAfterCheck,
  verifyWebringInstallation
} from './webring-verification.js'
import {
  canonicalWebringUrl,
  expectedWidgetLinks,
  isValidWebringId,
  widgetHtml
} from './webring.js'

const all = [...blogs, ...websites, ...communities]

test('every catalogue record has a unique valid webring ID, shared by duplicate URLs', () => {
  const ids = new Map()
  const urls = new Map()
  for (const entry of all) {
    assert.equal(isValidWebringId(entry.webringId), true)
    if (ids.has(entry.webringId))
      assert.equal(ids.get(entry.webringId), canonicalWebringUrl(entry.url))
    ids.set(entry.webringId, canonicalWebringUrl(entry.url))
    urls.set(canonicalWebringUrl(entry.url), entry.webringId)
  }
  assert.equal(new Set(all.map(({ webringId }) => webringId)).size, urls.size)
})

test('widget contains three genuine navigation anchors with the membership ID', () => {
  const id = 'br-0123456789abcdef0123456789abcdef'
  const html = widgetHtml(id)
  const links = expectedWidgetLinks(id)
  assert.equal(
    validateInstallationHtml(html, id, 'https://blogr.directory'),
    true
  )
  for (const link of Object.values(links))
    assert.match(html, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('verification rejects missing links, forged IDs and non-anchor text', () => {
  const id = 'br-0123456789abcdef0123456789abcdef'
  assert.equal(
    validateInstallationHtml('<p>Previous Random Next</p>', id),
    false
  )
  assert.equal(
    validateInstallationHtml(widgetHtml(id.replace('0', 'f')), id),
    false
  )
  assert.equal(validateInstallationHtml(`<!--${widgetHtml(id)}-->`, id), false)
})

test('verification blocks private and metadata hosts before fetching', () => {
  assert.equal(isSafeApprovedHost('http://127.0.0.1/'), false)
  assert.equal(isSafeApprovedHost('http://169.254.169.254/'), false)
  assert.equal(isSafeApprovedHost('https://example.com/'), true)
})

test('verification checks the previous installation first and accepts an exact widget', async () => {
  const id = 'br-0123456789abcdef0123456789abcdef'
  const checked = []
  const result = await verifyWebringInstallation(
    { webring_id: id, canonical_url: 'https://example.com/' },
    {
      fetchImpl: async (url) => {
        checked.push(url.href)
        return new Response(widgetHtml(id), {
          headers: { 'content-type': 'text/html' }
        })
      }
    }
  )
  assert.equal(result.status, 'active')
  assert.equal(checked[0], 'https://example.com/')
})

test('network failures are temporary, while two confirmed failures suspend and success reactivates', () => {
  const member = { verification_status: 'active', consecutive_failures: 1 }
  assert.equal(
    verificationStateAfterCheck(member, { status: 'temporary_failure' }, 'now')
      .verification_status,
    undefined
  )
  assert.equal(
    verificationStateAfterCheck(member, { status: 'missing' }, 'now')
      .verification_status,
    'suspended'
  )
  assert.equal(
    verificationStateAfterCheck(
      { ...member, consecutive_failures: 2 },
      { status: 'active', installationUrl: 'https://example.com/' },
      'now'
    ).verification_status,
    'active'
  )
})

test('membership retirement does not change the separate verification status', () => {
  assert.deepEqual(
    verificationStateAfterCheck(
      { membership_status: 'retired', verification_status: 'active' },
      { status: 'active', installationUrl: 'https://example.com/' },
      'now'
    ),
    {
      verification_status: 'active',
      last_successful_verification: 'now',
      last_checked_at: 'now',
      successful_installation_url: 'https://example.com/',
      consecutive_failures: 0
    }
  )
})
