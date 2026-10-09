<script setup>
import { computed, onMounted } from 'vue'
import {
  getPublicStatus,
  PUBLIC_STATUS_COLORS
} from '../../../shared/blog-health-status.js'
import { normalizeBlogHealthUrl } from '../../../shared/blog-health-url.js'
import { getBlogLinkAttributes } from '../../../shared/blog-link.js'
import {
  healthStatuses,
  loadHealthStatuses
} from './blog-health-status-client.js'

const props = defineProps({
  name: { type: String, required: true },
  url: { type: String, required: true },
  favourite: { type: Boolean, default: false }
})

const normalizedUrl = computed(() => {
  try {
    return normalizeBlogHealthUrl(props.url).toString()
  } catch {
    return ''
  }
})

const health = computed(() =>
  getPublicStatus(healthStatuses.get(normalizedUrl.value), new Date())
)

const statusDetails = {
  online: { color: PUBLIC_STATUS_COLORS.online, label: 'Online' },
  warning: { color: PUBLIC_STATUS_COLORS.warning, label: 'Needs review' },
  'repeatedly-unreachable': {
    color: PUBLIC_STATUS_COLORS['repeatedly-unreachable'],
    label: 'Repeatedly unreachable'
  },
  unknown: { color: PUBLIC_STATUS_COLORS.unknown, label: 'Unknown or stale' }
}

const statusLabel = computed(() => statusDetails[health.value.status].label)
const tooltip = computed(() => {
  const checked = health.value.checkedAt
    ? new Date(health.value.checkedAt).toISOString().slice(0, 10)
    : 'not available'
  return `Health status: ${statusLabel.value}. Last checked: ${checked}.`
})
const linkAttributes = computed(() => getBlogLinkAttributes(props.url))

onMounted(() => {
  void loadHealthStatuses()
})
</script>

<template>
  <strong class="blog-health-link">
    <span v-if="favourite" class="blog-favourite" aria-label="Favourite">
      ⭐
    </span>
    <a v-bind="linkAttributes" :href="url">{{ name }}</a>
    <span
      class="blog-health-dot"
      :style="{ backgroundColor: statusDetails[health.status].color }"
      :title="tooltip"
      :aria-label="tooltip"
      role="img"
    ></span>
    <span class="blog-health-sr-only">{{ statusLabel }}</span>
  </strong>
</template>

<style scoped>
.blog-health-link {
  display: inline;
}

.blog-health-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 0.35em;
  border-radius: 50%;
  vertical-align: middle;
}

.blog-favourite {
  margin-right: 0.25em;
}

.blog-health-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
