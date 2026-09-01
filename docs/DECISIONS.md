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

## 2026-09-02 — Known dev-tooling advisory (accepted, monitor)

`npm audit` flags 4 high-severity advisories (lodash prototype pollution,
deepmerge-ts stack exhaustion, mysql2 auth downgrade) that all trace back
to the **Prisma CLI's** own dependency tree (`prisma` devDependency, via
`@prisma/config` and its bundled MySQL connector) — not to `@prisma/client`,
which is the only Prisma package that actually runs in production. We use
Postgres, so the vulnerable MySQL connector path is never exercised. The
only available fix (`npm audit fix --force`) downgrades `prisma` to 6.19.3,
which would also break the CLI/client version match we just fixed (client
is pinned at 7.10.0). Accepted for now; re-check when Prisma ships a patch
release that updates these transitive deps without a major downgrade.

## 2026-09-02 — Prisma 7 configuration model (breaking change from 5/6)

`npm install prisma` resolved to **7.10.0**, which removed
`datasource { url = env("DATABASE_URL") }` from `schema.prisma` entirely —
`prisma generate`/`migrate` now read connection info from a root-level
`prisma.config.ts` (`defineConfig({ datasource: { url: env(...) } })`,
requires `dotenv/config` to load `.env` since the CLI no longer does this
implicitly), and **runtime `PrismaClient` instances require a driver
adapter** (`@prisma/adapter-pg` wrapping `DATABASE_URL`, via `new
PrismaClient({ adapter })`) — the old `new PrismaClient({ datasourceUrl })`
constructor option was removed. Both `lib/db/client.ts` (Next.js app) and
`workers/pdf/src/db.ts` (worker) now construct their own `PrismaPg`
adapter. Verified against the actual installed CLI (7.10.0), not just
documentation, after `prisma generate` failed with error code P1012 on the
old-style schema.

Also: the worker's `prisma generate` resolves its output location by
walking up from wherever `schema.prisma` physically lives, not from the
CWD the CLI is invoked from. Pointing `--schema` at the root file (via a
relative path) generated the client into the **root** `node_modules`, not
`workers/pdf/node_modules` — silently leaving the worker's own installed
`@prisma/client` copy unpopulated (Node module resolution finds the
worker's local, stale copy first). Fixed by having `workers/pdf`'s
`db:generate` script copy `prisma/schema.prisma` into a local
`workers/pdf/prisma/schema.prisma` (gitignored — regenerated on demand,
root schema stays the single source of truth) before running `prisma
generate`, so the output lands in the worker's own `node_modules` — this
also matches what the worker's Dockerfile does at image-build time for a
truly independent deployable.

## 2026-09-02 — react-bits evaluated, not adopted wholesale

Checked reactbits.dev for homepage section/template components per a
request to use it. Its catalog (Text Animations, Backgrounds, general
Animations, decorative UI components — often GSAP-dependent) is oriented
toward flashy marketing sites, which directly conflicts with
`docs/DESIGN_RESEARCH.md` and blueprint §20 ("avoid decorative
animation/backgrounds with no functional purpose," "look like a mature
productivity tool, not an AI SaaS template"). It also doesn't offer full
page-section templates (hero/feature/pricing blocks) — it's a
micro-component library.

Instead of pulling in the library (and a GSAP-class dependency) wholesale,
added one small zero-dependency primitive, `components/ui/Reveal.tsx` — a
subtle fade + slight upward slide on scroll-into-view (IntersectionObserver
+ CSS transition, respects `prefers-reduced-motion`), applied to homepage
sections/cards. Gets the "polished, not static" feel the request was after
without contradicting the calm/restrained direction or adding a dependency.

## 2026-09-02 — eslint-config-next 16 ships native flat config

The initial `eslint.config.mjs` used the legacy pattern
(`FlatCompat.extends("next/core-web-vitals", "next/typescript")`), which is
what `create-next-app` has generated for a while — but with the installed
versions (`eslint-config-next` 16.3.4, `eslint` 9.39.5, `@eslint/eslintrc`
3.3.7) it crashed with `TypeError: Converting circular structure to JSON`
while validating the shimmed config. Inspecting
`node_modules/eslint-config-next/dist/index.js` showed it now
`module.exports`s a native flat-config array directly (bundling
core-web-vitals + typescript-eslint rules already), so the fix was to drop
`@eslint/eslintrc`/`FlatCompat` entirely and `import nextConfig from
"eslint-config-next"` then spread it — simpler and it's the config this
version actually ships for flat-config consumers.

## 2026-09-02 — middleware.ts → proxy.ts (Next.js 16 rename)

Next.js 16 deprecated the `middleware.ts` file convention in favor of
`proxy.ts` (same behavior/signature, default export still supported —
only the filename changed as far as this project is concerned). Renamed
per the build's deprecation warning rather than leaving it on a
deprecated path from day one.

## 2026-09-02 — Worker Docker build: TypeScript 7 native binary + OpenSSL

First `docker compose up --build` failed two ways, both fixed in
`workers/pdf/Dockerfile`:

- `npm install --omit=optional` broke `tsc` inside the image with
  `Unable to resolve @typescript/typescript-linux-x64` — TypeScript 7's
  compiler ships as a platform-specific native binary distributed as an
  *optional* dependency (same pattern as esbuild/swc), so omitting
  optional deps removes the compiler binary entirely. Fixed by installing
  with optional dependencies included (npm resolves the correct
  linux-x64 variant since install runs inside the Linux container
  regardless of the Windows host).
- Prisma logged a warning that it couldn't detect libssl/OpenSSL in the
  `node:22-bookworm-slim` base image and defaulted to guessing
  `openssl-1.1.x`. Installed `openssl` alongside `qpdf` in the image
  rather than leaving that guess in place for a service that talks to
  Postgres.

## 2026-09-02 — First real end-to-end verification (Merge PDF) + two bugs found

Brought up the full local stack (`docker compose up`: Postgres, Redis,
MinIO, the containerized `pdf-worker`), ran `prisma migrate dev` + the
seed script, and added a real Playwright E2E test
(`tests/e2e/merge-pdf.spec.ts`, using generated fixtures in
`docs/fixtures/` via `scripts/generate-fixtures.mjs`) that drives an actual
browser: upload two real PDFs -> merge -> download -> verify the
downloaded file is a valid 5-page PDF. This is the blueprint §65 "Guest ->
Merge PDF -> Download" critical flow, now a permanent regression test, not
just a one-off manual check.

This surfaced two real bugs that unit tests/typecheck couldn't have caught:

1. **Cookie-write in a Server Component.** `app/[locale]/merge-pdf/page.tsx`
   called `resolveActor()` (which mints a guest-id cookie) directly in a
   Server Component render, which Next.js forbids — cookies can only be
   *set* in a Route Handler or Server Action. Fixed by adding
   `resolveActorReadOnly()` (`lib/security/actor.ts`), which reads the
   existing cookie without trying to write one; safe here specifically
   because `getToolLimits`'s guest branch only checks `actor.type`, never
   `actor.guestId`.
2. **Guest-cookie mint race on first visit.** The Merge PDF UI fires all
   file uploads in parallel (by design — no reason to serialize them).
   For a brand-new guest with no cookie yet, two concurrent `/api/upload`
   requests each independently minted their *own* guest id (no
   coordination), so the two uploaded files ended up owned by two
   different guest ids — job creation then correctly rejected it as an
   ownership mismatch (403). Fixed by moving cookie minting into
   `proxy.ts` (extracted the signing logic into
   `lib/security/guestIdCore.ts`, shared between the Route Handler helper
   and the proxy), so the cookie already exists on the page's initial
   navigation response — before any client-side parallel requests fire.

Also added structured success/failure logging to `workers/pdf/src/index.ts`
(job id, tool id, result, duration — no file contents) per
`docs/SECURITY.md` §8, which had only covered the failure path before.

Verified via `docker logs pdf-pdf-worker-1` and a direct Postgres query
that the `Job` row reached `COMPLETED` with correctly linked input/output
`File` rows, not just that the HTTP response looked right.

## 2026-09-02 — Phase A: UI foundation rebuild

Rebuilt the component system per the "Next Phase" brief (professional
SaaS-quality UI, no AI-template look) before starting new tools:

- **Icons**: `lucide-react` — MIT, tree-shakeable, one consistent icon
  style. Every tool gets a `LucideIcon` in `lib/tools/registry.ts` now.
- **Accessible primitives**: the unified `radix-ui` package (Dialog,
  DropdownMenu, Tabs, Tooltip, Checkbox, Switch, RadioGroup, Select,
  Slider) instead of hand-rolling focus-trapping/keyboard nav — that's
  exactly where accessibility bugs would creep in under time pressure.
  Wrapped the app in `Direction.Provider` (from `radix-ui`) so these
  primitives get RTL right automatically.
- **Toast**: `sonner` (via the `ask-sonner` skill) rather than raw Radix
  Toast — ergonomic imperative API, less boilerplate for an initially
  light use case.
- **Page thumbnails**: `pdfjs-dist` installed now; `FileThumbnail` is
  icon-based today and will render real PDF page previews once a
  page-selection tool (Delete/Extract/Reorder/Rotate) actually needs it —
  no point building that complexity before a consumer exists.
- Reorganized `components/navigation/` → `components/layout/` (AppHeader,
  DesktopNav, MobileNav, Footer, PageContainer, Section, Breadcrumbs,
  LocaleSwitcher) and `components/upload/FileDropzone` →
  `components/tools/ToolDropzone` to match the requested structure and
  avoid two overlapping "nav" locations.
- Extracted `useToolWorkflow` (`components/tools/useToolWorkflow.ts`): the
  single upload -> job -> poll -> download orchestration hook every tool
  page will use, generalized out of the original `MergePdfTool`. Tool
  pages only supply `toolId`, accepted mime type, `multiple`, and their
  own options UI before calling `start(options)`.
- Extended `ToolCategory` from `"pdf" | "image"` to the five groups the
  brief specifies (`organize`/`convert`/`optimize`/`edit`/`security`) and
  added `icon`/`multipleFiles` to `ToolDefinition`.

**Found via actual screenshots, not just code review**: the homepage's
scroll-triggered fade-in (`components/ui/Reveal.tsx`, added earlier this
session) left entire sections (`Why JDpdf`, `How it works`) permanently
invisible in a full-page capture — the `IntersectionObserver` never fired
for content outside the initial viewport in that context, and more
importantly this pattern (hide-by-default until JS says otherwise) is
fragile for real users too, and wasn't even in the brief's sanctioned
animation list (upload/drag/processing/success/hover). Deleted it;
homepage content now always renders and only uses hover/interaction-driven
motion. Lesson: screenshot the actual result for visual/UI work — code
review alone would not have caught this.

Verified after the rewrite: `tsc --noEmit`, `eslint`, and the real
Playwright Merge PDF E2E test all still pass — the refactor didn't touch
`lib/`, `app/api/`, or `workers/pdf/`.

## Template for future entries

```
## YYYY-MM-DD — <short title>

- Decision:
- Why:
- Alternatives considered:
- Revisit when:
```
