/* global fetch */

import { reactive } from 'vue'

export const healthStatuses = reactive(new Map())
let statusRequest

export function loadHealthStatuses() {
  if (!statusRequest) {
    statusRequest = fetch(`/health-status.json?v=${Date.now()}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' }
    })
      .then((response) => {
        if (!response.ok) throw new Error('Health status unavailable')
        return response.json()
      })
      .then((entries) => {
        if (!Array.isArray(entries)) return
        for (const entry of entries) {
          if (entry && typeof entry.url === 'string') {
            healthStatuses.set(entry.url, entry)
          }
        }
      })
      .catch(() => undefined)
  }
  return statusRequest
}
