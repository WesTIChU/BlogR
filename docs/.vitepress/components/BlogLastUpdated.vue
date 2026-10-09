<script setup>
import { computed, onMounted } from 'vue'
import updates from '../../../data/blog-updates.json'
import blogs from '../../../data/blogs.json'
import {
  getPublicStatus,
  PUBLIC_STATUS_COLORS
} from '../../../shared/blog-health-status.js'
import { normalizeBlogHealthUrl } from '../../../shared/blog-health-url.js'
import {
  formatRelativeDate,
  getBlogUpdate
} from '../../../shared/blog-update.js'
import {
  healthStatuses,
  loadHealthStatuses
} from './blog-health-status-client.js'

const props = defineProps({
  url: { type: String, required: true }
})

const normalizedUrl = computed(() => {
  try {
    return normalizeBlogHealthUrl(props.url).toString()
  } catch {
    return ''
  }
})

const favourite = computed(() => {
  const blog = blogs.find((item) => {
    try {
      return normalizeBlogHealthUrl(item.url).toString() === normalizedUrl.value
    } catch {
      return false
    }
  })
  return Boolean(blog?.favourite)
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

onMounted(() => {
  void loadHealthStatuses()
})
</script>

<template>
  <span v-if="favourite || health || relativeUpdate" class="blog-last-updated">
    <span v-if="favourite" class="blog-favourite" aria-label="Favourite">
      ⭐
    </span>
    <span
      class="blog-health-dot"
      :style="{ backgroundColor: statusDetails[health.status].color }"
      :title="tooltip"
      :aria-label="tooltip"
      role="img"
    ></span>
    <span
      v-if="relativeUpdate"
      :title="updateTooltip"
      :aria-label="updateTooltip"
    >
      Last updated&nbsp;{{ relativeUpdate }}
    </span>
    <span class="blog-health-sr-only">{{ statusLabel }}</span>
  </span>
</template>

<style scoped>
.blog-last-updated {
  display: flex;
  align-items: center;
  gap: 0.4em;
  margin-top: 0.15em;
  color: var(--vp-c-text-3);
  font-size: 0.75em;
  font-weight: 400;
  white-space: nowrap;
}

.blog-favourite {
  color: #facc15;
  font-size: 1rem;
  line-height: 1;
}

.blog-health-dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
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
