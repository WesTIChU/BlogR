/* global fetch */

import { shallowRef } from 'vue'

export const communityHealthStatuses = shallowRef(new Map())

let statusRequest

export function loadCommunityHealthStatuses() {
  if (!statusRequest) {
    statusRequest = fetch('/community-health-status.json', {
      cache: 'no-cache'
    })
      .then((response) => {
        if (!response.ok) throw new Error('Community health status unavailable')
        return response.json()
      })
      .then((entries) => {
        communityHealthStatuses.value = new Map(
          entries
            .filter((entry) => entry && typeof entry.url === 'string')
            .map((entry) => [entry.url, entry])
        )
      })
      .catch(() => undefined)
  }

  return statusRequest
}
