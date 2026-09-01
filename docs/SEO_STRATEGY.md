# SEO Strategy — JDpdf

## URL structure

```
/en, /ar, /tr                     — homepage per locale
/{locale}/{tool-slug}              — tool landing page, e.g. /en/merge-pdf
/{locale}/blog                     — content hub
/{locale}/blog/{article-slug}      — article
/{locale}/pricing
/{locale}/about
/{locale}/contact
```

Tool slugs are stable, human-readable, and localized only in display copy,
not in the URL segment for the MVP (keeps sitemap/canonical logic simple and
avoids slug-collision/translation-drift risk). Revisit fully localized
slugs later if there's clear search-intent evidence it matters per locale —
record that decision in `docs/DECISIONS.md` if/when it happens.

## Per-tool-page requirements (blueprint §26)

Every tool page includes, not just an upload box:

- Unique SEO title + meta description per locale (not a template with the
  tool name swapped into an otherwise identical sentence)
- One `<h1>` matching the page intent
- The tool UI itself
- "What this tool does" explanation
- "How to use it" steps
- Supported file types/limits
- A short privacy statement near the upload area (blueprint §44)
- FAQ section (also emitted as `FAQPage` structured data when the Q&A is
  genuine, not stuffed for schema's sake)
- Related tools (internal linking — see below)
- `SoftwareApplication` or `WebApplication` structured data for the tool

## Structured data

- `Organization` on the homepage
- `BreadcrumbList` on tool/blog pages
- `FAQPage` where a real FAQ exists
- `Article` on blog posts
- Avoid schema for content that isn't actually visible on the page —
  no hidden markup purely to game rich results.

## hreflang / canonical

Handled centrally by `lib/seo/metadata.ts` (see `docs/I18N.md`) so every
page gets consistent `canonical` + `alternates.languages` for `ar`/`en`/`tr`
+ `x-default`. No page should hand-roll its own metadata block from
scratch.

## Sitemap & robots

- `app/sitemap.ts` generates a single sitemap index covering all locales ×
  static routes + published tool pages + published blog articles, pulling
  from the `Tool` and `Article` tables so a new CMS-published page is
  included automatically without a code change.
- `app/robots.ts` allows crawling of all public routes, disallows
  `/admin`, `/api`, and account-only routes, and points at the sitemap.

## Content architecture (blueprint §29)

Three clusters, built incrementally after the tool pages themselves work:

1. **Tool pages** — the highest-intent, highest-priority pages (P0).
2. **Education articles** — "How to merge PDF files," "How to reduce PDF
   size," etc. Each links back to the relevant tool and vice versa. P1/P2 —
   do not let content production distract from shipping tools.
3. **Use-case pages** — students/lawyers/business/freelancers. P2, and only
   worth doing with real, specific copy per audience — not a templated
   mad-lib across audiences.

Quality bar: do not publish a page whose entire content is boilerplate with
the tool name substituted in. If a page can't say something specific and
true, it doesn't get published yet.

## Core Web Vitals / technical SEO

- Server Components by default; minimize client JS on tool landing pages
  (interactive upload widget is the main client boundary).
- `next/image` for any marketing/blog imagery; `next/font` for Inter/Cairo
  to avoid layout shift and extra font-loading round trips.
- Semantic HTML and correct heading order enforced by component structure
  (`ToolHero` renders the `h1`, sections below use `h2`/`h3` — no page
  hand-picks heading levels ad hoc).

## Google Search Console

Verification via a DNS TXT record or HTML file (whichever is simpler at
deploy time) is a deployment-time task, not a code dependency. If/when
Search Console API integration is built for the CMS's SEO dashboard, it
uses OAuth/service-account credentials from environment variables — never
hardcoded — per blueprint §30.

## What we deliberately do not do

- No programmatic mass-generated location/keyword pages.
- No fabricated review counts, trust badges, or countdown timers anywhere
  near tool pages (blueprint §76–77).
- No metadata that overstates what the tool does.
