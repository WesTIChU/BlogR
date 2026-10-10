# Blog health status publishing

Run `pnpm audit:blogs` on the scheduled daily checker host. The repository's
`.github/workflows/blog-health.yml` runs this at 06:00 UTC and on manual
dispatch. The checker keeps
the full audit reports and history under `reports/`, which are not public, and
also writes `docs/public/health-status.json` containing only normalized blog
URLs, compact statuses, and check timestamps.

The generated VitePress pages load that small JSON file in the browser. This
means a new daily status file can be copied to the static site's public assets
without rebuilding the site. The component uses a cache-busting request and
still treats missing or older-than-72-hour entries as unknown. It never makes
HTTP requests to blog URLs.

When `data/blogs.json` changes on `main`, `.github/workflows/new-blog-metadata.yml`
compares the new catalogue with the previous revision and checks only genuinely
new blogs. It reuses the feed checker and the health audit, publishing changed
metadata in a follow-up commit so the normal Cloudflare Pages deployment picks
up the refreshed data. Metadata writers share a concurrency group with the
scheduled jobs, and metadata-only commits do not trigger the initial-refresh
workflow again.

The workflow stores only the compact status history needed for consecutive
failure tracking on the dedicated `blog-health-history` branch. Full audit
reports remain runner-local and are never committed to the website source
branch. It serializes runs, refuses incomplete output, and commits the public
file only when it changes. The eventual static-site sync should publish that
file atomically so visitors never see a partial JSON document.
