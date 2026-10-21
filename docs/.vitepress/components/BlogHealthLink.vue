<script setup>
import { computed } from 'vue'
import { getBlogLinkAttributes } from '../../../shared/blog-link.js'
import {
  outboundTrackingUrl,
  SHOW_CLICK_COUNTS
} from '../../../shared/outbound-click.js'

const props = defineProps({
  name: { type: String, required: true },
  url: { type: String, required: true },
  favourite: { type: Boolean, default: false },
  clicks: { type: Number, default: 0 }
})

const linkAttributes = computed(() => getBlogLinkAttributes(props.url))
const trackedUrl = computed(() => outboundTrackingUrl(props.url))
</script>

<template>
  <strong class="blog-health-link">
    <a v-bind="linkAttributes" :href="trackedUrl" :data-outbound-url="url">
      {{ name }}
    </a>
    <span v-if="SHOW_CLICK_COUNTS" class="outbound-click-count">
      {{ clicks.toLocaleString() }} clicks
    </span>
  </strong>
</template>

<style scoped>
.blog-health-link {
  display: inline;
}
</style>
