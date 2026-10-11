<script setup>
defineProps({
  flag: { type: String, required: true },
  name: { type: String, required: true },
  count: { type: Number, required: true }
})
</script>

<template>
  <h1>{{ flag }} {{ name }}</h1>
  <p>
    {{ count }} {{ count === 1 ? 'blog' : 'blogs' }} listed in {{ name }}.
    Country information is still being added, so some blogs may not appear here
    yet.
  </p>
  <hr class="blogr-intro-divider" aria-hidden="true" />
</template>
