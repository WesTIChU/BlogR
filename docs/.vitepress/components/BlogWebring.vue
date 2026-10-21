<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  SHOW_WEBRING,
  WEBRING_INSTALL_PATHS,
  widgetHtml
} from '../../../shared/webring.js'
import {
  activeWebringPopup,
  closeWebringPopup,
  openWebringPopup,
  registerWebringPopup,
  toggleWebringPopup
} from './webring-popup-state.js'

const props = defineProps({
  webringId: { type: String, required: true },
  websiteUrl: { type: String, default: '' },
  websiteName: { type: String, default: '' }
})
const verified = ref(false)
const copied = ref(false)
const recheckState = ref('idle')
const code = computed(() => widgetHtml(props.webringId))
const registeredDomain = computed(() => {
  try {
    return new URL(props.websiteUrl).hostname
  } catch {
    return null
  }
})
const popupToken = Symbol(props.webringId)
const open = computed(() => activeWebringPopup.value === popupToken)
const trigger = ref(null)
const popover = ref(null)
const positionStyle = ref({})
let unregisterPopup
let copiedTimer

const togglePopup = () => toggleWebringPopup(popupToken)

const updatePosition = async () => {
  if (!open.value || !trigger.value) return
  await nextTick()
  if (!open.value || !popover.value) return

  const triggerRect = trigger.value.getBoundingClientRect()
  const margin = 12
  const leftSidebar = document.querySelector('.VPSidebar')
  const contentColumn = document.querySelector(
    '.VPDoc .content-container, .VPDoc .main, .VPDoc'
  )
  const rightSidebar = document.querySelector(
    '.VPDocAside, .aside-container, .VPDocAsideOutline'
  )
  const listingLink = trigger.value
    .closest('li')
    ?.querySelector('.blog-health-link a')
  const contentRect = contentColumn?.getBoundingClientRect()
  const listingLinkRect = listingLink?.getBoundingClientRect()
  const leftBoundary = Math.max(
    margin,
    leftSidebar?.getBoundingClientRect().right ?? 0
  )
  const rightBoundary = Math.min(
    window.innerWidth - margin,
    contentRect?.right ?? window.innerWidth - margin,
    rightSidebar?.getBoundingClientRect().left ?? window.innerWidth - margin
  )
  const contentLeft = Math.max(
    leftBoundary,
    listingLinkRect?.left ?? contentRect?.left ?? leftBoundary
  )
  const availableWidth = Math.max(0, rightBoundary - contentLeft)
  const width = Math.min(720, availableWidth || window.innerWidth - margin * 2)

  positionStyle.value = {
    width: `${width}px`,
    left: '0px',
    top: '0px'
  }
  await nextTick()

  const popupHeight = popover.value.getBoundingClientRect().height
  const preferredLeft = contentLeft
  const leftOfTrigger = triggerRect.right - width
  const left =
    preferredLeft + width <= rightBoundary
      ? preferredLeft
      : leftOfTrigger >= leftBoundary
        ? leftOfTrigger
        : Math.max(leftBoundary, rightBoundary - width)
  const below = triggerRect.bottom + 8
  const above = triggerRect.top - popupHeight - 8
  const top =
    below + popupHeight <= window.innerHeight - margin
      ? below
      : above >= margin
        ? above
        : Math.max(margin, window.innerHeight - popupHeight - margin)

  positionStyle.value = {
    width: `${width}px`,
    left: `${left}px`,
    top: `${top}px`
  }
}

const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = true
    openWebringPopup(popupToken)
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 1600)
  } catch {
    copied.value = false
  }
}

const requestRecheck = async () => {
  if (recheckState.value === 'requesting') return
  recheckState.value = 'requesting'
  try {
    const response = await fetch(
      `/api/webring/recheck?id=${encodeURIComponent(props.webringId)}`,
      { method: 'POST' }
    )
    if (response.status === 202) {
      recheckState.value = 'queued'
      return
    }
    recheckState.value = response.status === 429 ? 'limited' : 'unavailable'
  } catch {
    recheckState.value = 'unavailable'
  }
}

onMounted(async () => {
  unregisterPopup = registerWebringPopup(popupToken)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
  if (!SHOW_WEBRING) return
  try {
    const response = await fetch(
      `/api/webring/status?id=${encodeURIComponent(props.webringId)}`
    )
    verified.value = response.ok && (await response.json()).verified === true
  } catch {
    verified.value = false
  }
})

watch(open, (isOpen) => {
  if (isOpen) void nextTick(updatePosition)
})

onBeforeUnmount(() => {
  unregisterPopup?.()
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  clearTimeout(copiedTimer)
})
</script>

<template>
  <span v-if="SHOW_WEBRING" class="blog-webring">
    <span
      v-if="verified"
      class="blog-metadata-icon blog-webring-globe"
      title="Verified BlogR Webring member"
      aria-label="Verified BlogR Webring member"
    >
      🌐
    </span>
    <button
      ref="trigger"
      class="blog-metadata-icon-button blog-webring-trigger"
      type="button"
      :aria-label="
        copied ? 'Webring widget code copied' : 'Copy BlogR Webring widget code'
      "
      :title="
        copied ? 'Copied Webring widget code' : 'Copy Webring widget code'
      "
      @click="togglePopup"
    >
      <svg
        class="blog-metadata-icon blog-webring-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M14 5h5v5" />
        <path d="M19 5 11 13" />
        <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
      </svg>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        class="blog-webring-overlay"
        aria-hidden="true"
        @click="closeWebringPopup"
      ></div>
      <span
        v-if="open"
        ref="popover"
        class="blog-webring-popover"
        role="dialog"
        :style="positionStyle"
        @click.stop
      >
        <strong>BlogR Webring</strong>
        <small class="blog-webring-name-label">
          Widget installation code for:
        </small>
        <strong v-if="websiteName" class="blog-webring-website-name">
          {{ websiteName }}
        </strong>
        <small class="blog-webring-trial-warning">
          <b>BlogR Webring: Beta</b>
          The BlogR Webring is currently in beta and may change or be removed
          while we're testing it. If you're happy to help us test it, feel free
          to add the widget to your website.
        </small>
        <small class="blog-webring-domain-warning">
          <b>IMPORTANT: This code is unique to your website</b>
          This Webring code is linked to the website URL listed in BlogR. It
          will only work on that website and cannot be used on another domain.
          <span v-if="registeredDomain" class="blog-webring-registered-domain">
            <b>Registered website:</b>
            {{ registeredDomain }}
          </span>
        </small>
        <code v-text="code"></code>
        <button type="button" @click="copyCode">
          {{ copied ? 'Copied!' : 'Copy Code' }}
        </button>
        <small class="blog-webring-install-label">Install the widget on:</small>
        <small class="blog-webring-install-paths">
          <code v-for="path in WEBRING_INSTALL_PATHS" :key="path">
            {{ path }}
          </code>
        </small>
        <small class="blog-webring-verification-note">
          Once you've installed the widget, BlogR will automatically check your
          website. Request another queued check after installing or updating it.
        </small>
        <button
          type="button"
          class="blog-webring-recheck"
          :disabled="recheckState === 'requesting' || recheckState === 'queued'"
          @click="requestRecheck"
        >
          {{
            recheckState === 'requesting'
              ? 'Requesting…'
              : recheckState === 'queued'
                ? 'Check queued'
                : 'Request verification check'
          }}
        </button>
        <small
          v-if="recheckState === 'limited'"
          class="blog-webring-recheck-message"
        >
          Please wait before requesting another check.
        </small>
        <small
          v-if="recheckState === 'unavailable'"
          class="blog-webring-recheck-message"
        >
          Verification requests are temporarily unavailable.
        </small>
        <a class="blog-webring-more-link" href="/webring/">
          Learn more about the BlogR Webring →
        </a>
      </span>
    </Teleport>
  </span>
</template>

<style scoped>
.blog-webring {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: middle;
}
.blog-webring-trigger {
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  padding: 0;
  font-size: 0.8em;
}
.blog-webring-icon {
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}
.blog-webring-popover {
  position: fixed;
  z-index: 1001;
  top: 0;
  left: 0;
  width: min(720px, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  box-sizing: border-box;
  padding: 18px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  box-shadow: var(--vp-shadow-2);
  font-size: 0.8rem;
}
.blog-webring-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
}
.blog-webring-popover strong {
  display: block;
  margin-bottom: 12px;
  color: var(--vp-c-text-1);
  font-size: 1rem;
}
.blog-webring-name-label {
  display: block;
  margin: -4px 0 2px;
  color: var(--vp-c-text-2);
}
.blog-webring-website-name {
  max-width: 100%;
  margin-bottom: 12px;
  overflow-wrap: anywhere;
  line-height: 1.3;
}
.blog-webring-trial-warning {
  display: block;
  margin: 0 0 10px;
  padding: 6px 8px;
  border-inline-start: 2px solid #d6a72c;
  background: color-mix(in srgb, #d6a72c 10%, transparent);
  color: #f4d77b;
  line-height: 1.35;
}
.blog-webring-trial-warning b {
  display: block;
  margin-bottom: 1px;
  font-weight: 600;
}
.blog-webring-domain-warning {
  display: block;
  margin: 0 0 14px;
  padding: 8px 10px;
  border-inline-start: 2px solid #b45353;
  background: color-mix(in srgb, #7f1d1d 18%, transparent);
  color: #fecaca;
  line-height: 1.4;
}
.blog-webring-domain-warning > b {
  display: block;
  margin-bottom: 2px;
  color: #fee2e2;
  font-weight: 700;
}
.blog-webring-registered-domain {
  display: block;
  margin-top: 6px;
}
.blog-webring-popover code {
  display: block;
  width: 100%;
  min-height: 110px;
  max-height: 180px;
  box-sizing: border-box;
  overflow: auto;
  margin: 0 0 14px;
  padding: 10px;
  background: #0f172a;
  border: 1px solid var(--vp-c-divider);
  color: #e2e8f0;
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.blog-webring-popover button {
  display: inline-block;
  margin: 0 0 16px;
  padding: 7px 12px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 0;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  cursor: pointer;
  font-weight: 600;
}
.blog-webring-popover button:hover {
  background: var(--vp-c-brand-2);
}
.blog-webring-popover button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.blog-webring-recheck {
  margin-top: 8px !important;
  margin-bottom: 0 !important;
  padding: 5px 9px !important;
  font-size: 0.75rem;
  line-height: 1.2;
  vertical-align: middle;
}
.blog-webring-recheck-message {
  display: block;
  color: var(--vp-c-text-2);
  line-height: 1.45;
}
.blog-webring-install-label,
.blog-webring-install-paths,
.blog-webring-verification-note {
  display: block;
  line-height: 1.45;
}
.blog-webring-install-paths {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.blog-webring-install-paths code {
  display: inline-block;
  width: auto;
  min-height: 0;
  max-height: none;
  margin: 0;
  padding: 2px 5px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
  font-size: 0.75rem;
  white-space: nowrap;
  overflow-wrap: normal;
}
.blog-webring-verification-note {
  margin-top: 12px;
}
.blog-webring-more-link {
  display: inline-block;
  margin-top: 8px;
  margin-inline-start: 6px;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
  vertical-align: middle;
}
.blog-webring-popover small {
  line-height: 1.35;
}
</style>
