/* global fetch */

import { shallowRef } from 'vue'

export const blogUpdates = shallowRef({})
export const blogUpdatesLoaded = shallowRef(false)
export const blogUpdatesError = shallowRef(false)

let request

export function loadBlogUpdates() {
  if (!request) {
    request = fetch('/blog-updates.json', {
      cache: 'no-cache',
      headers: { accept: 'application/json' }
    })
      .then((response) => {
        if (!response.ok) throw new Error('Blog metadata unavailable')
        return response.json()
      })
      .then((entries) => {
        blogUpdates.value =
          entries && typeof entries === 'object' && !Array.isArray(entries)
            ? entries
            : {}
        blogUpdatesLoaded.value = true
        blogUpdatesError.value = false
        return blogUpdates.value
      })
      .catch(() => {
        blogUpdates.value = {}
        blogUpdatesLoaded.value = true
        blogUpdatesError.value = true
        return blogUpdates.value
      })
  }
  return request
}
