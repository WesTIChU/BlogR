<script setup>
import { computed, onMounted } from 'vue'
import updates from '../../../data/blog-updates.json'
import blogs from '../../../data/blogs.json'
import communities from '../../../data/communities.json'
import {
  getPublicStatus,
  PUBLIC_STATUS_COLORS
} from '../../../shared/blog-health-status.js'
import { normalizeBlogHealthUrl } from '../../../shared/blog-health-url.js'
import {
  formatRelativeDate,
  getBlogUpdate,
  getVerifiedFeedUrl
} from '../../../shared/blog-update.js'
import { formatAddedDate } from '../../../shared/recently-added.js'
import {
  healthStatuses,
  loadHealthStatuses
} from './blog-health-status-client.js'
import { showBlogDetails } from './blog-stats-visibility.js'
import {
  communityHealthStatuses,
  loadCommunityHealthStatuses
} from './community-health-status-client.js'

const props = defineProps({
  url: { type: String, required: true },
  addedDate: { type: String, default: null },
  community: { type: Boolean, default: false }
})

const normalizedUrl = computed(() => {
  try {
    return normalizeBlogHealthUrl(props.url).toString()
  } catch {
    return ''
  }
})

const catalogueEntry = computed(() =>
  (props.community ? communities : blogs).find((item) => {
    try {
      return normalizeBlogHealthUrl(item.url).toString() === normalizedUrl.value
    } catch {
      return false
    }
  })
)
const favourite = computed(() => Boolean(catalogueEntry.value?.favourite))

const health = computed(() =>
  getPublicStatus(
    (props.community ? communityHealthStatuses : healthStatuses).get(
      normalizedUrl.value
    ),
    new Date()
  )
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
const update = computed(() =>
  props.community ? null : getBlogUpdate(updates, props.url)
)
const relativeUpdate = computed(() =>
  props.community
    ? formatRelativeDate(health.value.checkedAt?.slice(0, 10))
    : update.value?.status === 'success'
      ? formatRelativeDate(update.value.lastPublished)
      : null
)
const updateTooltip = computed(() =>
  props.community
    ? health.value.checkedAt
      ? `Last checked: ${health.value.checkedAt}`
      : ''
    : update.value?.lastPublished
      ? `Last updated: ${update.value.lastPublished}`
      : ''
)
const feedUrl = computed(() =>
  props.community ? null : getVerifiedFeedUrl(updates, props.url)
)
const feedLabel = computed(
  () => `RSS feed for ${catalogueEntry.value?.name ?? 'blog'}`
)
const addedDateText = computed(() => formatAddedDate(props.addedDate))

onMounted(() => {
  void (props.community ? loadCommunityHealthStatuses() : loadHealthStatuses())
})
</script>

<template>
  <span
    v-if="favourite || health || relativeUpdate || feedUrl || addedDateText"
    v-show="showBlogDetails"
    class="blog-last-updated"
  >
    <span v-if="favourite" class="blog-favourite" aria-label="Favourite">
      ⭐
    </span>
    <a
      v-if="feedUrl"
      class="blog-feed-link"
      :href="feedUrl"
      :aria-label="feedLabel"
      :title="feedLabel"
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg
        class="blog-feed-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
        <path d="M4 4a16 16 0 0 1 16 16" />
        <path d="M4 10a10 10 0 0 1 10 10" />
      </svg>
    </a>
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
      {{ props.community ? 'Last checked' : 'Last updated' }}&nbsp;{{
        relativeUpdate
      }}
    </span>
    <span
      v-if="addedDateText && relativeUpdate"
      class="blog-metadata-separator"
      aria-hidden="true"
    >
      ·
    </span>
    <span v-if="addedDateText" class="blog-added-date">
      Added&nbsp;{{ addedDateText }}
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
  flex-wrap: wrap;
}

.blog-favourite {
  color: #facc15;
  font-size: 0.75rem;
  line-height: 1;
}

.blog-health-dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.blog-feed-link {
  display: inline-flex;
  flex: 0 0 auto;
  color: #f97316;
  line-height: 1;
}

.blog-feed-link:hover {
  color: #ea580c;
}

.blog-feed-icon {
  width: 0.9rem;
  height: 0.9rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.blog-feed-icon path:first-child {
  fill: currentColor;
  stroke: none;
}

.blog-metadata-separator {
  color: var(--vp-c-text-3);
}

.blog-added-date {
  display: inline-block;
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
