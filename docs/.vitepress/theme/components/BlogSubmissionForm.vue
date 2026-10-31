<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import taxonomy from '../../../../data/blog-taxonomy.json'
import communityTaxonomy from '../../../../data/community-taxonomy.json'
import independentWebTaxonomy from '../../../../data/independent-web-taxonomy.json'
import {
  COUNTRIES,
  COUNTRY_GROUPS,
  countryOption
} from '../../../../shared/countries.js'
import {
  comparableBlogUrl,
  normalizeBlogSubmissionUrl
} from '../../../../shared/new-blog-entries.js'

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId?: string) => void
    }
  }
}

const form = ref({
  type: 'blog',
  name: '',
  url: '',
  description: '',
  category: '',
  categorySuggestion: '',
  subcategory: '',
  suggestedSubcategory: '',
  country: '',
  countryPlace: '',
  communityType: 'Forum'
})
const busy = ref(false)
const error = ref('')
const success = ref('')
const duplicateStatus = ref<
  | 'idle'
  | 'checking'
  | 'listed'
  | 'pending'
  | 'article'
  | 'available'
  | 'unavailable'
  | 'invalid'
>('idle')
const duplicateName = ref('')
const duplicateListingUrl = ref('')
const suggestedUrl = ref('')
const duplicateCache = new Map<
  string,
  {
    status: typeof duplicateStatus.value
    name?: string
    listingUrl?: string
    suggestedUrl?: string
  }
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
    duplicateName.value = ''
    duplicateListingUrl.value = ''
    suggestedUrl.value = ''
    return
  }
  let normalized: string
  try {
    normalized = normalizeBlogSubmissionUrl(value)
  } catch {
    duplicateStatus.value = 'invalid'
    duplicateName.value = ''
    duplicateListingUrl.value = ''
    suggestedUrl.value = ''
    return
  }
  const canonical = `${form.value.type}:${comparableBlogUrl(normalized)}`
  const cached = duplicateCache.get(canonical)
  if (cached) {
    duplicateStatus.value = cached.status
    duplicateName.value = cached.name ?? ''
    duplicateListingUrl.value = cached.listingUrl ?? ''
    suggestedUrl.value = cached.suggestedUrl ?? ''
    return
  }
  duplicateStatus.value = 'checking'
  try {
    const response = await fetch(
      `/api/check-blog?type=${encodeURIComponent(form.value.type)}&url=${encodeURIComponent(normalized)}`
    )
    const result = await response.json().catch(() => ({}))
    if (!response.ok && result.status !== 'article') throw new Error()
    if (requestId !== duplicateRequest) return
    if (!['listed', 'pending', 'article', 'available'].includes(result.status))
      throw new Error()
    duplicateStatus.value = result.status
    duplicateName.value = result.name ?? ''
    duplicateListingUrl.value = result.listingUrl ?? ''
    suggestedUrl.value = result.suggestedUrl ?? ''
    duplicateCache.set(canonical, {
      status: result.status,
      name: result.name,
      listingUrl: result.listingUrl,
      suggestedUrl: result.suggestedUrl
    })
  } catch {
    if (requestId === duplicateRequest) duplicateStatus.value = 'unavailable'
  }
}

const normalizeUrlField = () => {
  if (duplicateTimer) clearTimeout(duplicateTimer)
  try {
    form.value.url = normalizeBlogSubmissionUrl(form.value.url)
    checkDuplicate()
  } catch {
    duplicateStatus.value = 'invalid'
    duplicateName.value = ''
    duplicateListingUrl.value = ''
    suggestedUrl.value = ''
  }
}

const scheduleDuplicateCheck = () => {
  if (duplicateTimer) clearTimeout(duplicateTimer)
  duplicateRequest++
  duplicateStatus.value = 'idle'
  duplicateName.value = ''
  duplicateListingUrl.value = ''
  suggestedUrl.value = ''
  duplicateTimer = setTimeout(checkDuplicate, 500)
}

watch(() => form.value.url, scheduleDuplicateCheck)
watch(
  () => form.value.type,
  () => {
    duplicateRequest++
    duplicateStatus.value = 'idle'
    duplicateName.value = ''
    duplicateListingUrl.value = ''
    suggestedUrl.value = ''
    if (form.value.url) checkDuplicate()
  }
)

const blogCategories = [...taxonomy.categories].sort((a, b) =>
  a.title.localeCompare(b.title)
)
const independentWebCategories = independentWebTaxonomy.map(
  ({ slug, title, subcategories }) => ({
    slug,
    title,
    subsections: subcategories.map((title) => ({ title }))
  })
)
const OTHER_CATEGORY = 'Other / Suggest a new category'
const OTHER_SUBCATEGORY = 'Other / Suggest a new subcategory'
const communityCategories = communityTaxonomy
  .map(({ slug, title }) => ({
    slug,
    title,
    subsections: []
  }))
  .sort((a, b) => a.title.localeCompare(b.title))
const categoryGroups = computed(() =>
  form.value.type === 'community'
    ? [{ label: 'Community Categories', categories: communityCategories }]
    : form.value.type === 'website'
      ? [{ label: 'Independent Web', categories: independentWebCategories }]
      : [{ label: 'Blog Categories', categories: blogCategories }]
)
const categories = computed(() =>
  categoryGroups.value.flatMap(({ categories }) => categories)
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
const subcategoryGroup = computed(() =>
  independentWebCategories.some(({ title }) => title === form.value.category)
    ? 'Independent Web'
    : 'Blog Categories'
)

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
  const noun =
    form.value.type === 'website'
      ? 'website'
      : form.value.type === 'community'
        ? 'community'
        : 'blog'
  if (duplicateStatus.value !== 'available') {
    error.value =
      duplicateStatus.value === 'listed'
        ? `This ${noun} is already listed in BlogR Directory.`
        : duplicateStatus.value === 'pending'
          ? `This ${noun} has already been submitted and is awaiting review.`
          : duplicateStatus.value === 'article'
            ? 'It looks like you submitted an individual article. BlogR lists websites and blogs rather than individual posts. Please use the suggested blog URL below.'
            : duplicateStatus.value === 'invalid'
              ? 'Please enter a valid website address, such as https://example.com.'
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
    if (!response.ok) {
      if (result.code === 'article-url') {
        duplicateStatus.value = 'article'
        suggestedUrl.value = result.suggestedUrl ?? ''
      }
      throw new Error(result.error || 'Unable to submit the blog right now.')
    }
    success.value = `Thanks for submitting your ${noun}! Your submission has been received and is awaiting review.`
    if (result.issueUrl)
      success.value += ` You can view the submission issue here: ${result.issueUrl}`
    form.value = {
      type: form.value.type,
      name: '',
      url: '',
      description: '',
      category: '',
      categorySuggestion: '',
      subcategory: '',
      suggestedSubcategory: '',
      country: '',
      countryPlace: '',
      communityType: 'Forum'
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

const useSuggestedUrl = () => {
  if (!suggestedUrl.value) return
  form.value.url = suggestedUrl.value
  duplicateStatus.value = 'checking'
  checkDuplicate()
}

const categoryChanged = () => {
  form.value.subcategory = ''
  form.value.categorySuggestion = ''
  form.value.suggestedSubcategory = ''
  if (form.value.type === 'community') {
    if (form.value.url) checkDuplicate()
    return
  }
  if (form.value.url) checkDuplicate()
}

const subcategoryChanged = () => {
  if (form.value.subcategory) form.value.suggestedSubcategory = ''
}

const typeChanged = () => {
  form.value.category = ''
  form.value.subcategory = ''
  form.value.country = ''
  form.value.countryPlace = ''
  form.value.communityType = 'Forum'
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
      <label for="submission-type">
        What are you submitting?
        <span aria-hidden="true">*</span>
      </label>
      <select
        id="submission-type"
        v-model="form.type"
        required
        @change="typeChanged"
      >
        <option value="blog">Blog</option>
        <option value="website">Independent Website</option>
        <option value="community">Online Community</option>
      </select>
    </div>
    <div class="blog-submission-field">
      <label for="submission-name">
        {{
          form.type === 'website'
            ? 'Website name'
            : form.type === 'community'
              ? 'Community name'
              : 'Blog name'
        }}
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
        Website URL
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
        @blur="normalizeUrlField"
      />
      <p
        v-if="duplicateStatus !== 'idle'"
        class="blog-submission-duplicate"
        :class="{
          'blog-submission-error':
            duplicateStatus === 'listed' ||
            duplicateStatus === 'pending' ||
            duplicateStatus === 'article' ||
            duplicateStatus === 'unavailable' ||
            duplicateStatus === 'invalid'
        }"
        role="status"
      >
        <template v-if="duplicateStatus === 'checking'">
          Checking BlogR for duplicates...
        </template>
        <template v-else-if="duplicateStatus === 'listed'">
          This {{ form.type }} is already listed in
          {{
            form.type === 'website'
              ? 'the Independent Web directory'
              : form.type === 'community'
                ? 'Online Communities'
                : 'the Blog directory'
          }}.
          <span v-if="duplicateName">({{ duplicateName }})</span>
          <a v-if="duplicateListingUrl" :href="duplicateListingUrl">
            View listing
          </a>
        </template>
        <template v-else-if="duplicateStatus === 'pending'">
          This {{ form.type }} has already been submitted and is awaiting
          review.
        </template>
        <template v-else-if="duplicateStatus === 'article'">
          It looks like you've submitted an individual article. BlogR lists
          websites and blogs rather than individual posts. Did you mean to
          submit this blog instead?
          <button
            v-if="suggestedUrl"
            type="button"
            class="blog-submission-suggested-url"
            @click="useSuggestedUrl"
          >
            Use {{ suggestedUrl }}
          </button>
        </template>
        <template v-else-if="duplicateStatus === 'available'">
          No existing listing found. You can continue with your submission.
        </template>
        <template v-else-if="duplicateStatus === 'invalid'">
          Please enter a valid website address, such as https://example.com.
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
        {{ form.type === 'community' ? 'Community category' : 'Main category' }}
        <span aria-hidden="true">*</span>
      </label>
      <select
        id="submission-category"
        v-model="form.category"
        required
        @change="categoryChanged"
      >
        <option value="" disabled>Choose a category</option>
        <template v-for="(group, index) in categoryGroups" :key="group.label">
          <option v-if="index > 0" disabled aria-hidden="true">
            ────────────────────
          </option>
          <optgroup :label="group.label">
            <option
              v-for="category in group.categories"
              :key="category.slug"
              :value="category.title"
            >
              {{ category.title }}
            </option>
          </optgroup>
        </template>
        <option :value="OTHER_CATEGORY">{{ OTHER_CATEGORY }}</option>
      </select>
    </div>
    <div v-if="form.category === OTHER_CATEGORY" class="blog-submission-field">
      <label for="submission-category-suggestion">Suggested new category</label>
      <input
        id="submission-category-suggestion"
        v-model="form.categorySuggestion"
        name="categorySuggestion"
        maxlength="80"
        placeholder="Optional category suggestion"
      />
      <small>
        This is a suggestion for editorial review, not an official category.
      </small>
    </div>
    <div v-if="form.type === 'community'" class="blog-submission-field">
      <label for="submission-community-type">
        Community type
        <span aria-hidden="true">*</span>
      </label>
      <select
        id="submission-community-type"
        v-model="form.communityType"
        required
      >
        <option>Forum</option>
        <option>Independent Community</option>
      </select>
    </div>
    <div v-if="form.type !== 'community'" class="blog-submission-field">
      <label for="submission-subcategory">Subcategory</label>
      <select
        id="submission-subcategory"
        v-model="form.subcategory"
        :disabled="!form.category"
        @change="subcategoryChanged"
      >
        <option value="">Not sure / Other</option>
        <optgroup v-if="subcategories.length" :label="subcategoryGroup">
          <option
            v-for="subcategory in subcategories"
            :key="subcategory.title"
            :value="subcategory.title"
          >
            {{ subcategory.title }}
          </option>
        </optgroup>
        <option :value="OTHER_SUBCATEGORY">{{ OTHER_SUBCATEGORY }}</option>
      </select>
    </div>
    <div
      v-if="form.type !== 'community' && form.subcategory === OTHER_SUBCATEGORY"
      class="blog-submission-field"
    >
      <label for="submission-suggested-subcategory">
        Suggested new subcategory
      </label>
      <input
        id="submission-suggested-subcategory"
        v-model="form.suggestedSubcategory"
        name="suggestedSubcategory"
        maxlength="80"
        placeholder="Optional subcategory suggestion"
      />
      <small>
        This is a suggestion for editorial review, not an official subcategory.
      </small>
    </div>
    <div v-if="form.type !== 'community'" class="blog-submission-field">
      <label for="submission-country">
        {{ form.type === 'website' ? 'Country' : 'Country / Location' }}
      </label>
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
    <div
      v-if="form.type !== 'community' && form.country === 'other'"
      class="blog-submission-field"
    >
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
        duplicateStatus !== 'available'
      "
    >
      {{
        busy
          ? 'Submitting…'
          : `Submit ${form.type === 'website' ? 'website' : form.type === 'community' ? 'community' : 'blog'}`
      }}
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
