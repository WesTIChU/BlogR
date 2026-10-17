import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import taxonomyJson from '../../data/blog-taxonomy.json' with { type: 'json' }
import blogsJson from '../../data/blogs.json' with { type: 'json' }
import {
  blogs as bundledBlogs,
  taxonomy as bundledTaxonomy
} from '../../shared/blogr-function-data.js'

const functionSources = [
  'functions/api/check-blog.js',
  'functions/api/submit-blog.js',
  'functions/api/submit-blog-validation.js'
]

test('Pages Functions do not use Node filesystem fallbacks at startup', async () => {
  const sources = await Promise.all(
    functionSources.map((path) => readFile(path, 'utf8'))
  )
  const source = sources.join('\n')
  assert.doesNotMatch(source, /import\.meta\.url/)
  assert.doesNotMatch(source, /getBuiltinModule/)
  assert.doesNotMatch(source, /nodeProcess/)
})

test('bundled Function data matches the published catalogue and taxonomy', () => {
  assert.deepEqual(bundledBlogs, blogsJson)
  assert.deepEqual(bundledTaxonomy, taxonomyJson)
})
