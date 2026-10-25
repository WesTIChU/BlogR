import assert from 'node:assert/strict'
import test from 'node:test'
import {
  validateInstallationHtml,
  validateInstallationLinks,
  verifyWebringInstallation
} from './webring-verification.js'
import { expectedWidgetLinks } from './webring.js'

/* global Response */

const membershipId = 'br-0123456789abcdef0123456789abcdef'
const member = {
  canonical_url: 'https://member.example/',
  successful_installation_url: null,
  webring_id: membershipId
}

const widgetLinks = () => Object.values(expectedWidgetLinks(membershipId))

const staticWidget = () =>
  widgetLinks()
    .map((href) => `<a href="${href}">link</a>`)
    .join('')

const rawResponse = (html) =>
  new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html' }
  })

test('static HTML verification succeeds without launching a browser', async () => {
  let browserLaunches = 0
  const result = await verifyWebringInstallation(member, {
    fetchImpl: async () => rawResponse(staticWidget()),
    browserLaunch: async () => {
      browserLaunches += 1
      return null
    }
  })

  assert.deepEqual(result, {
    status: 'active',
    installationUrl: 'https://member.example/'
  })
  assert.equal(browserLaunches, 0)
  assert.equal(validateInstallationHtml(staticWidget(), membershipId), true)
})

test('browser fallback verifies links rendered by JavaScript', async () => {
  let browserLaunches = 0
  let browserCloses = 0
  let pageNavigations = 0
  const browser = {
    async newPage() {
      return {
        url: () => 'https://member.example/',
        async goto() {
          pageNavigations += 1
          return { status: () => 200 }
        },
        async evaluate() {
          return widgetLinks()
        }
      }
    },
    async close() {
      browserCloses += 1
    }
  }

  const result = await verifyWebringInstallation(member, {
    fetchImpl: async () => rawResponse('<main id="app"></main>'),
    browserLaunch: async () => {
      browserLaunches += 1
      return browser
    }
  })

  assert.deepEqual(result, {
    status: 'active',
    installationUrl: 'https://member.example/'
  })
  assert.equal(browserLaunches, 1)
  assert.equal(browserCloses, 1)
  assert.equal(pageNavigations, 1)
  assert.equal(validateInstallationLinks(widgetLinks(), membershipId), true)
})

test('rendered links with an incorrect membership URL remain missing', async () => {
  let browserCloses = 0
  const browser = {
    async newPage() {
      return {
        url: () => 'https://member.example/',
        async goto() {
          return { status: () => 200 }
        },
        async evaluate() {
          return [
            ...widgetLinks().slice(0, 2),
            'https://blogr.directory/api/webring/random?id=br-wrong'
          ]
        }
      }
    },
    async close() {
      browserCloses += 1
    }
  }

  const result = await verifyWebringInstallation(member, {
    fetchImpl: async () => rawResponse('<div id="app"></div>'),
    browserLaunch: async () => browser
  })

  assert.deepEqual(result, { status: 'missing' })
  assert.equal(browserCloses, 1)
})

test('browser failures are temporary failures and always close the session', async () => {
  let browserCloses = 0
  const browser = {
    async newPage() {
      return {
        async goto() {
          throw new Error('browser unavailable')
        }
      }
    },
    async close() {
      browserCloses += 1
    }
  }

  const result = await verifyWebringInstallation(member, {
    fetchImpl: async () => rawResponse('<div id="app"></div>'),
    browserLaunch: async () => browser
  })

  assert.deepEqual(result, { status: 'temporary_failure' })
  assert.equal(browserCloses, 1)
})

test('browser fallback is skipped after a raw fetch failure', async () => {
  let browserLaunches = 0
  const result = await verifyWebringInstallation(member, {
    fetchImpl: async () => {
      throw new Error('network unavailable')
    },
    browserLaunch: async () => {
      browserLaunches += 1
      return null
    }
  })

  assert.deepEqual(result, { status: 'temporary_failure' })
  assert.equal(browserLaunches, 0)
})
