<script setup>
import { onMounted, ref } from 'vue'
import { SHOW_WEBRING } from '../../../shared/webring.js'

const members = ref([])
onMounted(async () => {
  if (!SHOW_WEBRING) return
  try {
    const response = await fetch('/api/webring/members')
    if (response.ok) members.value = await response.json()
  } catch {
    members.value = []
  }
})
</script>

<template>
  <p v-if="!SHOW_WEBRING">The BlogR Webring is not currently available.</p>
  <template v-else>
    <p>
      BlogR Webring connects verified independent websites through simple,
      accessible links.
    </p>
    <h2>Install the widget</h2>
    <p>
      Place the three links from your listing's Webring menu on your website's
      home page, blog, links, website or webring page.
    </p>
    <p>
      Only the registered website and the five approved paths are checked. Once
      you've installed the widget, BlogR will automatically check your website.
      Verification may take a little while during busy periods.
    </p>
    <h2>Participation rules</h2>
    <p>
      Keep all three links visible in publicly returned HTML, use the assigned
      membership ID, and link only to the BlogR navigation endpoints.
    </p>
    <h2>Verified members ({{ members.length }})</h2>
    <ul>
      <li v-for="member in members" :key="member.webring_id">
        <a :href="member.canonical_url">
          {{ member.name || member.canonical_url }}
        </a>
      </li>
    </ul>
  </template>
</template>
