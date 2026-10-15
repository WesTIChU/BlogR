<script setup lang="ts">
import blogs from '../../../../data/blogs.json'
import { PUBLIC_STATUS_COLORS } from '../../../../shared/blog-health-status.js'
import BlogStatsToggle from './BlogStatsToggle.vue'
import InputField from './InputField.vue'
import ToggleIndexes from './ToggleIndexes.vue'
import ToggleStarred from './ToggleStarred.vue'

const websiteStatuses = [
  { color: PUBLIC_STATUS_COLORS.online, label: 'Online' },
  { color: PUBLIC_STATUS_COLORS.warning, label: 'Warning' },
  {
    color: PUBLIC_STATUS_COLORS['repeatedly-unreachable'],
    label: 'Unreachable'
  },
  { color: PUBLIC_STATUS_COLORS.unknown, label: 'Unknown' },
  { color: '#f59e0b', label: 'Starred', starred: true }
]
</script>

<template>
  <div>
    <div
      class="bg-$vp-c-bg hover:bg-$vp-c-bg/40 border-$vp-c-default-soft transition-border relative z-0 rounded-lg border-2 border-solid p-5 duration-500"
    >
      <div class="align-center mb-3 mt-0 flex justify-between">
        <div class="text-$vp-c-text-1 lh-relaxed text-sm font-bold">
          Website Status
        </div>
      </div>
      <div
        v-for="status in websiteStatuses"
        :key="status.label"
        class="website-status-row"
      >
        <span
          v-if="!status.starred"
          class="website-status-dot"
          :style="{ backgroundColor: status.color }"
          aria-hidden="true"
        ></span>
        <span
          v-else
          class="website-status-star"
          :style="{ color: status.color }"
          aria-hidden="true"
        >
          ★
        </span>
        <div class="website-status-label text-sm text-[var(--vp-c-text-2)]">
          {{ status.label }}
        </div>
      </div>
      <div class="sidebar-status-divider" aria-hidden="true"></div>
      <div class="sidebar-total">
        <span>Total Blogs</span>
        <strong>{{ blogs.length }}</strong>
      </div>
      <div class="sidebar-status-divider" aria-hidden="true"></div>
      <BlogStatsToggle />
      <!-- Keep the controls mounted and reversible, but temporarily hide them. -->
      <div class="sidebar-options" hidden>
        <div class="align-center mb-4 mt-4 flex justify-between">
          <div class="text-$vp-c-text-1 lh-relaxed text-sm font-bold">
            Options
          </div>
        </div>
        <InputField id="toggle-starred" label="Toggle Starred">
          <template #display>
            <ToggleStarred />
          </template>
        </InputField>
        <InputField id="toggle-indexes" label="Toggle Indexes">
          <template #display>
            <ToggleIndexes />
          </template>
        </InputField>
      </div>
    </div>
    <div class="sidebar-credit">
      Powered by
      <a
        href="https://vitepress.dev/"
        target="_blank"
        rel="noopener noreferrer"
      >
        VitePress
      </a>
    </div>
    <a
      class="sidebar-spider"
      href="https://roo.blogr.directory/"
      aria-label="Visit BlogRoo! — BlogR's secret 2006 website"
      data-tooltip="Psst... a secret!"
      title="Psst... a secret!"
    >
      <svg
        class="sidebar-spider__art"
        viewBox="0 0 24 30"
        width="24"
        height="30"
        aria-hidden="true"
        focusable="false"
      >
        <path class="sidebar-spider__thread" d="M12 0v7" />
        <g class="sidebar-spider__legs">
          <path d="M9 11 4 7M9 12 3 9M9 14 2 14M10 16 4 20" />
          <path d="M15 11l5-4M15 12l6-3M15 14l7 0M14 16l6 4" />
        </g>
        <ellipse class="sidebar-spider__body" cx="12" cy="14" rx="4" ry="5" />
        <circle class="sidebar-spider__eye" cx="10.5" cy="12.5" r="0.8" />
        <circle class="sidebar-spider__eye" cx="13.5" cy="12.5" r="0.8" />
      </svg>
    </a>
  </div>
</template>

<style scoped>
.website-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.website-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
}

.website-status-star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  font-size: 10px;
  line-height: 1;
}

.website-status-row:last-child {
  margin-bottom: 0;
}

.website-status-label {
  white-space: nowrap;
}

.sidebar-status-divider {
  margin: 0.65rem 0 0.6rem;
  border-top: 1px solid var(--vp-c-divider);
}

.sidebar-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}

.sidebar-total strong {
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.sidebar-credit {
  margin-top: 0.5rem;
  color: var(--vp-c-text-3);
  font-size: 0.65rem;
  line-height: 1.2;
  text-align: center;
}

.sidebar-credit a {
  color: inherit;
}

.sidebar-spider {
  position: relative;
  display: block;
  width: 24px;
  height: 30px;
  margin: 0.3rem auto 0;
  color: #21152d;
  line-height: 0;
  text-decoration: none;
  transform-origin: top center;
}

.sidebar-spider::after {
  position: absolute;
  bottom: -1.35rem;
  left: 50%;
  z-index: 1;
  padding: 0.2rem 0.35rem;
  color: var(--vp-c-bg);
  background: var(--vp-c-text-1);
  content: attr(data-tooltip);
  font-size: 0.65rem;
  line-height: 1.2;
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%);
  transition: opacity 0.2s ease;
  white-space: nowrap;
}

.sidebar-spider:hover,
.sidebar-spider:focus-visible {
  animation: sidebar-spider-sway 1.8s ease-in-out infinite;
}

.sidebar-spider:hover::after,
.sidebar-spider:focus-visible::after {
  opacity: 1;
}

.sidebar-spider__art {
  overflow: visible;
}

.sidebar-spider__thread,
.sidebar-spider__legs path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1;
}

.sidebar-spider__body {
  fill: currentColor;
}

.sidebar-spider__eye {
  fill: #f7d7ff;
}

@keyframes sidebar-spider-sway {
  0%,
  100% {
    transform: rotate(-3deg);
  }

  50% {
    transform: rotate(3deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-spider {
    animation: none !important;
    transition: none;
  }
}
</style>
