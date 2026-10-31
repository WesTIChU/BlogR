/* global Request, Response */

import assert from 'node:assert/strict'
import test from 'node:test'
import blogs from '../../data/blogs.json' with { type: 'json' }
import websites from '../../data/websites.json' with { type: 'json' }
import { onRequestGet } from '../../functions/api/check-blog.js'

const env = {
  GITHUB_TOKEN: 'server-only',
  GITHUB_REPOSITORY: 'WesTIChU/BlogR'
}

const request = (url, type = 'blog') =>
  new Request(
    `https://blogr.directory/api/check-blog?type=${type}&url=${encodeURIComponent(url)}`
  )

test('finds listed blogs using URL variations', async () => {
  const response = await onRequestGet({
    request: request('https://5000MILEWALK.CO.UK/#about'),
    env
  })
  assert.deepEqual(await response.json(), {
    status: 'listed',
    name: 'A 5000 Mile Walk',
    directory: 'Blogs',
    listingUrl: '/blogs'
  })
})

test('finds RuggedScot when an arbitrary child path is submitted', async () => {
  const response = await onRequestGet({
    request: request('https://ruggedscot.com/article1'),
    env
  })
  assert.deepEqual(await response.json(), {
    status: 'listed',
    name: 'RuggedScot',
    directory: 'Blogs',
    listingUrl: '/blogs'
  })
})

test('accepts protocol-less URLs when checking listed blogs', async () => {
  const response = await onRequestGet({
    request: request('www.5000milewalk.co.uk'),
    env
  })
  assert.deepEqual(await response.json(), {
    status: 'listed',
    name: 'A 5000 Mile Walk',
    directory: 'Blogs',
    listingUrl: '/blogs'
  })
})

test('finds a listed blog before applying article heuristics', async () => {
  const response = await onRequestGet({
    request: request(
      'https://www.sdlindia.com/blogs/ayurveda-basics/what-is-prakriti'
    ),
    env
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    status: 'listed',
    name: 'SDL India Blog',
    directory: 'Blogs',
    listingUrl: '/blogs'
  })
})

test('suggests the blog homepage for an unlisted article URL', async () => {
  const response = await onRequestGet({
    request: request('https://unknown-sdl.example/blogs/article-one'),
    env
  })
  assert.equal(response.status, 422)
  assert.deepEqual(await response.json(), {
    status: 'article',
    error:
      'It looks like you submitted an individual article. BlogR lists websites and blogs rather than individual posts. Did you mean to submit this blog instead?',
    suggestedUrl: 'https://unknown-sdl.example/blogs/'
  })
})

test('checks blogs and Independent Web in separate directories', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('[]', { status: 200 })
  try {
    const listedWebsite = await onRequestGet({
      request: request(websites[0].url, 'website'),
      env
    })
    assert.deepEqual(await listedWebsite.json(), {
      status: 'listed',
      name: websites[0].name,
      directory: 'Independent Web',
      listingUrl: '/independent-web'
    })

    const listedBlog = await onRequestGet({
      request: request(blogs[0].url, 'blog'),
      env
    })
    assert.deepEqual(await listedBlog.json(), {
      status: 'listed',
      name: blogs[0].name,
      directory: 'Blogs',
      listingUrl: '/blogs'
    })

    const blogForWebsite = await onRequestGet({
      request: request(blogs[0].url, 'website'),
      env
    })
    assert.deepEqual(await blogForWebsite.json(), {
      status: 'available',
      warning: 'This URL is already listed in another BlogR section (blog).'
    })

    const websiteForBlog = await onRequestGet({
      request: request(websites[0].url, 'blog'),
      env
    })
    assert.deepEqual(await websiteForBlog.json(), {
      status: 'available',
      warning: 'This URL is already listed in another BlogR section (website).'
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects malformed URLs before checking GitHub', async () => {
  const response = await onRequestGet({
    request: request('not a valid address'),
    env
  })
  assert.equal(response.status, 400)
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

test('matches an article submission to its parent blog identity', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify([
        {
          body: '### Blog URL\n\nhttps://pending-sdl.example/blogs/diet-and-nutrition/article-one\n'
        }
      ]),
      { status: 200 }
    )
  try {
    const response = await onRequestGet({
      request: request('https://pending-sdl.example/blogs'),
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
