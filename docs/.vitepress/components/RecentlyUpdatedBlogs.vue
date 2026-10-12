<script setup>
import { contentUpdatedCallbacks } from 'vitepress/dist/client/app/utils'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import blogs from '../../../data/blogs.json'
import { getLondonDateKey } from '../../../shared/recently-added.js'
import {
  formatLondonHeadingDate,
  getTodayUpdatedCategoryGroups
} from '../../../shared/recently-updated.js'
import {
  blogUpdates,
  blogUpdatesError,
  blogUpdatesLoaded,
  loadBlogUpdates
} from './blog-update-client.js'
import BlogHealthLink from './BlogHealthLink.vue'
import BlogLastUpdated from './BlogLastUpdated.vue'

const currentTime = ref(new Date())
let rolloverTimer

const groups = computed(() =>
  getTodayUpdatedCategoryGroups(blogs, blogUpdates.value, currentTime.value)
)

const refreshNativeOutline = () => {
  if (typeof window === 'undefined') return
  void nextTick(() => {
    contentUpdatedCallbacks.forEach((callback) => callback())
  })
}

const scheduleLondonMidnight = () => {
  if (typeof window === 'undefined') return
  const now = new Date()
  const today = getLondonDateKey(now)
  let next = new Date(now.getTime() + 60 * 60 * 1000)
  while (getLondonDateKey(next) === today)
    next = new Date(next.getTime() + 60 * 60 * 1000)
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

watch(groups, refreshNativeOutline, { flush: 'post' })

onMounted(() => {
  void loadBlogUpdates()
  refreshNativeOutline()
  scheduleLondonMidnight()
})
onUnmounted(() => {
  if (rolloverTimer !== undefined) window.clearTimeout(rolloverTimer)
})
</script>

<template>
  <template v-if="groups.length">
    <p class="recently-updated-date-heading">
      Today — {{ formatLondonHeadingDate(currentTime) }}
    </p>
    <section
      v-for="group in groups"
      :key="group.key"
      class="recently-updated-group"
    >
      <h2 :id="group.key">{{ group.title }}</h2>
      <ul>
        <li v-for="entry in group.blogs" :key="entry.blog.url">
          <span class="blog-entry recently-updated-blog">
            <BlogHealthLink
              :name="entry.blog.name"
              :url="entry.blog.url"
              :favourite="entry.blog.favourite"
            />
          </span>
          <template v-if="entry.article?.title">
            <a
              v-if="entry.article.url"
              class="recently-updated-article"
              :href="entry.article.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ entry.article.title }}
            </a>
            <span v-else class="recently-updated-article">
              {{ entry.article.title }}
            </span>
          </template>
          <p v-if="entry.article?.summary" class="recently-updated-summary">
            {{ entry.article.summary }}
          </p>
          <BlogLastUpdated
            :url="entry.blog.url"
            :publication-at="
              entry.article?.publishedAt ?? entry.publication.date
            "
          />
        </li>
      </ul>
    </section>
  </template>
  <p v-else-if="!blogUpdatesLoaded">Loading recent updates…</p>
  <p v-else-if="blogUpdatesError">
    Recent updates are temporarily unavailable. Please try again later.
  </p>
  <p v-else>No blog updates detected today. Check back later.</p>
</template>

<style scoped>
.recently-updated-group + .recently-updated-group {
  margin-top: 2rem;
}

.recently-updated-group h2 {
  margin-bottom: 1rem;
}

.recently-updated-blog {
  display: inline;
}

.recently-updated-article,
.recently-updated-summary {
  display: block;
  margin-top: 0.15rem;
}

.recently-updated-article {
  font-weight: 500;
}

.recently-updated-summary {
  margin-bottom: 0;
  color: var(--vp-c-text-2);
}
</style>
