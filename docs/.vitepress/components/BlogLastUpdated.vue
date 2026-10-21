<script setup>
import { computed, onMounted } from 'vue'
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
import { countryPath, getCountryInfo } from '../../../shared/countries.js'
import {
  formatAddedDate,
  LONDON_TIME_ZONE
} from '../../../shared/recently-added.js'
// The helper replaces per-row `props.community ? communities : blogs` scans.
import { getCatalogueEntry } from './blog-health-catalogue.js'
import {
  healthStatuses,
  loadHealthStatuses
} from './blog-health-status-client.js'
import { showBlogDetails } from './blog-stats-visibility.js'
import { blogUpdates, loadBlogUpdates } from './blog-update-client.js'
import {
  communityHealthStatuses,
  loadCommunityHealthStatuses
} from './community-health-status-client.js'

const props = defineProps({
  url: { type: String, required: true },
  addedDate: { type: String, default: null },
  publicationAt: { type: String, default: null },
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
  getCatalogueEntry(props.community, normalizedUrl.value)
)
const favourite = computed(() => Boolean(catalogueEntry.value?.favourite))

const health = computed(() =>
  getPublicStatus(
    (props.community ? communityHealthStatuses : healthStatuses).value.get(
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
  props.community ? null : getBlogUpdate(blogUpdates.value, props.url)
)
const relativeUpdate = computed(() =>
  props.publicationAt
    ? formatPublicationTime(props.publicationAt)
    : props.community
      ? formatRelativeDate(health.value.checkedAt?.slice(0, 10))
      : update.value?.status === 'success'
        ? formatRelativeDate(update.value.lastPublished)
        : null
)
const relativeUpdateLabel = computed(() =>
  props.publicationAt
    ? 'Published'
    : props.community
      ? 'Last checked'
      : 'Last updated'
)
const updateTooltip = computed(() =>
  props.publicationAt
    ? `Published: ${props.publicationAt}`
    : props.community
      ? health.value.checkedAt
        ? `Last checked: ${health.value.checkedAt}`
        : ''
      : update.value?.lastPublished
        ? `Last updated: ${update.value.lastPublished}`
        : ''
)

function formatPublicationTime(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatRelativeDate(value)
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: LONDON_TIME_ZONE,
    timeZoneName: 'short'
  }).format(date)
}
const feedUrl = computed(() =>
  props.community ? null : getVerifiedFeedUrl(blogUpdates.value, props.url)
)
const feedLabel = computed(
  () => `RSS feed for ${catalogueEntry.value?.name ?? 'blog'}`
)
const addedDateText = computed(() => formatAddedDate(props.addedDate))
const country = computed(() =>
  props.community ? null : getCountryInfo(catalogueEntry.value?.country)
)
const countryUrl = computed(() => countryPath(country.value))

onMounted(() => {
  void (props.community ? loadCommunityHealthStatuses() : loadHealthStatuses())
  if (!props.community) void loadBlogUpdates()
})
</script>

<template>
  <span
    v-if="favourite || health || relativeUpdate || feedUrl || addedDateText"
    v-show="showBlogDetails"
    class="blog-last-updated"
  >
    <span
      v-if="favourite"
      class="blog-metadata-icon blog-favourite"
      aria-label="Favourite"
    >
      ⭐
    </span>
    <a
      v-if="feedUrl"
      class="blog-metadata-icon-button blog-feed-link"
      :href="feedUrl"
      :aria-label="feedLabel"
      :title="feedLabel"
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg
        class="blog-metadata-icon blog-feed-icon"
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
    <span v-if="country" class="blog-metadata-separator" aria-hidden="true">
      ·
    </span>
    <a
      v-if="country && countryUrl"
      class="blog-country"
      :href="countryUrl"
      :aria-label="`Based in ${country.name}`"
    >
      <span aria-hidden="true">{{ country.flag }}</span>
      {{ country.name }}
    </a>
    <span
      v-if="country && relativeUpdate"
      class="blog-metadata-separator"
      aria-hidden="true"
    >
      ·
    </span>
    <span
      v-if="relativeUpdate"
      :title="updateTooltip"
      :aria-label="updateTooltip"
    >
      {{ relativeUpdateLabel }}&nbsp;{{ relativeUpdate }}
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
    <slot />
    <span class="blog-health-sr-only">{{ statusLabel }}</span>
  </span>
</template>

<style scoped>
.blog-last-updated {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 0.15em;
  color: var(--vp-c-text-3);
  font-size: 0.75em;
  font-weight: 400;
  flex-wrap: wrap;
}

.blog-metadata-icon,
.blog-metadata-icon-button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}

.blog-metadata-icon {
  width: 14px;
  height: 14px;
  font-size: 14px;
  line-height: 1;
}

.blog-metadata-icon-button {
  width: 20px;
  height: 20px;
  line-height: 1;
}

.blog-favourite {
  color: #facc15;
}

.blog-health-dot {
  display: inline-block;
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.blog-country {
  display: inline-flex;
  align-items: center;
  gap: 0.2em;
  color: inherit;
  text-decoration: none;
  white-space: nowrap;
}

.blog-country:hover {
  color: inherit;
  text-decoration: underline;
}

.blog-feed-link {
  color: #f97316;
}

.blog-feed-link:hover {
  color: #ea580c;
}

.blog-feed-icon {
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
