/* global URL */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  COUNTRIES,
  countryPath,
  countrySlug,
  getCountryInfo,
  normalizeCountryCode
} from './countries.js'

test('supports worldwide country codes and UK nation extensions', () => {
  assert.ok(COUNTRIES.length > 200)
  for (const code of [
    'GB',
    'CA',
    'US',
    'GB-ENG',
    'GB-NIR',
    'GB-SCT',
    'GB-SCO',
    'GB-WLS'
  ]) {
    const country = getCountryInfo(code)
    assert.ok(country)
    assert.equal(
      normalizeCountryCode(code),
      code === 'GB-SCO' ? 'GB-SCT' : code
    )
    assert.ok(country.name)
    assert.ok(country.flag)
  }
  assert.equal(normalizeCountryCode(''), undefined)
  assert.throws(() => normalizeCountryCode('ZZ'), /Invalid country code/)
})

test('creates clean country slugs without merging UK nations', () => {
  assert.equal(countrySlug('GB-SCT'), 'scotland')
  assert.equal(countrySlug('GB-ENG'), 'england')
  assert.equal(countrySlug('GB-NIR'), 'northern-ireland')
  assert.equal(countrySlug('GB-WLS'), 'wales')
  assert.equal(countrySlug('GB'), 'united-kingdom')
  assert.equal(countryPath('US'), '/country/united-states')
  assert.equal(countryPath(null), null)
})

test('renders country names accessibly in the existing metadata component', async () => {
  const component = await readFile(
    new URL(
      '../docs/.vitepress/components/BlogLastUpdated.vue',
      import.meta.url
    ),
    'utf8'
  )
  assert.match(component, /class="blog-country"/)
  assert.match(component, /:href="countryUrl"/)
  assert.match(component, /aria-label="`Based in \$\{country\.name\}`"/)
  assert.match(component, /country\.flag/)
})
