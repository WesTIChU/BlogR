# Direct submission setup

The direct form on `/submit-a-blog` uses the existing GitHub approval workflow: the Pages Function creates an issue with the `blog-submission` label, and an administrator still applies `approved` before the normal workflow can create a pull request.

## Cloudflare Pages

Add these values in the Pages project settings. Keep the token and secret server-side; only the Turnstile site key is exposed to the browser.

- `GITHUB_TOKEN` — a fine-grained GitHub token for `WesTIChU/BlogR` with **Issues: Read and write** and **Metadata: Read-only**. Do not grant contents, pull requests, actions, or administration access.
- `GITHUB_REPOSITORY` — `WesTIChU/BlogR`.
- `TURNSTILE_SECRET_KEY` — the Turnstile secret key.
- `VITE_TURNSTILE_SITE_KEY` — the Turnstile site key, set as a build-time Pages environment variable.

Cloudflare WAF rate limiting is configured and active for `POST /api/submit-blog`. It provides the public per-IP request protection before the Pages Function runs. No `SUBMISSION_RATE_LIMIT` Workers binding is required; the WAF rule is the deployed rate-limit control.

The Function still performs mandatory server-side Turnstile verification, request-size checks, URL and taxonomy validation, country validation, duplicate checks, markup protection, and GitHub API error handling. WAF protection does not replace any of those checks.

The Turnstile site must allow the production hostname and the local preview hostname used for testing. Configure the secrets separately for Preview and Production if both environments are used. Test the deployed function after saving the values; a local static VitePress preview cannot create GitHub issues without the Pages Function and secrets.
