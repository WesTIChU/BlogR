const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let turnstilePromise

export function loadTurnstile(windowObject, documentObject) {
  if (windowObject.turnstile) return Promise.resolve(windowObject.turnstile)
  if (turnstilePromise) return turnstilePromise

  turnstilePromise = new Promise((resolve, reject) => {
    const existing = documentObject.querySelector(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`
    )
    const script = existing ?? documentObject.createElement('script')

    const ready = () => {
      if (windowObject.turnstile) resolve(windowObject.turnstile)
      else reject(new Error('Turnstile loaded without exposing its API'))
    }

    script.addEventListener('load', ready, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Unable to load Turnstile')),
      { once: true }
    )
    if (!existing) {
      script.src = TURNSTILE_SCRIPT_SRC
      script.async = true
      script.defer = true
      documentObject.head.appendChild(script)
    }
  })

  return turnstilePromise
}

export const resetTurnstileLoader = () => {
  turnstilePromise = undefined
}
