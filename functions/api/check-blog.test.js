/* global Request, Response */

import assert from 'node:assert/strict'
import test from 'node:test'
import { onRequestGet } from './check-blog.js'

const env = {
  GITHUB_TOKEN: 'server-only',
  GITHUB_REPOSITORY: 'WesTIChU/BlogR'
}

const request = (url) =>
  new Request(
    `https://blogr.directory/api/check-blog?url=${encodeURIComponent(url)}`
  )

test('finds listed blogs using URL variations', async () => {
  const response = await onRequestGet({
    request: request('https://5000MILEWALK.CO.UK/#about'),
    env
  })
  assert.deepEqual(await response.json(), {
    status: 'listed',
    name: 'A 5000 Mile Walk'
  })
})

test('finds pending submissions without exposing GitHub data', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        { body: '### Blog URL\n\nhttps://pending.example/blog#section\n' }
      ]),
      { status: 200 }
    )
  try {
    const response = await onRequestGet({
      request: request('https://pending.example/blog'),
      env
    })
    assert.deepEqual(await response.json(), { status: 'pending' })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reports new blogs and fails safely when GitHub is unavailable', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () =>
    calls++ === 0
      ? new Response('[]', { status: 200 })
      : new Response('unavailable', { status: 503 })
  try {
    const available = await onRequestGet({
      request: request('https://brand-new-blog.example/'),
      env
    })
    assert.deepEqual(await available.json(), { status: 'available' })
    const unavailable = await onRequestGet({
      request: request('https://another-new-blog.example/'),
      env
    })
    assert.equal(unavailable.status, 503)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rate limits repeated checks without a Cloudflare binding', async () => {
  const headers = { 'CF-Connecting-IP': '198.51.100.42' }
  for (let count = 0; count < 30; count++) {
    const response = await onRequestGet({
      request: new Request(
        'https://blogr.directory/api/check-blog?url=https%3A%2F%2F5000milewalk.co.uk%2F',
        { headers }
      ),
      env
    })
    assert.equal(response.status, 200)
  }
  const limited = await onRequestGet({
    request: new Request(
      'https://blogr.directory/api/check-blog?url=https%3A%2F%2F5000milewalk.co.uk%2F',
      { headers }
    ),
    env
  })
  assert.equal(limited.status, 429)
})
