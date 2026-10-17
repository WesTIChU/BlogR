<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import taxonomy from '../../../../data/blog-taxonomy.json'
import {
  COUNTRIES,
  COUNTRY_GROUPS,
  countryOption
} from '../../../../shared/countries.js'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
    }
  }
}

const form = ref({
  name: '',
  url: '',
  description: '',
  category: '',
  subcategory: '',
  country: '',
  countryPlace: ''
})
const busy = ref(false)
const error = ref('')
const success = ref('')
const duplicateStatus = ref<
  'idle' | 'checking' | 'listed' | 'pending' | 'available' | 'unavailable'
>('idle')
const duplicateName = ref('')
const duplicateCache = new Map<
  string,
  { status: typeof duplicateStatus.value; name?: string }
>()
let duplicateTimer: ReturnType<typeof setTimeout> | undefined
let duplicateRequest = 0
const turnstileElement = ref<HTMLElement | null>(null)
const turnstileId = ref<string>()
const turnstileToken = ref('')
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const checkDuplicate = async () => {
  const value = form.value.url.trim()
  const requestId = ++duplicateRequest
  if (!value) {
    duplicateStatus.value = 'idle'
    return
  }
  let parsed: URL
  try {
    parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
  } catch {
    duplicateStatus.value = 'idle'
    return
  }
  parsed.hash = ''
  parsed.hostname = parsed.hostname.toLowerCase()
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  )
    parsed.port = ''
  const canonical = parsed.toString()
  const cached = duplicateCache.get(canonical)
  if (cached) {
    duplicateStatus.value = cached.status
    duplicateName.value = cached.name ?? ''
    return
  }
  duplicateStatus.value = 'checking'
  try {
    const response = await fetch(
      `/api/check-blog?url=${encodeURIComponent(value)}`
    )
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error()
    if (requestId !== duplicateRequest) return
    duplicateStatus.value = result.status
    duplicateName.value = result.name ?? ''
    duplicateCache.set(canonical, { status: result.status, name: result.name })
  } catch {
    if (requestId === duplicateRequest) duplicateStatus.value = 'unavailable'
  }
}

const scheduleDuplicateCheck = () => {
  if (duplicateTimer) clearTimeout(duplicateTimer)
  duplicateStatus.value = 'idle'
  duplicateName.value = ''
  duplicateTimer = setTimeout(checkDuplicate, 500)
}

watch(() => form.value.url, scheduleDuplicateCheck)

const categories = computed(() =>
  [...taxonomy.categories].sort((a, b) => a.title.localeCompare(b.title))
)
const subcategories = computed(() => {
  const selected = categories.value.find(
    ({ title }) => title === form.value.category
  )
  return selected
    ? [...(selected.subsections ?? [])].sort((a, b) =>
        a.title.localeCompare(b.title)
      )
    : []
})

const submissionCountryOption = (country: (typeof COUNTRIES)[number]) =>
  country.code === 'GB-SCT' ? 'Scotland [GB-SCO]' : countryOption(country)

const countryOptions = computed(() => {
  const grouped = new Set(COUNTRY_GROUPS.flat())
  const remaining = COUNTRIES.filter(({ code }) => !grouped.has(code))
  const groups = COUNTRY_GROUPS.map((codes) => ({
    index: COUNTRIES.slice(
      0,
      COUNTRIES.findIndex(({ code }) => code === codes[0])
    ).filter(({ code }) => !grouped.has(code)).length,
    countries: codes.map((code) =>
      COUNTRIES.find((country) => country.code === code)!
    )
  })).sort((a, b) => a.index - b.index)
  let offset = 0
  for (const group of groups) {
    remaining.splice(group.index + offset, 0, ...group.countries)
    offset += group.countries.length
  }
  return remaining.map((country) => ({
    value: country.code,
    label: submissionCountryOption(country)
  }))
})

const loadTurnstile = () => {
  if (!siteKey || !turnstileElement.value || !window.turnstile) return
  turnstileId.value = window.turnstile.render(turnstileElement.value, {
    sitekey: siteKey,
    callback: (token: string) => {
      turnstileToken.value = token
    },
    'expired-callback': () => {
      turnstileToken.value = ''
    },
    'error-callback': () => {
      turnstileToken.value = ''
    }
  })
}

onMounted(() => {
  if (!siteKey) return
  if (window.turnstile) {
    loadTurnstile()
    return
  }
  const script = document.createElement('script')
  script.src =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
  script.async = true
  script.defer = true
  script.addEventListener('load', loadTurnstile)
  document.head.appendChild(script)
})

onBeforeUnmount(() => {
  if (duplicateTimer) clearTimeout(duplicateTimer)
  duplicateRequest++
  if (turnstileId.value) window.turnstile?.reset(turnstileId.value)
})

const submit = async () => {
  if (busy.value) return
  error.value = ''
  success.value = ''
  if (duplicateStatus.value !== 'available') {
    error.value =
      duplicateStatus.value === 'listed'
        ? 'This blog is already listed in BlogR Directory.'
        : duplicateStatus.value === 'pending'
          ? 'This blog has already been submitted and is awaiting review.'
          : 'We could not confirm that this URL is available. Please try again.'
    return
  }
  if (!siteKey || !turnstileId.value) {
    error.value =
      'The submission form is not configured yet. Please try again later.'
    return
  }
  busy.value = true
  try {
    const response = await fetch('/api/submit-blog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form.value,
        turnstileToken: turnstileToken.value
      })
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok)
      throw new Error(result.error || 'Unable to submit the blog right now.')
    success.value =
      'Thanks for submitting your blog! Your submission has been received and is awaiting review.'
    if (result.issueUrl)
      success.value += ` You can view the submission issue here: ${result.issueUrl}`
    form.value = {
      name: '',
      url: '',
      description: '',
      category: '',
      subcategory: '',
      country: '',
      countryPlace: ''
    }
  } catch (submissionError) {
    error.value =
      submissionError instanceof Error
        ? submissionError.message
        : 'Unable to submit the blog right now.'
  } finally {
    busy.value = false
    if (turnstileId.value) window.turnstile?.reset(turnstileId.value)
    turnstileToken.value = ''
  }
}

const categoryChanged = () => {
  form.value.subcategory = ''
}

const countryChanged = () => {
  if (form.value.country !== 'other') form.value.countryPlace = ''
}
</script>

<template>
  <form class="blog-submission-form" @submit.prevent="submit">
    <p class="blog-submission-help">
      No GitHub account is needed. Every submission is reviewed manually.
    </p>
    <div class="blog-submission-field">
      <label for="submission-name">
        Blog name
        <span aria-hidden="true">*</span>
      </label>
      <input
        id="submission-name"
        v-model="form.name"
        name="name"
        required
        maxlength="120"
        autocomplete="organization"
      />
    </div>
    <div class="blog-submission-field">
      <label for="submission-url">
        Blog URL
        <span aria-hidden="true">*</span>
      </label>
      <input
        id="submission-url"
        v-model="form.url"
        name="url"
        type="url"
        required
        maxlength="2048"
        placeholder="https://example.com/"
        inputmode="url"
        @blur="checkDuplicate"
      />
      <p
        v-if="duplicateStatus !== 'idle'"
        class="blog-submission-duplicate"
        :class="{
          'blog-submission-error':
            duplicateStatus === 'listed' ||
            duplicateStatus === 'pending' ||
            duplicateStatus === 'unavailable'
        }"
        role="status"
      >
        <template v-if="duplicateStatus === 'checking'">
          Checking BlogR for duplicates...
        </template>
        <template v-else-if="duplicateStatus === 'listed'">
          This blog is already listed in BlogR!
          <span v-if="duplicateName">({{ duplicateName }})</span>
        </template>
        <template v-else-if="duplicateStatus === 'pending'">
          This blog has already been submitted and is awaiting review.
        </template>
        <template v-else-if="duplicateStatus === 'available'">
          This blog isn't listed yet. You can continue!
        </template>
        <template v-else>
          We couldn't check this URL right now. Please try again.
        </template>
      </p>
    </div>
    <div class="blog-submission-field">
      <label for="submission-description">
        Description
        <span aria-hidden="true">*</span>
      </label>
      <textarea
        id="submission-description"
        v-model="form.description"
        name="description"
        required
        maxlength="500"
        rows="4"
      />
      <small>Up to 500 characters.</small>
    </div>
    <div class="blog-submission-field">
      <label for="submission-category">
        Main category
        <span aria-hidden="true">*</span>
      </label>
      <select
        id="submission-category"
        v-model="form.category"
        required
        @change="categoryChanged"
      >
        <option value="" disabled>Choose a category</option>
        <option
          v-for="category in categories"
          :key="category.slug"
          :value="category.title"
        >
          {{ category.title }}
        </option>
      </select>
    </div>
    <div class="blog-submission-field">
      <label for="submission-subcategory">Subcategory</label>
      <select
        id="submission-subcategory"
        v-model="form.subcategory"
        :disabled="!form.category"
      >
        <option value="">Not sure / Other</option>
        <option
          v-for="subcategory in subcategories"
          :key="subcategory.title"
          :value="subcategory.title"
        >
          {{ subcategory.title }}
        </option>
      </select>
    </div>
    <div class="blog-submission-field">
      <label for="submission-country">Country / Location</label>
      <select
        id="submission-country"
        v-model="form.country"
        @change="countryChanged"
      >
        <option value="">Not specified</option>
        <option
          v-for="country in countryOptions"
          :key="country.value"
          :value="country.value"
        >
          {{ country.label }}
        </option>
        <option value="other">Other / Not listed</option>
      </select>
    </div>
    <div v-if="form.country === 'other'" class="blog-submission-field">
      <label for="submission-country-place">Country or place not listed?</label>
      <input
        id="submission-country-place"
        v-model="form.countryPlace"
        name="countryPlace"
        maxlength="120"
      />
    </div>
    <div
      ref="turnstileElement"
      class="blog-submission-turnstile"
      aria-label="Spam protection"
    />
    <p v-if="!siteKey" class="blog-submission-config">
      The submission form is awaiting its spam-protection configuration.
    </p>
    <p
      v-if="error"
      class="blog-submission-message blog-submission-error"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-if="success"
      class="blog-submission-message blog-submission-success"
      role="status"
    >
      {{ success }}
    </p>
    <button
      class="blog-submission-button"
      type="submit"
      :disabled="
        busy ||
        !!success ||
        duplicateStatus === 'listed' ||
        duplicateStatus === 'pending' ||
        duplicateStatus === 'checking' ||
        duplicateStatus === 'unavailable'
      "
    >
      {{ busy ? 'Submitting…' : 'Submit blog' }}
    </button>
  </form>
</template>

<style scoped>
.blog-submission-form {
  margin: 1.5rem 0 2rem;
  max-width: 42rem;
}
.blog-submission-help,
.blog-submission-config,
.blog-submission-message,
.blog-submission-field small {
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
}
.blog-submission-field {
  margin: 1.15rem 0;
}
.blog-submission-field label {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 600;
}
.blog-submission-field label span {
  color: var(--vp-c-danger-1);
}
.blog-submission-field input,
.blog-submission-field textarea,
.blog-submission-field select {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 2px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  padding: 0.65rem 0.75rem;
}
.blog-submission-field textarea {
  resize: vertical;
}
.blog-submission-field input:focus,
.blog-submission-field textarea:focus,
.blog-submission-field select:focus {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}
.blog-submission-turnstile {
  min-height: 65px;
  margin: 1.25rem 0;
}
.blog-submission-message {
  margin: 1rem 0;
}
.blog-submission-duplicate {
  margin: 0.5rem 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
}
.blog-submission-error {
  color: var(--vp-c-danger-1);
}
.blog-submission-success {
  color: var(--vp-c-green-1, var(--vp-c-brand-1));
}
.blog-submission-button {
  border: 1px solid var(--vp-button-brand-border);
  border-radius: 2px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  padding: 0.65rem 1rem;
}
.blog-submission-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
</style>
