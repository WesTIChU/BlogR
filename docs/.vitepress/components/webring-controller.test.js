import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWebringStatusUrl,
  getWebringTriggerData,
  WEBRING_TRIGGER_SELECTOR
} from './webring-controller.js'

test('shared Webring controller reads trigger metadata without mounting a row component', () => {
  const element = {
    getAttribute: (name) =>
      ({
        'data-webring-id': 'br-a b',
        'data-webring-url': 'https://example.com/',
        'data-webring-name': 'Example'
      })[name] ?? null
  }

  assert.equal(WEBRING_TRIGGER_SELECTOR, '[data-webring-trigger]')
  assert.deepEqual(getWebringTriggerData(element), {
    id: 'br-a b',
    url: 'https://example.com/',
    name: 'Example'
  })
  assert.equal(getWebringStatusUrl('br-a b'), '/api/webring/status?id=br-a%20b')
})
