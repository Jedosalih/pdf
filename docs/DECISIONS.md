# Decisions log — JDpdf

Running record of non-obvious choices. Append, don't rewrite history —
if a decision is reversed, add a new entry rather than editing the old one.

## 2026-09-02 — Project kickoff

- Product name: **JDpdf**.
- Scope approach: incremental, MVP-first. Build the foundation (docs,
  scaffold, schema, tool registry, design system) then get **Merge PDF**
  working fully end-to-end (upload → queue → qpdf worker → storage →
  download) in `ar`/`en`/`tr` before adding more tools, auth, or CMS. This
  follows the blueprint's own §87 execution order rather than attempting
  every subsystem in parallel.
- Local dev environment: Docker Desktop is the target for
  Postgres/Redis/MinIO/worker containers. At kickoff, Docker was not yet
  detected on the dev machine (not on PATH, not in the default install
  path, WSL not installed) — Phase 0 work does not depend on it, but it's
  required before Phase 2 (running the worker/queue for real) can be
  verified locally. Revisit/confirm before building `workers/pdf`.
- Deployment target: left undecided per user request. Architecture
  (`docs/ARCHITECTURE.md`) is written to be deployment-agnostic — Next.js
  app and workers are independently deployable, so this doesn't block
  implementation.

## 2026-09-02 — Stack specifics

- **Next.js 15 (App Router) + React 19 + TypeScript strict.**
- **Tailwind CSS v4** chosen over v3: v4's `@theme` CSS-first
  configuration maps directly onto the blueprint's "CSS variables for
  design tokens" requirement (§93, §21) without a separate JS config file
  duplicating the same information.
- **next-intl** for i18n/routing — mature, App-Router-native, handles
  locale-prefixed routing + message namespaces + `getRequestConfig`
  cleanly; avoids hand-rolling locale middleware.
- **Prisma + PostgreSQL** as specified in the blueprint (§8).
- **BullMQ + Redis** for queues (§48) — most established Node queue on
  top of Redis, good retry/backoff primitives out of the box.
- **pdf-lib** added as a small, pure-JS (no native binary, no subprocess)
  dependency for operations that are cheaper/safer to do in-process than
  by shelling out: image→PDF assembly, watermark/page-number drawing, and
  metadata editing. Rationale: these are simple structural edits with no
  untrusted-binary-parsing risk beyond what any PDF library carries, and
  avoiding a subprocess for them reduces worker complexity. Still runs
  inside the isolated worker process, not in a Next.js request handler.
- Everything else in the processing stack (qpdf, Ghostscript, Poppler,
  OCRmyPDF, Tesseract, LibreOffice) matches the blueprint's own
  recommendation — see `docs/PDF_ENGINE.md` for the licensing check on
  each.

## 2026-09-02 — Schema scope for MVP

- Implemented now: `User`, `Session`, `Plan`, `PlanPrice`, `Subscription`,
  `UsageRecord`, `Tool`, `ToolTranslation`, `ToolLimit`, `Job`, `JobEvent`,
  `File`.
- Deferred (present as light placeholders or not yet modeled): `Role`/
  `Permission` as separate tables — using a `Role` enum directly on `User`
  instead until there's an actual need for dynamic permission sets
  (blueprint §346 explicitly says don't over-engineer relationships not
  needed yet). `Coupon`/`CouponRedemption`, `EmailEvent`,
  `ContactSubmission`, `Article`/`ArticleTranslation`/`ArticleCategory`/
  `ArticleTag`, `Page`/`PageTranslation`, `SeoMetadata`, `SiteSetting`/
  `SiteLanguage`, `AuditLog`, `SystemLog` are added to the schema as
  minimal tables (so later phases don't require a disruptive migration
  path) but are not yet read/written by any code.

## Template for future entries

```
## YYYY-MM-DD — <short title>

- Decision:
- Why:
- Alternatives considered:
- Revisit when:
```
