import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import {
  formatRelativeDate,
  getBlogUpdate,
  normalizeBlogUpdateUrl
} from '../shared/blog-update.js'
import {
  canonicalUrl,
  checkBlogs,
  discoverFeedUrls,
  mergeResult,
  parseFeed,
  parseFeedDetails,
  scanBlog
} from './check-blog-updates.js'

const now = new Date('2026-10-10T12:00:00Z')

test('parses RSS and selects the latest valid post date', () => {
  const xml = `<?xml version="1.0"?><rss><channel><lastBuildDate>2099-01-01</lastBuildDate>
    <item><pubDate>2026-10-01T08:00:00Z</pubDate></item>
    <item><pubDate>2026-10-08T08:00:00Z</pubDate></item>
    <item><pubDate>not a date</pubDate></item>
    <item><pubDate>2099-01-01T08:00:00Z</pubDate></item>
  </channel></rss>`
  assert.equal(parseFeed(xml, now), '2026-10-08')
})

test('captures an RSS article only from a reliable publication timestamp', () => {
  const xml = `<rss><channel>
    <item><title>Today</title><link>/today</link><pubDate>2026-10-10T08:00:00Z</pubDate></item>
    <item><title>No publication date</title><link>/missing</link><updated>2026-10-10T09:00:00Z</updated></item>
  </channel></rss>`
  assert.deepEqual(
    parseFeedDetails(xml, now, 'https://example.com/feed.xml').latestArticle,
    {
      title: 'Today',
      url: 'https://example.com/today',
      publishedAt: '2026-10-10T08:00:00.000Z'
    }
  )
})

test('stores a short plain-text preview from RSS and Atom summaries', () => {
  const rss = `<rss><channel><item>
    <title>RSS title &amp; news</title><link>https://example.com/rss-post</link>
    <pubDate>2026-10-10T08:00:00Z</pubDate>
    <description><![CDATA[<p>A <strong>short</strong> summary &amp; detail.</p><script>bad()</script><img src="tracking.gif">]]></description>
  </item></channel></rss>`
  assert.equal(
    parseFeedDetails(rss, now).latestArticle.summary,
    'A short summary & detail.'
  )

  const atom = `<feed><entry>
    <title>Atom title</title><link href="https://example.com/atom-post" />
    <published>2026-10-10T09:00:00Z</published>
    <summary type="html">&lt;p&gt;An Atom summary&lt;/p&gt;</summary>
  </entry></feed>`
  assert.equal(
    parseFeedDetails(atom, now).latestArticle.summary,
    'An Atom summary'
  )
})

test('prefers an article permalink over feed comments links', () => {
  const xml = `<rss><channel><item>
    <title>Permalink</title>
    <link>https://example.com/feeds/123/comments/default</link>
    <guid>https://example.com/posts/permalink</guid>
    <pubDate>2026-10-10T08:00:00Z</pubDate>
  </item></channel></rss>`
  assert.equal(
    parseFeedDetails(xml, now).latestArticle.url,
    'https://example.com/posts/permalink'
  )
})

test('parses the newest Atom publication or entry update date', () => {
  const xml = `<feed><updated>2026-10-09T00:00:00Z</updated>
    <entry><published>2026-09-27T17:54:05Z</published><updated>2026-10-08T22:14:00Z</updated></entry>
    <entry><published>2026-09-01T00:00:00Z</published><updated>2026-10-09T00:00:00Z</updated></entry>
    <entry><updated>2026-09-30T00:00:00Z</updated></entry>
    <entry><updated>2026-09-30T00:00:00Z</updated></entry></feed>`
  assert.equal(parseFeed(xml, now), '2026-10-09')
})

test('uses RSS item modification dates without using feed refresh dates', () => {
  const xml = `<rss><channel><lastBuildDate>2026-10-09T00:00:00Z</lastBuildDate>
    <item><pubDate>2026-09-27T00:00:00Z</pubDate><updated>2026-10-08T00:00:00Z</updated></item>
    <item><pubDate>2026-09-20T00:00:00Z</pubDate></item></channel></rss>`
  assert.equal(parseFeed(xml, now), '2026-10-08')
})

test('discovers HTML feed links and common fallback URLs', () => {
  const urls = discoverFeedUrls(
    'https://example.com/blog/',
    '<link rel="alternate" type="application/atom+xml" href="/updates.atom">'
  )
  assert.equal(urls[0], 'https://example.com/updates.atom')
  assert.ok(urls.includes('https://example.com/feed/'))
  assert.equal(new Set(urls).size, urls.length)
})

test('preserves known dates after temporary failures', () => {
  const previous = {
    lastPublished: '2026-10-01',
    latestArticle: {
      title: 'Known article',
      url: 'https://example.com/article',
      summary: 'Known summary',
      publishedAt: '2026-10-01T08:00:00.000Z'
    },
    lastChecked: '2026-10-09T12:00:00.000Z',
    status: 'success',
    feedUrl: 'https://example.com/feed.xml'
  }
  const merged = mergeResult(
    previous,
    { lastPublished: '2026-10-01', status: 'unavailable', feedUrl: null },
    '2026-10-10T12:00:00.000Z'
  )
  assert.equal(merged.lastPublished, '2026-10-01')
  assert.deepEqual(merged.latestArticle, previous.latestArticle)
  assert.equal(merged.status, 'unavailable')
  assert.equal(merged.feedUrl, previous.feedUrl)
})

test('keeps stable metadata timestamps on repeated scans without new activity', () => {
  const previous = {
    lastPublished: '2026-10-01',
    lastChecked: '2026-10-09T12:00:00.000Z',
    status: 'success',
    feedUrl: 'https://example.com/feed.xml'
  }
  const merged = mergeResult(
    previous,
    { ...previous },
    '2026-10-10T12:00:00.000Z'
  )
  assert.deepEqual(merged, previous)
})

test('scans a discovered feed without using HTTP Last-Modified', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.setHeader('last-modified', 'Thu, 01 Jan 2099 00:00:00 GMT')
      response.end(
        '<link rel="alternate" type="application/rss+xml" href="/feed.xml">'
      )
      return
    }
    response.setHeader('content-type', 'application/rss+xml')
    response.end(
      '<rss><channel><item><pubDate>2026-10-07</pubDate></item></channel></rss>'
    )
  })
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  try {
    const result = await scanBlog(
      { name: 'Local', url: `http://127.0.0.1:${port}/` },
      null,
      now
    )
    assert.deepEqual(result, {
      lastPublished: '2026-10-07',
      latestArticle: { publishedAt: '2026-10-07T00:00:00.000Z' },
      status: 'success',
      feedUrl: `http://127.0.0.1:${port}/feed.xml`
    })
  } finally {
    server.close()
  }
})

test('uses a previously stored feed before requesting the homepage', async () => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push(request.url)
    if (request.url !== '/stored.xml') {
      response.statusCode = 500
      response.end()
      return
    }
    response.setHeader('content-type', 'application/rss+xml')
    response.end(
      '<rss><channel><item><title>Stored</title><link>https://example.com/stored</link><pubDate>2026-10-07T08:00:00Z</pubDate></item></channel></rss>'
    )
  })
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  try {
    const result = await scanBlog(
      { name: 'Stored', url: `http://127.0.0.1:${port}/` },
      { feedUrl: `http://127.0.0.1:${port}/stored.xml` },
      now
    )
    assert.equal(result.feedUrl, `http://127.0.0.1:${port}/stored.xml`)
    assert.deepEqual(requests, ['/stored.xml'])
  } finally {
    server.close()
  }
})

test('falls back to homepage feed discovery when the stored feed fails', async () => {
  const requests = []
  const server = createServer((request, response) => {
    requests.push(request.url)
    if (request.url === '/stored.xml') {
      response.statusCode = 404
      response.end()
      return
    }
    if (request.url === '/') {
      response.end(
        '<link rel="alternate" type="application/rss+xml" href="/new.xml">'
      )
      return
    }
    response.setHeader('content-type', 'application/rss+xml')
    response.end(
      '<rss><channel><item><title>Discovered</title><link>https://example.com/discovered</link><pubDate>2026-10-07T08:00:00Z</pubDate></item></channel></rss>'
    )
  })
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  try {
    const result = await scanBlog(
      { name: 'Fallback', url: `http://127.0.0.1:${port}/` },
      { feedUrl: `http://127.0.0.1:${port}/stored.xml` },
      now
    )
    assert.equal(result.feedUrl, `http://127.0.0.1:${port}/new.xml`)
    assert.deepEqual(requests.slice(0, 3), ['/stored.xml', '/', '/new.xml'])
  } finally {
    server.close()
  }
})

test('handles broken feeds and preserves dates in a batch', async () => {
  const updates = await checkBlogs({
    blogs: [{ name: 'Broken', url: 'http://127.0.0.1:1/' }],
    previous: {
      'http://127.0.0.1:1/': {
        lastPublished: '2026-09-30',
        lastChecked: '2026-10-09T12:00:00.000Z',
        status: 'success',
        feedUrl: null
      }
    },
    now
  })
  assert.equal(updates['http://127.0.0.1:1/'].lastPublished, '2026-09-30')
  assert.equal(updates['http://127.0.0.1:1/'].status, 'unavailable')
})

test('formats relative dates and matches normalized URLs consistently', () => {
  assert.equal(formatRelativeDate('2026-10-10', now), 'today')
  assert.equal(formatRelativeDate('2026-10-09', now), 'yesterday')
  assert.equal(formatRelativeDate('2026-10-07', now), '3 days ago')
  assert.equal(formatRelativeDate('2026-09-01', now), '1 month ago')
  assert.equal(formatRelativeDate('2099-01-01', now), null)
  assert.equal(
    normalizeBlogUpdateUrl('HTTPS://Example.com:443/blog/#post'),
    'https://example.com/blog/'
  )
  assert.equal(
    getBlogUpdate(
      { 'https://example.com/blog/': { lastPublished: '2026-10-10' } },
      'https://EXAMPLE.com:443/blog/#post'
    ).lastPublished,
    '2026-10-10'
  )
})
