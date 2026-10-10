import { ref } from 'vue'

const storageKey = 'blogr-show-blog-details'

export const showBlogDetails = ref(true)

let preferenceLoaded = false

export function loadBlogDetailsPreference() {
  if (preferenceLoaded || typeof globalThis.window === 'undefined') return

  preferenceLoaded = true
  const savedPreference = globalThis.window.localStorage.getItem(storageKey)

  if (savedPreference !== null) {
    showBlogDetails.value = savedPreference === 'true'
  }
}

export function saveBlogDetailsPreference(value) {
  showBlogDetails.value = value
  globalThis.window.localStorage.setItem(storageKey, String(value))
}
