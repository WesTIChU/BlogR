<script setup>
import websites from '../../../data/websites.json'
import { INDEPENDENT_WEB_STATS_CONFIG } from './recently-added-stats.config.js'
import RecentlyAddedStats from './RecentlyAddedStats.vue'
</script>

<template>
  <RecentlyAddedStats
    mode="all-blogs"
    :entries="websites"
    :config="INDEPENDENT_WEB_STATS_CONFIG"
  />
</template>
