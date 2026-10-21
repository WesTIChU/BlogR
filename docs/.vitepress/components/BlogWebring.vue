<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  expectedWidgetLinks,
  SHOW_WEBRING,
  WEBRING_BASIC_THEMES,
  WEBRING_WIDGET_IMAGE_URLS,
  WEBRING_WIDGET_PREVIEW_IMAGE_URLS,
  webringBasicLabels,
  widgetHtmlForDesign
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
const selectedDesign = ref('basic')
const basicStyle = ref('classic')
const basicThemeLabels = computed(() => webringBasicLabels(basicStyle.value))
const code = computed(() =>
  widgetHtmlForDesign(
    props.webringId,
    selectedDesign.value === 'basic'
      ? `basic-${basicStyle.value}`
      : selectedDesign.value
  )
)
const widgetLinks = computed(() => expectedWidgetLinks(props.webringId))
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
  const width = Math.min(850, availableWidth || window.innerWidth - margin * 2)

  positionStyle.value = {
    width: `${width}px`,
    left: '0px',
    top: '0px'
  }
  await nextTick()

  const popupHeight = popover.value.getBoundingClientRect().height
  const preferredLeft = Math.max(
    leftBoundary,
    (leftBoundary + rightBoundary - width) / 2
  )
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
        class="blog-metadata-visual blog-webring-icon"
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
          <b>BlogR Webring Beta</b>
          The Webring is still being tested and may change or be removed. You're
          welcome to try it! If the Webring is discontinued, your Webring
          membership will end.
        </small>
        <small class="blog-webring-domain-warning">
          <b>Important: This code is unique to your website</b>
          This code only works on the website registered with BlogR. Please
          don't use it on another website.
          <span v-if="registeredDomain" class="blog-webring-registered-domain">
            <b>Registered website:</b>
            {{ registeredDomain }}
          </span>
        </small>
        <fieldset class="blog-webring-design-selector">
          <legend>Choose your Webring widget</legend>
          <label class="blog-webring-design-option">
            <input v-model="selectedDesign" type="radio" value="image-blog" />
            <img
              :src="WEBRING_WIDGET_PREVIEW_IMAGE_URLS.blog"
              alt="Blog Webring widget design"
            />
            <span>Image 1</span>
          </label>
          <label class="blog-webring-design-option">
            <input v-model="selectedDesign" type="radio" value="image-globe" />
            <img
              :src="WEBRING_WIDGET_PREVIEW_IMAGE_URLS.globe"
              alt="Globe Webring widget design"
            />
            <span>Image 2</span>
          </label>
          <label class="blog-webring-design-option">
            <input
              v-model="selectedDesign"
              type="radio"
              value="image-halloween"
            />
            <img
              :src="WEBRING_WIDGET_PREVIEW_IMAGE_URLS.halloween"
              alt="Halloween Webring widget design"
            />
            <span>Image 3</span>
          </label>
          <label class="blog-webring-design-option">
            <input
              v-model="selectedDesign"
              type="radio"
              value="image-christmas"
            />
            <img
              :src="WEBRING_WIDGET_PREVIEW_IMAGE_URLS.christmas"
              alt="Christmas Webring widget design"
            />
            <span>Image 4</span>
          </label>
          <div class="blog-webring-design-option blog-webring-basic-option">
            <label>
              <input v-model="selectedDesign" type="radio" value="basic" />
              Basic Links
            </label>
            <span class="blog-webring-basic-preview">
              <a :href="widgetLinks.previous" aria-label="Previous">
                {{ basicThemeLabels.previous }}
              </a>
              ·
              <a :href="widgetLinks.random" aria-label="Random">
                {{ basicThemeLabels.random }}
              </a>
              ·
              <a :href="widgetLinks.next" aria-label="Next">
                {{ basicThemeLabels.next }}
              </a>
            </span>
            <label
              v-if="selectedDesign === 'basic'"
              class="blog-webring-basic-styles"
            >
              <span>Theme</span>
              <select v-model="basicStyle" aria-label="Basic Links theme">
                <option
                  v-for="(_, theme) in WEBRING_BASIC_THEMES"
                  :key="theme"
                  :value="theme"
                >
                  {{
                    theme === 'retro'
                      ? 'Retro Web'
                      : theme[0].toUpperCase() + theme.slice(1)
                  }}
                </option>
              </select>
            </label>
          </div>
        </fieldset>
        <div class="blog-webring-live-preview">
          <small>Preview</small>
          <div
            v-if="
              selectedDesign === 'image-blog' ||
              selectedDesign === 'image-globe' ||
              selectedDesign === 'image-halloween' ||
              selectedDesign === 'image-christmas'
            "
            class="blogr-webring-widget blog-webring-image-preview"
          >
            <img
              :src="
                selectedDesign === 'image-blog'
                  ? WEBRING_WIDGET_PREVIEW_IMAGE_URLS.blog
                  : selectedDesign === 'image-globe'
                    ? WEBRING_WIDGET_PREVIEW_IMAGE_URLS.globe
                    : selectedDesign === 'image-halloween'
                      ? WEBRING_WIDGET_PREVIEW_IMAGE_URLS.halloween
                      : WEBRING_WIDGET_PREVIEW_IMAGE_URLS.christmas
              "
              alt="BlogR Webring widget preview"
            />
            <nav aria-label="BlogR Webring preview" @click.prevent>
              <a :href="widgetLinks.previous" aria-label="Previous">
                {{ basicThemeLabels.previous }}
              </a>
              ·
              <a :href="widgetLinks.random" aria-label="Random">
                {{ basicThemeLabels.random }}
              </a>
              ·
              <a :href="widgetLinks.next" aria-label="Next">
                {{ basicThemeLabels.next }}
              </a>
            </nav>
          </div>
          <nav v-else aria-label="BlogR Webring preview" @click.prevent>
            <a :href="widgetLinks.previous">
              {{ basicThemeLabels.previous }}
            </a>
            ·
            <a :href="widgetLinks.random">
              {{ basicThemeLabels.random }}
            </a>
            ·
            <a :href="widgetLinks.next">
              {{ basicThemeLabels.next }}
            </a>
          </nav>
        </div>
        <code v-text="code"></code>
        <button type="button" @click="copyCode">
          {{ copied ? 'Copied!' : 'Copy Code' }}
        </button>
        <small class="blog-webring-install-label">Where to add it</small>
        <small class="blog-webring-install-description">
          Add the code to your homepage, blog, links or Webring page.
        </small>
        <small class="blog-webring-verification-note">
          Once you've added the code, BlogR will automatically check your
          website. You can also request a check below.
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
  gap: 8px;
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
  width: min(850px, calc(100vw - 2rem));
  max-width: calc(100vw - 2rem);
  max-height: calc(100vh - 24px);
  box-sizing: border-box;
  overflow-y: auto;
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
.blog-webring-design-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0 0 10px;
  padding: 0;
  border: 0;
}
.blog-webring-design-selector legend {
  width: 100%;
  margin-bottom: 5px;
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.blog-webring-design-option {
  display: flex;
  min-width: 0;
  box-sizing: border-box;
  align-items: center;
  gap: 5px;
  padding: 5px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  cursor: pointer;
}
.blog-webring-design-option input {
  flex: 0 0 auto;
  margin: 0;
}
.blog-webring-design-option img {
  width: 100px;
  max-width: 100%;
  height: auto;
}
.blog-webring-basic-option {
  display: block;
}
.blog-webring-basic-preview {
  display: block;
  margin-top: 5px;
  overflow-wrap: anywhere;
  font-size: 0.75rem;
}
.blog-webring-basic-preview a {
  color: var(--vp-c-brand-1);
}
.blog-webring-basic-styles {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  font-size: 0.75rem;
}
.blog-webring-basic-styles select {
  min-width: 118px;
  padding: 2px 5px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 2px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font: inherit;
}
.blog-webring-live-preview {
  display: flex;
  min-height: 34px;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 0 10px;
  padding: 5px 7px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  overflow-wrap: anywhere;
}
.blog-webring-live-preview > small {
  flex: 0 0 auto;
  color: var(--vp-c-text-2);
}
.blog-webring-image-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.blog-webring-image-preview img {
  width: min(220px, 100%);
  height: auto;
  max-width: 100%;
  object-fit: contain;
}
.blog-webring-live-preview nav {
  line-height: 1.35;
}
.blog-webring-live-preview a {
  color: var(--vp-c-brand-1);
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
.blog-webring-install-description,
.blog-webring-verification-note {
  display: block;
  line-height: 1.45;
}
.blog-webring-install-label {
  margin-bottom: 2px;
  font-weight: 600;
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
@media (max-width: 560px) {
  .blog-webring-design-selector {
    grid-template-columns: 1fr;
  }
  .blog-webring-design-option img {
    width: 110px;
  }
}
</style>
