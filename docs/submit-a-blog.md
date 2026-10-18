---
title: Redirecting to Submit a Site
description: Redirecting to the BlogR submission form.
---

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  window.location.replace(`/submit/${window.location.hash}`)
})
</script>

# Redirecting to Submit a Site

[Continue to the submission form](/submit/)
