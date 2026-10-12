/* global fetch */

import { shallowRef } from 'vue'

export const healthStatuses = shallowRef(new Map())
let statusRequest

export function loadHealthStatuses() {
  if (!statusRequest) {
    statusRequest = fetch('/health-status.json', {
      cache: 'no-cache',
      headers: { accept: 'application/json' }
    })
      .then((response) => {
        if (!response.ok) throw new Error('Health status unavailable')
        return response.json()
      })
      .then((entries) => {
        if (!Array.isArray(entries)) return
        healthStatuses.value = new Map(
          entries
            .filter((entry) => entry && typeof entry.url === 'string')
            .map((entry) => [entry.url, entry])
        )
      })
      .catch(() => undefined)
  }
  return statusRequest
}
