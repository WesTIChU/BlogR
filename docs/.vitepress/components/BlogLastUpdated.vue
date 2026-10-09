<script setup>
import { computed } from 'vue'
import updates from '../../../data/blog-updates.json'
import {
  formatRelativeDate,
  getBlogUpdate
} from '../../../shared/blog-update.js'

const props = defineProps({
  url: { type: String, required: true }
})

const update = computed(() => getBlogUpdate(updates, props.url))
const relativeUpdate = computed(() =>
  update.value?.status === 'success'
    ? formatRelativeDate(update.value.lastPublished)
    : null
)
const updateTooltip = computed(() =>
  update.value?.lastPublished
    ? `Last updated: ${update.value.lastPublished}`
    : ''
)
</script>

<template>
  <span
    v-if="relativeUpdate"
    class="blog-last-updated"
    :title="updateTooltip"
    :aria-label="updateTooltip"
  >
    &middot;&nbsp;Last updated&nbsp;{{ relativeUpdate }}
  </span>
</template>

<style scoped>
.blog-last-updated {
  display: inline;
  margin-left: 0.35em;
  color: var(--vp-c-text-3);
  font-size: 0.8em;
  font-weight: 400;
  white-space: nowrap;
}
</style>
