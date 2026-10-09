<script setup>
import { computed } from 'vue'
import { getBlogLinkAttributes } from '../../../shared/blog-link.js'

const props = defineProps({
  name: { type: String, required: true },
  url: { type: String, required: true },
  favourite: { type: Boolean, default: false }
})

const linkAttributes = computed(() => getBlogLinkAttributes(props.url))
</script>

<template>
  <strong class="blog-health-link">
    <a v-bind="linkAttributes" :href="url">{{ name }}</a>
  </strong>
</template>

<style scoped>
.blog-health-link {
  display: inline;
}
</style>
