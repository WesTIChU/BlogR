/* global fetch */

import { reactive } from 'vue'

export const communityHealthStatuses = reactive(new Map())

let statusRequest

export function loadCommunityHealthStatuses() {
  if (!statusRequest) {
    statusRequest = fetch(`/community-health-status.json?v=${Date.now()}`, {
      cache: 'no-store'
    })
      .then((response) => {
        if (!response.ok) throw new Error('Community health status unavailable')
        return response.json()
      })
      .then((entries) => {
        for (const entry of entries) {
          communityHealthStatuses.set(entry.url, entry)
        }
      })
      .catch(() => undefined)
  }

  return statusRequest
}
