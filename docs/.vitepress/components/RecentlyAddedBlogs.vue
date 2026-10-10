<script setup>
import { contentUpdatedCallbacks } from 'vitepress/dist/client/app/utils'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import blogs from '../../../data/blogs.json'
import {
  getLondonDateKey,
  getRecentlyAddedGroups
} from '../../../shared/recently-added.js'
import BlogHealthLink from './BlogHealthLink.vue'
import BlogLastUpdated from './BlogLastUpdated.vue'

const currentTime = ref(new Date())
let rolloverTimer

const groups = computed(() => getRecentlyAddedGroups(blogs, currentTime.value))

// VitePress's native outline scans the page when the Markdown content mounts.
// These headings are rendered by this nested Vue component afterwards, so ask
// the same native outline callbacks to rescan after this component updates.
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

watch(groups, refreshNativeOutline, { flush: 'post' })

onMounted(() => {
  refreshNativeOutline()
  scheduleLondonMidnight()
})
onUnmounted(() => {
  if (rolloverTimer !== undefined) window.clearTimeout(rolloverTimer)
})
</script>

<template>
  <template v-if="groups.length">
    <section
      v-for="group in groups"
      :key="group.key"
      class="recently-added-group"
    >
      <h2 :id="group.key">{{ group.title }}</h2>
      <ul>
        <li v-for="blog in group.blogs" :key="blog.url">
          <BlogHealthLink
            :name="blog.name"
            :url="blog.url"
            :favourite="blog.favourite"
          />
          - {{ blog.description }}
          <BlogLastUpdated :url="blog.url" :added-date="blog.addedDate" />
        </li>
      </ul>
    </section>
  </template>
  <p v-else>No blogs have been added yet.</p>
</template>

<style scoped>
.recently-added-group + .recently-added-group {
  margin-top: 2rem;
}

.recently-added-group h2 {
  margin-bottom: 1rem;
}
</style>
