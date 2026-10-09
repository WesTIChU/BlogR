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
    <span v-if="favourite" class="blog-favourite" aria-label="Favourite">
      ⭐
    </span>
    <a v-bind="linkAttributes" :href="url">{{ name }}</a>
  </strong>
</template>

<style scoped>
.blog-health-link {
  display: inline;
}

.blog-favourite {
  margin-right: 0.25em;
}
</style>
