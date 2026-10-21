<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  SHOW_WEBRING,
  WEBRING_INSTALL_PATHS,
  widgetHtml
} from '../../../shared/webring.js'

const props = defineProps({
  webringId: { type: String, required: true }
})
const open = ref(false)
const verified = ref(false)
const copied = ref(false)
const code = computed(() => widgetHtml(props.webringId))

const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(code.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    copied.value = false
  }
}

onMounted(async () => {
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
</script>

<template>
  <span v-if="SHOW_WEBRING" class="blog-webring">
    <span
      v-if="verified"
      class="blog-webring-globe"
      title="Verified BlogR Webring member"
      aria-label="Verified BlogR Webring member"
    >
      🌐
    </span>
    <button
      class="blog-webring-trigger"
      type="button"
      aria-label="BlogR Webring options"
      @click="open = !open"
    >
      ↗
    </button>
    <span v-if="open" class="blog-webring-popover" role="dialog">
      <strong>BlogR Webring</strong>
      <code v-text="code"></code>
      <button type="button" @click="copyCode">
        {{ copied ? 'Copied' : 'Copy Code' }}
      </button>
      <small>Install on {{ WEBRING_INSTALL_PATHS.join(', ') }}.</small>
      <small>
        Please allow up to 12 hours for BlogR to automatically verify your
        installation.
      </small>
    </span>
  </span>
</template>

<style scoped>
.blog-webring {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}
.blog-webring-trigger {
  border: 0;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  padding: 0 0.15rem;
  font-size: 0.8em;
}
.blog-webring-globe {
  font-size: 0.85em;
}
.blog-webring-popover {
  position: absolute;
  z-index: 20;
  top: 1.4rem;
  left: 0;
  width: min(22rem, 80vw);
  padding: 0.65rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  box-shadow: var(--vp-shadow-2);
  font-size: 0.8rem;
}
.blog-webring-popover code {
  display: block;
  max-height: 4rem;
  overflow: auto;
  margin: 0.4rem 0;
  white-space: pre-wrap;
}
.blog-webring-popover button {
  margin-bottom: 0.35rem;
}
.blog-webring-popover small {
  display: block;
  line-height: 1.35;
}
</style>
