<!-- Modified for BlogR Directory, 2026. -->
<script setup lang="ts">
import { getScrollOffset, useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Announcement from './components/Announcement.vue'
import Sidebar from './components/SidebarCard.vue'
import { useSearchFromQuery } from './composables/searchFromQuery'

useSearchFromQuery()

const { Layout } = DefaultTheme
const route = useRoute()

const getHashTarget = () => {
  try {
    return document.getElementById(decodeURIComponent(location.hash.slice(1)))
  } catch {
    return null
  }
}

const correctInitialHashScroll = async () => {
  if (!window.location.hash) return

  const navigation = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined
  if (navigation?.type === 'back_forward') return

  const previousScrollRestoration = history.scrollRestoration
  history.scrollRestoration = 'manual'

  try {
    const expectedUrl = window.location.href
    const pageShown =
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((resolve) =>
            window.addEventListener('pageshow', () => resolve(), { once: true })
          )
    await Promise.all([nextTick(), document.fonts?.ready, pageShown])
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    if (
      window.location.href !== expectedUrl ||
      document.documentElement.classList.contains('vp-search-scrolling')
    ) {
      return
    }

    getHashTarget()?.scrollIntoView({ block: 'start' })
  } finally {
    history.scrollRestoration = previousScrollRestoration
  }
}

let insetResizeObserver: ResizeObserver | undefined
let insetMutationObserver: MutationObserver | undefined

const updateScrollInset = () => {
  const nav = document.querySelector<HTMLElement>('.VPNav')
  const localNav = document.querySelector<HTMLElement>('.VPLocalNav')
  const visibleHeight = (element: HTMLElement | null, hidden = false) =>
    element && !hidden && getComputedStyle(element).display !== 'none'
      ? element.getBoundingClientRect().height
      : 0

  const inset =
    visibleHeight(nav, nav?.classList.contains('nav-hidden')) +
    visibleHeight(localNav) +
    16
  document.documentElement.style.setProperty(
    '--blogr-scroll-inset',
    `${inset}px`
  )
  if (resizing && hashIsAligned) scheduleHashRealignment()
}

const observeScrollInset = () => {
  const elements = [
    document.querySelector<HTMLElement>('.VPNav'),
    document.querySelector<HTMLElement>('.VPLocalNav')
  ].filter((element): element is HTMLElement => !!element)

  insetResizeObserver = new ResizeObserver(updateScrollInset)
  insetMutationObserver = new MutationObserver(updateScrollInset)
  for (const element of elements) {
    insetResizeObserver.observe(element)
    insetMutationObserver.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })
  }
  updateScrollInset()
}

// Anchors are stable for the lifetime of a page; invalidate on route change.
let cachedAnchors: HTMLElement[] | null = null
let scheduledUpdate = false

const runUpdateMobileActiveLink = () => {
  if (window.innerWidth >= 1280) return

  if (!cachedAnchors) {
    cachedAnchors = Array.from(
      document.querySelectorAll<HTMLElement>('.VPDoc h2, .VPDoc h3, .VPDoc h4')
    )
  }

  let activeId = ''
  for (const anchor of cachedAnchors) {
    if (anchor.getBoundingClientRect().top <= getScrollOffset() + 4) {
      activeId = anchor.id
    } else {
      break
    }
  }

  const mobileLinks = document.querySelectorAll(
    '.VPLocalNavOutlineDropdown .outline-link'
  )
  mobileLinks.forEach((link) => {
    const isMatch = link.getAttribute('href') === `#${activeId}`
    link.classList.toggle('active', isMatch)
  })
}

// rAF-throttle so rapid scroll events collapse into one update per frame
// and DOM reads happen in the same phase as paint (no layout thrash).
const scheduleMobileLinkUpdate = () => {
  if (scheduledUpdate) return
  scheduledUpdate = true
  requestAnimationFrame(() => {
    scheduledUpdate = false
    runUpdateMobileActiveLink()
  })
}

// Clicking the local-nav button opens the TOC dropdown; rAF defers the
// update until Vue has mounted the new items.
const handleAnyClick = () => requestAnimationFrame(scheduleMobileLinkUpdate)

let hashIsAligned = false
let resizing = false
let resizeFrame = 0
let resizeEndTimer: ReturnType<typeof setTimeout> | undefined

const scheduleHashRealignment = () => {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    if (hashIsAligned) getHashTarget()?.scrollIntoView({ block: 'start' })
  })
}

const rememberHashAlignment = () => {
  if (resizing) return
  const target = getHashTarget()
  const margin = target
    ? Number.parseFloat(getComputedStyle(target).scrollMarginTop)
    : 0
  hashIsAligned =
    !!target && Math.abs(target.getBoundingClientRect().top - margin) < 2
}

const preserveAlignedHash = () => {
  resizing = true
  document.documentElement.classList.add('vp-resizing')
  scheduleHashRealignment()

  clearTimeout(resizeEndTimer)
  resizeEndTimer = setTimeout(() => {
    resizing = false
    document.documentElement.classList.remove('vp-resizing')
    rememberHashAlignment()
  }, 150)
}

watch(
  () => route.path,
  () => {
    cachedAnchors = null
    scheduleMobileLinkUpdate()
  }
)

onMounted(() => {
  window.addEventListener('scroll', scheduleMobileLinkUpdate, { passive: true })
  window.addEventListener('scroll', rememberHashAlignment, { passive: true })
  window.addEventListener('resize', preserveAlignedHash, { passive: true })
  window.addEventListener('click', handleAnyClick, { passive: true })
  observeScrollInset()
  scheduleMobileLinkUpdate()
  void correctInitialHashScroll()
})

onUnmounted(() => {
  cancelAnimationFrame(resizeFrame)
  clearTimeout(resizeEndTimer)
  document.documentElement.classList.remove('vp-resizing')
  insetResizeObserver?.disconnect()
  insetMutationObserver?.disconnect()
  window.removeEventListener('scroll', scheduleMobileLinkUpdate)
  window.removeEventListener('scroll', rememberHashAlignment)
  window.removeEventListener('resize', preserveAlignedHash)
  window.removeEventListener('click', handleAnyClick)
})
</script>

<template>
  <div class="blogr-scroll-inset" aria-hidden="true"></div>
  <Layout>
    <template #sidebar-nav-after>
      <Sidebar />
    </template>
    <template #home-hero-info-before>
      <Announcement />
    </template>
    <template #home-hero-image>
      <div class="blogr-home-hero-image">
        <img
          src="/blogr-hero.svg"
          alt="BlogR Directory illustration"
          width="640"
          height="520"
        />
      </div>
    </template>
    <template #home-features-before>
      <p class="text-center text-lg text-text-2 mb-2">
        Or browse these pages
        <span class="inline-block i-twemoji:sparkles" />
      </p>
    </template>
    <Content />
  </Layout>
</template>

<style>
/* The reveal is driven entirely by the JS clip-path animation in
   revealThemeChange, so disable the default crossfade on both snapshots. */
::view-transition-old(root),
::view-transition-new(root) {
  animation: none;
  mix-blend-mode: normal;
}

/* Layer the snapshots so the one being clipped sits on top:
   - switching to light, the new (light) layer grows on top;
   - switching to dark (.dark), the old (light) layer shrinks on top. */
::view-transition-old(root),
.dark::view-transition-new(root) {
  z-index: 1;
}

::view-transition-new(root),
.dark::view-transition-old(root) {
  z-index: 9999;
}

/* When transitioning to light mode (not .dark), initialize the new snapshot
   as fully clipped (circle(0px)) to prevent it flashing fully visible
   before the JS animation runs. */
html:not(.dark)::view-transition-new(root) {
  clip-path: circle(0px);
}
</style>
