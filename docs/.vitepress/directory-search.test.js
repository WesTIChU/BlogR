import assert from 'node:assert/strict'
import test from 'node:test'
import MiniSearch from 'minisearch'
import { expandDirectoryComponents } from './directory-search.js'

test('expands directory entries into searchable name and link markdown', () => {
  const source =
    '* <BlogHealthLink name="RuggedScot" url="https://ruggedscot.com" /> - Scottish life and everyday thoughts.'

  assert.equal(
    expandDirectoryComponents(source),
    '* [RuggedScot](https://ruggedscot.com) - Scottish life and everyday thoughts.'
  )
})

test('expands entries across categories without special-casing a name', () => {
  const source = [
    '<BlogHealthLink name="RuggedScot" url="https://ruggedscot.com" /> - Scottish life.',
    '<BlogHealthLink name="Project Sword Toys" url="https://projectswordtoys.blogspot.com/" /> - WW2 history.'
  ].join('\n')

  const expanded = expandDirectoryComponents(source)
  assert.match(expanded, /\[RuggedScot\]\(https:\/\/ruggedscot\.com\)/)
  assert.match(
    expanded,
    /\[Project Sword Toys\]\(https:\/\/projectswordtoys\.blogspot\.com\/\)/
  )
  assert.match(expanded, /Scottish life\./)
  assert.match(expanded, /WW2 history\./)
})

test('expanded entries are searchable by name, description, and link', () => {
  const markdown = expandDirectoryComponents(
    '<BlogHealthLink name="RuggedScot" url="https://ruggedscot.com" /> - Scottish life and everyday thoughts.'
  )
  const index = new MiniSearch({ fields: ['text'], storeFields: ['text'] })
  index.add({ id: 'personal-writing', text: markdown })

  for (const query of ['RuggedScot', 'Scottish life', 'ruggedscot.com']) {
    assert.equal(index.search(query, { prefix: true }).length, 1, query)
  }
})
