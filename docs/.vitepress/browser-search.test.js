/* global fetch, process, setTimeout, WebSocket */

import assert from 'node:assert/strict'
import test from 'node:test'

const cdpEndpoint = process.env.BLOGR_CDP_ENDPOINT
const searchUrl =
  process.env.BLOGR_SEARCH_URL ?? 'http://localhost:5177/recently-added'

const connectToPage = async () => {
  const targets = await (await fetch(`${cdpEndpoint}/json/list`)).json()
  const target = targets.find(({ type }) => type === 'page')
  if (!target) throw new Error('No browser page target is available')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  let nextId = 0
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    const resolve = pending.get(message.id)
    if (!resolve) return
    pending.delete(message.id)
    resolve(message)
  }
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })

  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId
      pending.set(id, resolve)
      socket.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (response.result?.exceptionDetails)
      throw new Error(response.result.exceptionDetails.text)
    return response.result?.result?.value
  }

  return { call, evaluate, close: () => socket.close() }
}

test(
  'browser search shows Bisha Underground from the loaded local index',
  { skip: !cdpEndpoint },
  async () => {
    const browser = await connectToPage()
    try {
      await browser.call('Page.navigate', { url: searchUrl })
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await browser.evaluate(
        `document.querySelector('button[aria-label="Search"]').click()`
      )
      await new Promise((resolve) => setTimeout(resolve, 700))
      await browser.evaluate(`(() => {
        const input = document.querySelector('#localsearch-input')
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        ).set
        setValue.call(input, 'Bisha Underground')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })()`)
      await new Promise((resolve) => setTimeout(resolve, 1800))

      const result = await browser.evaluate(`(async () => ({
        indexContainsBisha: (await (await fetch('/@localSearchIndexroot')).text()).includes('bisha'),
        noResults: document.body.innerText.includes('No results for'),
        resultText: [...document.querySelectorAll('.result-item')]
          .map((item) => item.innerText)
          .join('\\n'),
        resultLinks: [...document.querySelectorAll('.result-link')]
          .map((link) => link.getAttribute('href'))
      }))()`)

      assert.equal(result.indexContainsBisha, true)
      assert.equal(result.noResults, false)
      assert.match(result.resultText, /Bisha Underground/)
      assert.deepEqual(result.resultLinks, [
        '/blogs#society-commentary',
        '/collections/internet-and-society#society-commentary'
      ])
    } finally {
      browser.close()
    }
  }
)
