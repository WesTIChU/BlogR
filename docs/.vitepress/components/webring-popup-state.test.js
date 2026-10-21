/* global Element */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeWebringPopup,
  closeWebringPopup,
  openWebringPopup,
  registerWebringPopup,
  toggleWebringPopup
} from './webring-popup-state.js'

test('keeps one Webring popup active and cleans up document listeners', () => {
  const originalDocument = globalThis.document
  const originalElement = globalThis.Element
  const listeners = new Map()
  globalThis.Element = class Element {
    constructor(closestResult) {
      this.closestResult = closestResult
    }

    closest() {
      return this.closestResult
    }
  }
  globalThis.document = {
    addEventListener(type, listener) {
      listeners.set(type, listener)
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type)
    }
  }

  const first = Symbol('first')
  const second = Symbol('second')
  const unregisterFirst = registerWebringPopup(first)
  const unregisterSecond = registerWebringPopup(second)

  try {
    toggleWebringPopup(first)
    assert.equal(activeWebringPopup.value, first)
    toggleWebringPopup(second)
    assert.equal(activeWebringPopup.value, second)

    openWebringPopup(first)
    assert.equal(activeWebringPopup.value, first)
    listeners.get('keydown')({ type: 'keydown', key: 'Escape' })
    assert.equal(activeWebringPopup.value, null)

    openWebringPopup(second)
    closeWebringPopup()
    assert.equal(activeWebringPopup.value, null)
    openWebringPopup(second)
    listeners.get('click')({
      type: 'click',
      target: new Element({})
    })
    assert.equal(activeWebringPopup.value, second)
    listeners.get('click')({
      type: 'click',
      target: new Element(null)
    })
    assert.equal(activeWebringPopup.value, null)
  } finally {
    unregisterFirst()
    unregisterSecond()
    globalThis.document = originalDocument
    globalThis.Element = originalElement
    activeWebringPopup.value = null
  }

  assert.equal(listeners.size, 0)
})
