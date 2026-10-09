---
title: Submit a Blog
description: Suggest an independent blog or personal website for the directory.
---

<script setup>
const githubIssueUrl =
  'https://github.com/WesTIChU/BlogR/issues/new?template=submit-blog.yml'
const submissionEmail = (import.meta.env.VITE_SUBMISSION_EMAIL || '').trim()
const emailUrl = submissionEmail
  ? `mailto:${submissionEmail}?subject=${encodeURIComponent('Blog submission')}&body=${encodeURIComponent('Blog name:\nBlog URL:\nShort description:\nSuggested category:\nAdditional notes:\n')}`
  : ''
</script>

# ► Submit a Blog

Know an independent blog or personal website that belongs in the directory? Send it over for consideration.

Good fits include personal blogs, niche websites, independent creators, small projects with real thought behind them, and communities that feel alive.

Please include the website URL, its name, a short description, and the category that best fits it. Every submission is reviewed manually and nothing is published automatically.

<hr class="blogr-intro-divider" aria-hidden="true" />

## Submit via GitHub

<a :href="githubIssueUrl">Open the GitHub Issue Form</a>

You’ll need a GitHub account. The form asks for the blog name and URL, with optional description, category, and notes fields.

<div v-if="emailUrl">

## Submit via Email

<a :href="emailUrl">Open a pre-filled email</a>

</div>

<p v-else class="submission-email-not-configured">
Email submissions are not currently configured. A maintainer can set
<code>VITE_SUBMISSION_EMAIL</code> in the site build environment to enable this option.
</p>
