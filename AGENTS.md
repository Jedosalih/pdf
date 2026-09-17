# AGENTS.md — JPdf

Read this file completely before writing any code in this repository.

## 1. Project purpose

JPdf is a multilingual (Arabic/English/Turkish) online PDF & document tools
platform (merge, split, compress, convert, OCR, etc.), architected as the
foundation of a commercial SaaS product — not a one-off script collection.

Source spec: `PDF Platform — Master Project Blueprint.md` (root). That file is
the product requirements document. This file is the engineering contract for
anyone (human or agent) working in this codebase. If the two ever conflict on
a concrete implementation detail, prefer what is actually implemented and
recorded in `docs/DECISIONS.md`.

## 2. Stack

- Next.js (App Router) + TypeScript (strict) + React
- Tailwind CSS v4 (CSS-first config, design tokens via `@theme`)
- `next-intl` for i18n/routing (`ar`, `en`, `tr`; `ar` is RTL)
- PostgreSQL + Prisma ORM
- Redis + BullMQ for job queues
- Object storage via an S3-compatible abstraction (MinIO locally, R2/S3 in prod)
- PDF workers are separate Node processes (not Next.js request handlers),
  shelling out to qpdf / Ghostscript / Poppler / OCRmyPDF+Tesseract /
  LibreOffice via safe argument arrays (never a shell string).

## 3. Architecture (short version — see `docs/ARCHITECTURE.md`)

```
Browser → Next.js (upload, auth, API, CMS) → Job row in Postgres
        → BullMQ job in Redis → Worker process → engine (qpdf/gs/...)
        → result written to object storage → Job marked COMPLETED
        → Browser polls/subscribes to job status → signed download URL
```

Heavy processing NEVER happens inline in a Next.js request handler. A request
handler's job is: validate input, persist metadata, enqueue, respond fast.

## 4. Directory ownership

```
app/            routes, layouts, pages (locale-aware under app/[locale])
components/     ui/ tools/ upload/ pdf/ navigation/ marketing/ admin/
lib/            auth/ db/ storage/ queue/ entitlements/ seo/ i18n/ security/
workers/        pdf/ ocr/ office/ image/ cleanup/  (own Dockerfiles)
prisma/         schema.prisma, migrations
messages/       ar/ en/ tr/ translation JSON, one namespace per file
docs/           architecture & decision records — keep these current
```

Do not reach across layers casually: UI components must not shell out to
processing engines; workers must not import Next.js server code; API routes
must not contain PDF-processing logic (they enqueue jobs and query status).

## 5. Coding standards

- TypeScript strict mode. No `any` used as an escape hatch.
- Centralize: tool definitions (`lib/tools/registry.ts`), entitlements
  (`lib/entitlements`), validation (`lib/security`), error shapes.
- No scattered `if (user.plan === "pro")` — always go through
  `canUseTool` / `getToolLimits` / `getRemainingUsage`.
- No hardcoded business limits (file size, page count, daily quota) in
  components — these come from the tool registry / DB (`ToolLimit`) and can
  be overridden by an admin without a code change.
- No hardcoded translation strings in components — everything goes through
  `next-intl` messages, even for the initial 3 tools.
- Server Components by default; a component becomes a Client Component only
  when it needs interactivity/state (upload widgets, progress UI).
- Small, composable functions over giant page components. Extract shared
  tool-page UI into `components/tools/*` rather than duplicating per tool.
- Do not add an abstraction until a second concrete use case needs it
  (see blueprint §82 — no premature abstraction).

## 6. Security requirements (non-negotiable)

- Every uploaded file is untrusted input. Validate MIME type, extension, and
  magic bytes/file signature — never trust `file.name` or `file.type` alone.
- Never build shell command strings from user input. Always call the
  processing binaries with argument arrays (`execFile`/`spawn`, not `exec`).
- All file paths for temp/working files are server-generated random names in
  an isolated temp directory — never derived from user-provided filenames.
- Enforce max file size, max page count, and per-job timeouts before and
  during processing.
- Files belong to a `userId` or `guestId`; downloads require a signed URL or
  an authorization check — no publicly guessable file URLs.
- Never log file contents, passwords, or auth tokens/secrets.
- Rate limit auth, uploads, and job creation endpoints.
- See `docs/SECURITY.md` for the full threat model.

## 7. i18n requirements

- Three locales: `ar`, `en`, `tr`. Arabic is RTL — use `dir="rtl"` at the
  html/root level for `ar` and logical CSS properties
  (`margin-inline-start`, not `margin-left`) everywhere. Never mirror
  components by hand per-locale.
- Every user-facing string goes in `messages/<locale>/*.json`. No inline
  literal UI strings in components (class names, aria-labels, and code
  comments are exempt).
- Every localized page sets canonical + hreflang for all three locales.
- See `docs/I18N.md`.

## 8. Design requirements

- Follow `docs/DESIGN_RESEARCH.md` and the design tokens in
  `app/globals.css`. Reuse `components/ui/*` primitives — do not invent a
  one-off button/card/input style per page.
- Mobile-first. Avoid glassmorphism, huge gradients, neon colors, or
  decorative animation with no functional purpose (blueprint §20).

## 9. Testing requirements

- New business logic (entitlements, validation, tool registry, SEO
  metadata generation) gets unit tests.
- New API routes affecting jobs/uploads get integration coverage against a
  real (test) Postgres + Redis, not mocks of our own DB layer.
- Do not mark a tool "done" without actually running a real file through it
  locally (see `docs/TEST_PLAN.md` and the PDF test corpus under
  `docs/fixtures/` once created).

## 10. Git rules

- This repo currently has no commits — the first commit should be the
  Phase 0 foundation, not accumulated WIP.
- Prefer small, focused commits per subsystem over one giant commit, but do
  not commit half-working code paths.
- Never force-push, never rewrite shared history, never skip hooks.
- Do not commit `.env`, credentials, or generated artifacts (`node_modules`,
  `.next`, `prisma`'s generated client output, worker temp dirs).

## 11. Do-not rules

- Do not perform PDF/OCR/office-conversion processing inside a Next.js API
  route — always go through the job/queue/worker path.
- Do not fake a feature (progress bars that lie, tools that silently no-op,
  placeholder "coming soon" buttons styled as if they work).
- Do not add a payment provider, email provider, or analytics SDK
  dependency until that phase is actually being implemented.
- Do not build a feature for a hypothetical future plan tier — build what
  the current phase needs, behind the entitlement abstraction.
- Do not introduce a new dependency without checking it's actually needed,
  maintained, and license-compatible with a commercial product
  (see blueprint §63–64).

## 12. Definition of done (per feature)

A feature is done when it: works against a real file end-to-end, is
responsive (mobile + desktop), is localized in all 3 languages including
RTL, enforces its limits server-side (not just in the UI), handles and
surfaces errors without leaking internals, has no console errors, and has
been recorded in `docs/DECISIONS.md` if it involved a non-obvious choice.

## 13. Current status

See `docs/DECISIONS.md` for the running log of what has been built and why.
As of the initial foundation commit: Phase 0 (docs + scaffold) and the
Merge PDF end-to-end path are the active focus. Everything else in the
blueprint is intentionally deferred — do not start Phase 4+ work (auth,
CMS, billing) before the first tool works reliably end-to-end.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
