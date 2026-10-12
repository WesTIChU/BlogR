/* global document */

import { ref } from 'vue'

const storageKey = 'blogr-show-blog-details'

export const showBlogDetails = ref(true)

function applyBlogDetailsVisibility(value) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('blog-details-hidden', !value)
}

let preferenceLoaded = false

export function loadBlogDetailsPreference() {
  if (preferenceLoaded || typeof globalThis.window === 'undefined') return

  preferenceLoaded = true
  const savedPreference = globalThis.window.localStorage.getItem(storageKey)

  if (savedPreference !== null) {
    showBlogDetails.value = savedPreference === 'true'
  }
  applyBlogDetailsVisibility(showBlogDetails.value)
}

export function saveBlogDetailsPreference(value) {
  showBlogDetails.value = value
  applyBlogDetailsVisibility(value)
  globalThis.window.localStorage.setItem(storageKey, String(value))
}
