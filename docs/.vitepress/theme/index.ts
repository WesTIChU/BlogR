/**
 *  Copyright (c) 2025 taskylizard. Apache License 2.0.
 *  Modified for BlogR Directory, 2026.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { loadProgress } from './composables/nprogress'
import {
  cancelPendingScroll,
  pendingScrollQuery,
  scheduleScrollToMatch
} from './composables/searchScroll'
import Layout from './Layout.vue'
import { useThemeHandler } from './themes/themeHandler'

import './style.scss'
import 'virtual:uno.css'

import FloatingVue from 'floating-vue'

import 'floating-vue/dist/style.css'

const applySeasonalBranding = () => {
  const month = new Date().getMonth()
  const isJune = month === 5

  document.documentElement.classList.toggle('june', isJune)

  const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (favicon) {
    favicon.href = isJune ? '/june_icon.webp' : '/blogr.ico'
    favicon.type = isJune ? 'image/webp' : 'image/x-icon'
  }

  const alternateIcon = document.querySelector<HTMLLinkElement>(
    "link[rel='alternate icon']"
  )
  if (alternateIcon) {
    alternateIcon.href = '/pwa_icon.png'
  }

  const appleIcon = document.querySelector<HTMLLinkElement>(
    "link[rel='apple-touch-icon']"
  )
  if (appleIcon) {
    appleIcon.href = '/pwa_icon.png'
  }

  const themeColor = document.querySelector<HTMLMetaElement>(
    "meta[name='theme-color']"
  )
  if (themeColor) {
    themeColor.content = '#7bc5e4'
  }
}

const normalizeAnalyticsPath = (value: string) => {
  const url = new URL(value, window.location.href)
  return `${url.pathname}${url.search}`
}

type GoatCounterWindow = Window & {
  goatcounter?: {
    count?: (options: { path: string }) => void
  }
}

const getInitialAnalyticsPath = () => {
  const canonical = document.querySelector<HTMLLinkElement>(
    "link[rel='canonical'][href]"
  )
  return normalizeAnalyticsPath(canonical?.href ?? window.location.href)
}

const trackNavigation = (to: string, lastTrackedPath: { value: string }) => {
  const path = normalizeAnalyticsPath(to)
  if (path === lastTrackedPath.value) return

  lastTrackedPath.value = path
  ;(window as GoatCounterWindow).goatcounter?.count?.({ path })
}

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ router, app }) {
    app.use(FloatingVue)
    loadProgress(router)

    if (typeof window !== 'undefined') {
      const lastTrackedPath = { value: getInitialAnalyticsPath() }

      applySeasonalBranding()
      requestAnimationFrame(applySeasonalBranding)

      const originalBefore = router.onBeforeRouteChange
      const originalAfter = router.onAfterRouteChanged

      router.onBeforeRouteChange = (to) => {
        cancelPendingScroll()

        // A search navigation is only the one whose destination matches the
        // pending query's recorded path. Any other navigation (e.g. a sidebar
        // link clicked while the search target is still loading) must clear the
        // stale query so it is never consumed on the wrong page.
        const normalizePath = (p: string) =>
          p
            .replace(/\.html$/, '')
            .replace(/\/index$/, '')
            .replace(/\/$/, '')
            .toLowerCase() || '/'

        let isSearchNav = false
        const pending = pendingScrollQuery.value
        if (pending) {
          try {
            isSearchNav =
              normalizePath(new URL(to, window.location.href).pathname) ===
              normalizePath(
                new URL(pending.path, window.location.href).pathname
              )
          } catch {
            // If URL parsing fails, assume this is the search nav rather than
            // dropping the query and silently breaking scroll-to-match.
            isSearchNav = true
          }
        }

        if (!isSearchNav) {
          pendingScrollQuery.value = null
        }

        originalBefore?.(to)
      }

      router.onAfterRouteChanged = (to) => {
        const hasPendingSearch = !!pendingScrollQuery.value

        originalAfter?.(to)

        requestAnimationFrame(applySeasonalBranding)

        // Scroll to the exact matching text after a search-result navigation
        if (hasPendingSearch) {
          const { query, matchContext } = pendingScrollQuery.value!
          pendingScrollQuery.value = null
          const hash = window.location.hash.slice(1)
          scheduleScrollToMatch(hash, query, 16, matchContext)
        }

        if (
          !window.location.hostname.match(/(^|\.)localhost$|^127\.|^192\.168\./)
        ) {
          trackNavigation(to, lastTrackedPath)
        }
      }
    }

    // Initialize theme handler
    useThemeHandler()
  }
} satisfies Theme
