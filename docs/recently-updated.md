---
title: Recently Updated
description: Discover the latest updates from independent blogs in the BlogR directory.
---

<script setup>
import RecentlyAddedStats from './.vitepress/components/RecentlyAddedStats.vue'
import { RECENTLY_UPDATED_STATS_CONFIG } from './.vitepress/components/recently-added-stats.config.js'
import RecentlyUpdatedBlogs from './.vitepress/components/RecentlyUpdatedBlogs.vue'
</script>

# ► Recently Updated

Discover the latest updates from independent blogs in the BlogR directory.

<hr class="blogr-intro-divider" aria-hidden="true" />

<RecentlyAddedStats
  mode="recently-updated"
  :config="RECENTLY_UPDATED_STATS_CONFIG"
/>

<RecentlyUpdatedBlogs />
