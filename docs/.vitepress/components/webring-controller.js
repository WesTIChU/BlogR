export const WEBRING_TRIGGER_SELECTOR = '[data-webring-trigger]'

export const getWebringTriggerData = (element) => ({
  id: element.getAttribute('data-webring-id') || '',
  url: element.getAttribute('data-webring-url') || '',
  name: element.getAttribute('data-webring-name') || ''
})

export const getWebringStatusUrl = (id) =>
  `/api/webring/status?id=${encodeURIComponent(id)}`
