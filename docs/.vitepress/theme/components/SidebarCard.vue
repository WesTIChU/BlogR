<script setup lang="ts">
import { PUBLIC_STATUS_COLORS } from '../../../../shared/blog-health-status.js'
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
      class="bg-$vp-c-bg hover:bg-$vp-c-bg/40 border-$vp-c-default-soft hover:border-primary transition-border relative z-0 rounded-lg border-2 border-solid p-5 duration-500"
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
</style>
