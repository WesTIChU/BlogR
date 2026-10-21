/* global document, Element */

import { shallowRef } from 'vue'

export const activeWebringPopup = shallowRef(null)

let mountedPopups = 0

const closeFromDocument = (event) => {
  if (event.type === 'keydown') {
    if (event.key === 'Escape') activeWebringPopup.value = null
    return
  }

  const target = event.target
  if (
    target instanceof Element &&
    !target.closest('.blog-webring, .blog-webring-popover')
  )
    activeWebringPopup.value = null
}

export const registerWebringPopup = (popupToken) => {
  if (mountedPopups === 0 && typeof document !== 'undefined') {
    document.addEventListener('click', closeFromDocument)
    document.addEventListener('keydown', closeFromDocument)
  }
  mountedPopups += 1

  return () => {
    mountedPopups = Math.max(0, mountedPopups - 1)
    if (activeWebringPopup.value === popupToken) activeWebringPopup.value = null
    if (mountedPopups === 0 && typeof document !== 'undefined') {
      document.removeEventListener('click', closeFromDocument)
      document.removeEventListener('keydown', closeFromDocument)
    }
  }
}

export const toggleWebringPopup = (token) => {
  activeWebringPopup.value = activeWebringPopup.value === token ? null : token
}

export const openWebringPopup = (token) => {
  activeWebringPopup.value = token
}

export const closeWebringPopup = () => {
  activeWebringPopup.value = null
}
