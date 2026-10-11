<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import updates from '../../../data/blog-updates.json'
import blogs from '../../../data/blogs.json'
import {
  getAllBlogStats,
  getRecentlyAddedStats
} from '../../../shared/recently-added-stats.js'
import { getLondonDateKey } from '../../../shared/recently-added.js'
import { RECENTLY_ADDED_STATS_CONFIG } from './recently-added-stats.config.js'

const props = defineProps({
  config: { type: Object, default: () => RECENTLY_ADDED_STATS_CONFIG },
  mode: { type: String, default: 'recently-added' }
})

const currentTime = ref(new Date())
let rolloverTimer

const statistics = () =>
  props.mode === 'all-blogs'
    ? getAllBlogStats(
        blogs,
        updates,
        currentTime.value,
        props.config.statistics
      )
    : getRecentlyAddedStats(blogs, currentTime.value, props.config.statistics)

const scheduleLondonMidnight = () => {
  if (typeof window === 'undefined') return
  const now = new Date()
  const today = getLondonDateKey(now)
  let next = new Date(now.getTime() + 60 * 60 * 1000)
  while (getLondonDateKey(next) === today) {
    next = new Date(next.getTime() + 60 * 60 * 1000)
  }

  let low = now.getTime()
  let high = next.getTime()
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2)
    if (getLondonDateKey(new Date(middle)) === today) low = middle
    else high = middle
  }

  rolloverTimer = window.setTimeout(
    () => {
      currentTime.value = new Date()
      scheduleLondonMidnight()
    },
    Math.max(1, high - Date.now() + 1000)
  )
}

onMounted(scheduleLondonMidnight)
onUnmounted(() => {
  if (rolloverTimer !== undefined) window.clearTimeout(rolloverTimer)
})
</script>

<template>
  <section
    class="recently-added-stats"
    :aria-label="config.sectionHeading || 'Catalogue statistics'"
  >
    <h2 v-if="config.sectionHeading" class="recently-added-stats-heading">
      {{ config.sectionHeading }}
    </h2>
    <article
      v-for="stat in statistics()"
      :key="stat.key"
      class="recently-added-stat"
    >
      <strong class="recently-added-stat-count">{{ stat.count }}</strong>
      <span class="recently-added-stat-label">{{ stat.label }}</span>
      <span v-if="stat.description" class="recently-added-stat-description">
        {{ stat.description }}
      </span>
    </article>
  </section>
</template>

<style scoped>
.recently-added-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin: 0 0 2.5rem;
}

.recently-added-stats-heading {
  grid-column: 1 / -1;
  margin: 0;
}

.recently-added-stat {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  background: var(--blogr-c-accent-subtle);
}

.recently-added-stat-count {
  color: var(--vp-c-brand-1);
  font-size: 1.75rem;
  line-height: 1;
}

.recently-added-stat-label {
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.recently-added-stat-description {
  color: var(--vp-c-text-2);
  font-size: 0.8rem;
  line-height: 1.4;
}

@media (max-width: 640px) {
  .recently-added-stats {
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-bottom: 2rem;
  }

  .recently-added-stat {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.75rem;
    align-items: baseline;
  }

  .recently-added-stat-description {
    grid-column: 2;
  }
}
</style>
