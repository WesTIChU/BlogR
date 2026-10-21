<script setup>
import { computed } from 'vue'
import { getBlogLinkAttributes } from '../../../shared/blog-link.js'
import { outboundTrackingUrl } from '../../../shared/outbound-click.js'

const props = defineProps({
  name: { type: String, required: true },
  url: { type: String, required: true },
  favourite: { type: Boolean, default: false }
})

const linkAttributes = computed(() => getBlogLinkAttributes(props.url))
const trackedUrl = computed(() => outboundTrackingUrl(props.url))
</script>

<template>
  <strong class="blog-health-link">
    <a v-bind="linkAttributes" :href="trackedUrl" :data-outbound-url="url">
      {{ name }}
    </a>
  </strong>
</template>

<style scoped>
.blog-health-link {
  display: inline;
}
</style>
