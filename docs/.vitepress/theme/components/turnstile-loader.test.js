import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTurnstile, resetTurnstileLoader } from './turnstile-loader.js'

const makeDocument = () => {
  const scripts = []
  return {
    scripts,
    querySelector: (selector) =>
      scripts.find((script) => selector.includes(script.src)) ?? null,
    createElement: () => ({
      addEventListener(type, callback) {
        this.listeners ??= {}
        this.listeners[type] = callback
      }
    }),
    head: {
      appendChild(script) {
        scripts.push(script)
      }
    }
  }
}

test.afterEach(() => resetTurnstileLoader())

test('loads Turnstile once and shares the pending promise', async () => {
  const documentObject = makeDocument()
  const windowObject = {}
  const first = loadTurnstile(windowObject, documentObject)
  const second = loadTurnstile(windowObject, documentObject)

  assert.strictEqual(first, second)
  assert.equal(documentObject.scripts.length, 1)

  const api = { render() {} }
  windowObject.turnstile = api
  documentObject.scripts[0].listeners.load()
  assert.strictEqual(await first, api)
})

test('uses an already-present Turnstile script instead of injecting a duplicate', async () => {
  const documentObject = makeDocument()
  const existing = documentObject.createElement('script')
  existing.src =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  documentObject.scripts.push(existing)
  const windowObject = {}

  const loaded = loadTurnstile(windowObject, documentObject)
  assert.equal(documentObject.scripts.length, 1)

  const api = { render() {} }
  windowObject.turnstile = api
  existing.listeners.load()
  assert.strictEqual(await loaded, api)
})
