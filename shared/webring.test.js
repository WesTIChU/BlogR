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
  WEBRING_WIDGET_IMAGE_URLS,
  WEBRING_WIDGET_PREVIEW_IMAGE_URLS,
  widgetHtml,
  widgetHtmlForDesign
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

test('all widget designs keep the verified navigation links', () => {
  const id = 'br-0123456789abcdef0123456789abcdef'
  for (const design of [
    'image-blog',
    'image-globe',
    'image-halloween',
    'image-christmas',
    'basic-emoji',
    'basic-plain'
  ]) {
    const html = widgetHtmlForDesign(id, design)
    assert.equal(validateInstallationHtml(html, id), true)
    if (design === 'image-blog') {
      assert.match(html, /blog-orange\.png/)
      assert.doesNotMatch(html, /globe-orange\.png/)
      assert.match(html, /width="220" height="88"/)
    } else if (design === 'image-globe') {
      assert.match(html, /globe-orange\.png/)
      assert.doesNotMatch(html, /blog-orange\.png/)
      assert.match(html, /width="220" height="88"/)
      assert.match(html, /alt="BlogR Webring"/)
    } else if (design === 'image-halloween') {
      assert.match(html, /halloween\.png/)
      assert.doesNotMatch(html, /blog-orange\.png|globe-orange\.png/)
      assert.match(html, /width="220" height="88"/)
      assert.match(html, /alt="BlogR Webring"/)
    } else if (design === 'image-christmas') {
      assert.match(html, /christmas\.png/)
      assert.doesNotMatch(
        html,
        /blog-orange\.png|globe-orange\.png|halloween\.png/
      )
      assert.match(html, /width="220" height="88"/)
      assert.match(html, /alt="BlogR Webring"/)
    } else if (design === 'basic-emoji') {
      assert.match(html, /⬅️ Previous.*🎲 Random.*Next ➡️/s)
      assert.doesNotMatch(html, /<img /)
    } else {
      assert.match(html, /Previous.*Random.*Next/s)
      assert.doesNotMatch(html, /⬅️|🎲|➡️|<img /)
    }
  }
})

test('local previews use public assets while embed code uses absolute assets', () => {
  assert.deepEqual(WEBRING_WIDGET_PREVIEW_IMAGE_URLS, {
    blog: '/images/web-ring-images/blog-orange.png',
    globe: '/images/web-ring-images/globe-orange.png',
    halloween: '/images/web-ring-images/halloween.png',
    christmas: '/images/web-ring-images/christmas.png'
  })
  assert.match(
    widgetHtmlForDesign('br-0123456789abcdef0123456789abcdef', 'image-blog'),
    new RegExp(
      WEBRING_WIDGET_IMAGE_URLS.blog.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
  )
})

test('basic themes keep emojis inside accessible navigation links', () => {
  const id = 'br-0123456789abcdef0123456789abcdef'
  const themes = {
    plain: ['', '', ''],
    classic: ['⬅️ ', '🎲 ', ' ➡️'],
    christmas: ['🎄 ', '🎁 ', ' 🎅'],
    halloween: ['🎃 ', '👻 ', ' 🦇'],
    zombie: ['🧟 ', '🧠 ', ' 🪦'],
    gaming: ['🎮 ', '🕹️ ', ' 👾'],
    autumn: ['🍂 ', '🍁 ', ' 🌰'],
    nature: ['🌿 ', '🌻 ', ' 🦋'],
    space: ['🚀 ', '🪐 ', ' 🌌'],
    cats: ['🐈 ', '🐾 ', ' 🐈‍⬛'],
    retro: ['💾 ', '💿 ', ' 🖥️']
  }
  for (const [theme, [previous, random, next]] of Object.entries(themes)) {
    const html = widgetHtmlForDesign(id, `basic-${theme}`)
    assert.match(
      html,
      new RegExp(`<a[^>]*aria-label="Previous"[^>]*>${previous}Previous</a>`)
    )
    assert.match(
      html,
      new RegExp(`<a[^>]*aria-label="Random"[^>]*>${random}Random</a>`)
    )
    assert.match(
      html,
      new RegExp(`<a[^>]*aria-label="Next"[^>]*>Next${next}</a>`)
    )
    assert.equal(validateInstallationHtml(html, id), true)
  }
})

test('every widget design remains compatible with exact Webring verification', () => {
  const id = 'br-0123456789abcdef0123456789abcdef'
  const expected = expectedWidgetLinks(id)
  const designs = [
    'image-blog',
    'image-globe',
    'image-halloween',
    'image-christmas',
    'basic-plain',
    ...[
      'classic',
      'christmas',
      'halloween',
      'zombie',
      'gaming',
      'autumn',
      'nature',
      'space',
      'cats',
      'retro'
    ].map((theme) => `basic-${theme}`)
  ]

  for (const design of designs) {
    const html = widgetHtmlForDesign(id, design)
    const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map(
      ([, href]) => href
    )
    assert.deepEqual(links, Object.values(expected), design)
    assert.equal(validateInstallationHtml(html, id), true, design)
    assert.doesNotMatch(html, /<script\b|\bon(?:click|load)\s*=/i, design)
  }
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
  assert.equal(isSafeApprovedHost('http://[::ffff:127.0.0.1]/'), false)
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
  const member = {
    verification_status: 'active',
    consecutive_failures: 0,
    last_successful_verification: '2026-10-21T00:00:00.000Z'
  }
  const withinGrace = '2026-10-22T00:00:00.000Z'
  const temporary = verificationStateAfterCheck(
    member,
    { status: 'temporary_failure' },
    withinGrace
  )
  assert.equal(temporary.verification_status, 'active')
  assert.equal(temporary.consecutive_failures, 1)
  assert.equal(
    verificationStateAfterCheck(
      { ...member, consecutive_failures: 1 },
      { status: 'temporary_failure' },
      '2026-10-23T00:00:00.000Z'
    ).verification_status,
    'suspended'
  )
  assert.equal(
    verificationStateAfterCheck(
      { ...member, consecutive_failures: 1 },
      { status: 'missing' },
      '2026-10-23T00:00:00.000Z'
    ).verification_status,
    'suspended'
  )
  assert.equal(
    verificationStateAfterCheck(
      { verification_status: 'pending', consecutive_failures: 99 },
      { status: 'missing' },
      '2026-10-23T00:00:00.000Z'
    ).verification_status,
    'pending'
  )
  assert.equal(
    verificationStateAfterCheck(
      { ...member, consecutive_failures: 2 },
      { status: 'active', installationUrl: 'https://example.com/' },
      '2026-10-23T00:00:00.000Z'
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
