<script setup lang="ts">
import { onMounted } from 'vue'
import {
  loadBlogDetailsPreference,
  saveBlogDetailsPreference,
  showBlogDetails
} from '../../components/blog-stats-visibility.js'

onMounted(loadBlogDetailsPreference)

function updatePreference(event: Event) {
  saveBlogDetailsPreference((event.target as HTMLInputElement).checked)
}
</script>

<template>
  <label class="blog-stats-toggle">
    <span>Show blog details</span>
    <input
      type="checkbox"
      :checked="showBlogDetails"
      aria-label="Show blog details"
      @change="updatePreference"
    />
    <span class="blog-stats-switch" aria-hidden="true"></span>
  </label>
</template>

<style scoped>
.blog-stats-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 0.75rem;
}

.blog-stats-toggle input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.blog-stats-switch {
  position: relative;
  display: inline-block;
  width: 2rem;
  height: 1.125rem;
  flex: 0 0 2rem;
  border-radius: 999px;
  background: var(--vp-c-default-soft);
  transition: background 0.2s ease;
}

.blog-stats-switch::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 0.8125rem;
  height: 0.8125rem;
  border-radius: 50%;
  background: var(--vp-c-bg);
  content: '';
  transition: transform 0.2s ease;
}

.blog-stats-toggle input:checked + .blog-stats-switch {
  background: var(--vp-c-brand-1);
}

.blog-stats-toggle input:checked + .blog-stats-switch::after {
  transform: translateX(0.875rem);
}

.blog-stats-toggle input:focus-visible + .blog-stats-switch {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
</style>
