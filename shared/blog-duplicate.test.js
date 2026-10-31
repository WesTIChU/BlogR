import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findListedBlog,
  matchesWebsiteIdentity,
  websiteIdentity
} from './blog-duplicate.js'

const ruggedScot = { name: 'RuggedScot', url: 'https://ruggedscot.com/' }

test('matches arbitrary child paths to a root-domain blog', () => {
  for (const url of [
    'https://ruggedscot.com/',
    'https://ruggedscot.com/article1',
    'https://ruggedscot.com/article1/',
    'https://ruggedscot.com/blog/my-story',
    'https://ruggedscot.com/posts/my-story',
    'https://ruggedscot.com/2026/10/my-story',
    'https://ruggedscot.com/random-page',
    'https://ruggedscot.com/?ref=example',
    'https://www.ruggedscot.com/article1',
    'http://ruggedscot.com/anything'
  ]) {
    assert.equal(
      findListedBlog([ruggedScot], url, { allowChildPaths: true })?.name,
      'RuggedScot',
      url
    )
  }
})

test('keeps hosted accounts and independent subdomains separate', () => {
  const entries = [
    { name: 'Blog One', url: 'https://blogone.blogspot.com/' },
    { name: 'Blog Two', url: 'https://blogtwo.blogspot.com/' },
    { name: 'WordPress One', url: 'https://blogone.wordpress.com/' },
    { name: 'WordPress Two', url: 'https://blogtwo.wordpress.com/' },
    { name: 'GitHub One', url: 'https://userone.github.io/' },
    { name: 'GitHub Two', url: 'https://usertwo.github.io/' },
    { name: 'Blog Subdomain', url: 'https://blog.example.com/' },
    { name: 'Photos Subdomain', url: 'https://photos.example.com/' }
  ]

  assert.equal(
    matchesWebsiteIdentity(
      'https://blogone.blogspot.com/',
      'https://blogtwo.blogspot.com/post',
      { allowChildPaths: true }
    ),
    false
  )
  assert.equal(
    matchesWebsiteIdentity(
      'https://blogone.wordpress.com/',
      'https://blogtwo.wordpress.com/post',
      { allowChildPaths: true }
    ),
    false
  )
  assert.equal(
    matchesWebsiteIdentity(
      'https://userone.github.io/',
      'https://usertwo.github.io/post',
      { allowChildPaths: true }
    ),
    false
  )
  assert.equal(
    findListedBlog(entries, 'https://photos.example.com/gallery', {
      allowChildPaths: true
    })?.name,
    'Photos Subdomain'
  )
  assert.equal(
    findListedBlog(entries, 'https://blog.example.com/post', {
      allowChildPaths: true
    })?.name,
    'Blog Subdomain'
  )
})

test('respects path boundaries and prefers the most specific listing', () => {
  const entries = [
    { name: 'Root', url: 'https://example.com/' },
    { name: 'Alice', url: 'https://example.com/~alice/' },
    { name: 'Project', url: 'https://example.com/projects/' }
  ]

  assert.equal(
    findListedBlog(entries, 'https://example.com/~alice/post', {
      allowChildPaths: true
    })?.name,
    'Alice'
  )
  assert.equal(
    findListedBlog(entries, 'https://example.com/~alicia/post', {
      allowChildPaths: true
    })?.name,
    'Root'
  )
  assert.equal(
    findListedBlog(entries, 'https://example.com/projects-extra', {
      allowChildPaths: true
    })?.name,
    'Root'
  )
  assert.equal(
    findListedBlog(entries, 'https://example.com/projects/post', {
      allowChildPaths: true
    })?.name,
    'Project'
  )
})

test('normalizes host, query, fragments, and encoded path identity', () => {
  assert.deepEqual(
    websiteIdentity('HTTP://WWW.Example.COM:80/a%20b/?utm_source=x#top'),
    {
      host: 'example.com',
      pathname: '/a%20b'
    }
  )
  assert.equal(
    matchesWebsiteIdentity(
      'https://example.com/a%20b/',
      'https://example.com/a b?ref=example#section',
      { allowChildPaths: true }
    ),
    true
  )
})
