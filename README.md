# BlogR

BlogR is a curated directory for discovering smaller, independent blogs and personal websites. It focuses on niche interests, distinctive personal writing, independent creators, and other human-written corners of the web.

Visit the directory at [blogr.directory](https://blogr.directory).

## Features

- Browse blogs by category and subcategory.
- Search blog names, descriptions, links, and directory content.
- See recent additions on the [Recently Added](https://blogr.directory/recently-added) page.
- View website health indicators based on the automated link audit.
- Subscribe to the generated [RSS feed](https://blogr.directory/feed.rss).

## Submitting a blog

Before submitting, search the directory to check whether the site is already listed. You can submit a suggestion in either of these ways:

- Use the [GitHub Issue Form](https://github.com/WesTIChU/BlogR/issues/new?template=submit-blog.yml).
- Email [add@blogr.directory](mailto:add@blogr.directory) with the blog name, URL, and a short description.

AI-built websites are welcome, but the blog content must be written by humans. BlogR is not focused on large commercial publishers, paywalled blogs, sales-focused websites, promotional sites with little original content, or content farms and AI-generated articles. Submissions are reviewed manually and inclusion is not guaranteed.

## Approval workflow

GitHub submissions begin as issues. After review, an approved issue is processed by GitHub Actions, which validates the submission and opens a pull request. When that pull request is merged, automation completes the submission by closing the original issue and running the relevant health checks.

## Technology

- [VitePress](https://vitepress.dev/) powers the documentation site and static build.
- [Vue](https://vuejs.org/) components provide the custom directory interface.
- [GitHub Actions](https://github.com/WesTIChU/BlogR/actions) runs submission processing, blog update scans, and scheduled health audits.
- The production site is hosted through Cloudflare Pages. The VitePress configuration supports its `CF_PAGES` build environment.
- [pnpm](https://pnpm.io/) manages the project dependencies.

## Local development

Requirements: Node.js `22.13.0` or a compatible newer Node.js release, and pnpm `10.12.2`.

```bash
pnpm install --frozen-lockfile
pnpm docs:dev
```

The development server runs on port `5177`.

To build and preview the production site:

```bash
pnpm docs:build
pnpm docs:preview
```

Useful checks and maintenance commands include:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
pnpm test:directory-search
pnpm test:recently-added
pnpm test:blog-health
pnpm test:blog-submissions
pnpm test:blog-updates
pnpm test:seo
pnpm test:submission-form
pnpm audit:blogs
pnpm check:blog-updates
```

## Repository structure

- `data/blogs.json` — authoritative blog catalogue data.
- `data/blog-taxonomy.json` — categories and subcategories used by the directory and submission form.
- `docs/` — VitePress content, theme, components, public assets, and generated directory pages.
- `docs/.vitepress/` — VitePress configuration, search, themes, build hooks, and tests.
- `scripts/` — page generation, submission processing, health auditing, update scanning, and regression checks.
- `shared/` — reusable blog health, link, URL, IP, and Recently Added logic.
- `.github/ISSUE_TEMPLATE/` — the blog submission form.
- `.github/workflows/` — submission, health, and blog update automation.

## Maintenance

Blog entries are maintained in `data/blogs.json`. The page generator uses that data to produce the directory and category pages. The taxonomy file also feeds the submission form, and the form is checked for consistency during validation.

Scheduled GitHub Actions scan blog feeds for publication updates and audit catalogue URLs for availability. Public health results are written to `docs/public/health-status.json`; longer-term audit history is kept separately by the health workflow. Submission automation validates approved issues before creating pull requests, so catalogue changes remain reviewable.

## Licence

BlogR is licensed under the [Apache License 2.0](LICENSE). Third-party attribution and licence information is available in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
