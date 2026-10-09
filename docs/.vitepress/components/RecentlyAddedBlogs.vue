<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import blogs from '../../../data/blogs.json'
import { getRecentlyAddedBlogs } from '../../../shared/recently-added.js'
import BlogHealthLink from './BlogHealthLink.vue'
import BlogLastUpdated from './BlogLastUpdated.vue'

const currentTime = ref(new Date())
let rolloverTimer

const entries = computed(() => getRecentlyAddedBlogs(blogs, currentTime.value))

const scheduleUtcMidnight = () => {
  if (typeof window === 'undefined') return
  const now = new Date()
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  )
  rolloverTimer = window.setTimeout(
    () => {
      currentTime.value = new Date()
      scheduleUtcMidnight()
    },
    Math.max(1, next.getTime() - now.getTime())
  )
}

onMounted(scheduleUtcMidnight)
onUnmounted(() => {
  if (rolloverTimer !== undefined) window.clearTimeout(rolloverTimer)
})
</script>

<template>
  <ul v-if="entries.length">
    <li v-for="blog in entries" :key="blog.url">
      <BlogHealthLink
        :name="blog.name"
        :url="blog.url"
        :favourite="blog.favourite"
      />
      - {{ blog.description }}
      <BlogLastUpdated :url="blog.url" />
    </li>
  </ul>
  <p v-else>No blogs have been added in the last 30 days.</p>
</template>
