<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const logoTitle = 'BlogR Directory'
const characters = [
  'B',
  'l',
  'o',
  'g',
  'R',
  ' ',
  'D',
  'i',
  'r',
  'e',
  'c',
  't',
  'o',
  'r',
  'y'
]
const typedCount = ref(0)
const fontReady = ref(false)
let typingTimer: ReturnType<typeof setInterval> | undefined

const startTyping = () => {
  typedCount.value = 0
  typingTimer = setInterval(() => {
    typedCount.value += 1
    if (typedCount.value === characters.length && typingTimer) {
      clearInterval(typingTimer)
      typingTimer = undefined
    }
  }, 120)
}

onMounted(() => {
  nextTick(async () => {
    await document.fonts.load('700 22px "Courier New"')
    await document.fonts.ready
    fontReady.value = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      typedCount.value = characters.length
    } else {
      requestAnimationFrame(startTyping)
    }
  })
})

onBeforeUnmount(() => {
  if (typingTimer) clearInterval(typingTimer)
})
</script>

<template>
  <span
    class="blogr-logo"
    :class="{
      'is-font-ready': fontReady,
      'is-complete': typedCount === characters.length
    }"
    role="img"
    :aria-label="logoTitle"
  >
    <span class="blogr-logo__reference" aria-hidden="true">
      <span>Blog</span>
      <span class="blogr-logo__r">R</span>
      <span>Directory</span>
    </span>
    <span class="blogr-logo__visible" aria-hidden="true">
      <template v-for="(character, index) in characters" :key="index">
        <span
          v-if="index < typedCount"
          :class="{ 'blogr-logo__r': character === 'R' }"
        >
          {{ character }}
        </span>
      </template>
      <span class="blogr-logo__cursor" />
    </span>
  </span>
</template>

<style scoped>
.blogr-logo {
  position: relative;
  display: block;
  width: min(100%, 236px);
  aspect-ratio: 236 / 44;
  overflow: visible;
  font-family: 'Courier New', Courier, monospace;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.45px;
  line-height: 1;
  white-space: pre;
}

.blogr-logo__reference {
  visibility: hidden;
  display: inline-block;
  white-space: pre;
}

.blogr-logo__visible {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  visibility: hidden;
}

.blogr-logo.is-font-ready .blogr-logo__visible {
  visibility: visible;
}

.blogr-logo__r {
  display: inline-block;
  color: var(--vp-button-brand-bg);
  transform: rotate(12deg);
}

.blogr-logo__cursor {
  display: inline-block;
  width: 1.5px;
  height: 16px;
  margin-left: 3px;
  border-radius: 999px;
  background: var(--vp-c-brand-1, #d9aa45);
  opacity: 1;
}

.blogr-logo.is-complete .blogr-logo__cursor {
  animation: blogr-logo-cursor-blink 1s step-end infinite;
}

@media (prefers-reduced-motion: reduce) {
  .blogr-logo.is-complete .blogr-logo__cursor {
    animation: none;
  }
}

@keyframes blogr-logo-cursor-blink {
  0%,
  49% {
    opacity: 1;
  }

  50%,
  100% {
    opacity: 0;
  }
}
</style>
