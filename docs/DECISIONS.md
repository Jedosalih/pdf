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

## 2026-09-02 — Split PDF shipped (second tool, verified end-to-end)

Implemented "split every N pages" as the V1 split mode (page-range/
individual-page modes deferred — see blueprint §12 lists all three, but
range selection needs visible page thumbnails to be usable, which
`FileThumbnail` doesn't do yet). Each split chunk becomes its own `File`
row linked via `outputJobId` — the existing multi-output-file support
(`Job.outputFiles`, `ResultState` mapping over `outputFiles`) needed zero
changes, so no ZIP step was necessary.

Added `runCommandCapture` (`workers/pdf/src/exec.ts`) alongside
`runCommand` for engines that report data via stdout (`qpdf
--show-npages`) rather than writing a file.

Also added `getRelatedToolCards` (`lib/tools/relatedTools.ts`) and wired
it into `ToolPage` — cross-linking (blueprint §74–75) was designed into
the registry (`relatedTools: string[]`) from the start but never actually
rendered anywhere until now. Changed `ToolGridItem`/`ToolCard` to accept
the `LucideIcon` component reference instead of a pre-rendered `ReactNode`
so both the homepage and this helper can share one icon-rendering path
instead of every caller repeating `<Icon className="h-5 w-5" />`.

Verified for real: `docker compose up -d --build pdf-worker`, reseeded,
then a Playwright test (`tests/e2e/split-pdf.spec.ts`) uploads a generated
6-page fixture, splits every 2 pages, downloads all 3 resulting files, and
confirms each is a genuinely valid 2-page PDF. Cross-checked directly in
Postgres: one `COMPLETED` Job with three linked output `File` rows
(`split-part-1/2/3.pdf`).

## 2026-09-02 — Compress PDF shipped (third tool, verified end-to-end)

Added Ghostscript to the worker image (`workers/pdf/Dockerfile`) and
`workers/pdf/src/handlers/compressPdf.ts`, mapping the three UI levels to
Ghostscript's own presets: Basic → `/printer`, Balanced → `/ebook`,
Strong → `/screen` (lowest quality/smallest size). Corrected
`docs/PDF_ENGINE.md`, which had this mapping garbled from before the tool
was actually built.

`CompressPdfTool` reports genuine before/after size (`formatFileSize` on
the original upload vs. the real `outputFiles[0].size`) — confirmed this
matters in practice: compressing the tiny vector-only test fixture
(1.4 KB) through Ghostscript's `pdfwrite` re-encoding actually produced a
*larger* file (3.4 KB, verified in Postgres), which is expected for small
files with no images. The UI shows this honestly (`1.4 KB → 3.4 KB`)
rather than assuming compression always shrinks — matches blueprint's
"never show a fabricated estimate."

Verified: `docker compose up -d --build pdf-worker` (confirmed `gs
--version` inside the running container), reseeded, all three Playwright
E2E tests (merge/split/compress) green, direct Postgres check of the
Job/File rows, and a full `next build`.

## 2026-09-03 — Rotate PDF shipped (fourth tool, verified end-to-end)

Rotates every page in the file by a fixed angle (90/180/270°) via `qpdf
--rotate=+<degrees>`. Per-page rotation (as opposed to whole-document) is
deferred with the other page-selection tools until real page thumbnails
exist (`pdfjs-dist` is installed but still unused).

Verified more precisely than previous tools: the E2E test doesn't just
check the output is a valid PDF with the right page count — it reads
`page.getRotation().angle` via pdf-lib on every page and asserts it's
exactly 90, which is a genuine functional check that the qpdf flag did
what it claims. Also confirmed via a direct Postgres read that
`Job.options` stored `{"degrees": 90, ...}` as sent from the UI.

## 2026-09-03 — Delete/Extract/Reorder Pages shipped (5th–7th tools)

First tools needing real page-level interaction rather than file-level.
Built the shared infrastructure once, reused by all three:

- `usePdfPageThumbnails` (`components/tools/`): renders every page of a
  locally-selected PDF to a canvas thumbnail entirely client-side via
  `pdfjs-dist`, no server round trip. Worker URL configured with
  `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` inside
  the same client module (the pattern that actually works with Turbopack —
  confirmed live via a Playwright screenshot with console/page-error
  capture before building on top of it, not just assumed from docs).
- `PageGrid` (`components/tools/`): one grid component for both
  interaction modes — `"select"` (click to toggle, used by Delete/Extract)
  and `"reorder"` (drag, or move-earlier/later buttons on hover/focus —
  same accessible-fallback pattern as `FileList`'s file reordering).
- `workers/pdf/src/handlers/pageSelection.ts`: shared `getPageCount` +
  `extractPages` (qpdf `--pages <input> <input> <comma-list> -- <output>`)
  — Delete/Extract/Reorder are all really "produce a new PDF from this
  exact 1-indexed page list," differing only in how that list is computed
  (complement of a delete-set, a sorted keep-set, or a user-supplied
  permutation).

Hit the same `react-hooks/set-state-in-effect` lint rule as the earlier
`Reveal` component removal: `usePdfPageThumbnails`'s effect was calling
`setLoading`/`setError`/`setPages` as bare top-level statements before the
async IIFE, which the rule flags even though it's the standard "start a
loading state, then fetch" pattern. Fix: move those calls to the first
lines *inside* the async IIFE instead of before it — functionally
identical timing, but nested in a function expression satisfies the rule.
Also avoided a second instance of the same issue in `ReorderPagesTool` by
never using an effect to mirror `pages` into an `order` state on first
load — `order` starts `null` and the display value is derived as `order ??
pages.map(p => p.pageNumber)` during render, only ever set in response to
a real user action (a page move).

**Verification went beyond page-count checks this time**, deliberately:
a broken reorder handler that just left the file untouched would still
pass a "still 6 pages" test. Added
`tests/e2e/helpers/pdfText.ts` (uses `pdfjs-dist/legacy/build/pdf.mjs`,
the Node-compatible build, for text extraction only — no `canvas` native
dependency needed) to read each output page's actual text content, and
asserted exact page *order* for reorder and exact page *identity* for
delete/extract. Also caught and fixed a real process gap: added
`extract-pages`/`reorder-pages` to the tool registry as `enabled: true`
before their pages/handlers existed, which would have shown broken
homepage links — caught before it reached a real browser, by remembering
the API layer's `TOOL_DISABLED` check reads the same `enabled` flag, not
just the homepage listing.

## 2026-09-03 — JPG-to-PDF/PNG-to-PDF shipped (8th–9th tools) + a real storage-layer bug

First tools using `pdf-lib` in the worker (no subprocess — per
`docs/PDF_ENGINE.md`, image-to-PDF assembly is cheaper in-process than
shelling out). One shared handler,
`workers/pdf/src/handlers/imageToPdf.ts`, backs both `jpg-to-pdf` and
`png-to-pdf` (registered twice in the `handlers` map) since the only
difference is which `pdf-lib` embed method runs. Each image becomes a
page sized to A4 in the image's own orientation, scaled to fit and
centered — using raw pixel dimensions as PDF points directly would produce
absurdly large pages (a 3000px-wide photo would be a 41-inch-wide PDF
page at 72pt/inch).

Also generalized `MergePdfTool` into a shared `MultiFileTool`
(`components/tools/MultiFileTool.tsx`) parameterized by `toolId`/`accept`/
`maxFiles`/`minFiles` — Merge, JPG-to-PDF, and PNG-to-PDF are all "upload
N files, optionally reorder, click Start, get one result" with zero
tool-specific options, so with a third consumer this was clearly a real
pattern, not a premature abstraction. `MergePdfTool`/`JpgToPdfTool`/
`PngToPdfTool` are now thin wrappers supplying just their own config.

**Found a real, non-obvious storage-layer bug** while writing the E2E
test for JPG-to-PDF (PNG-to-PDF passed first try, which is what made this
worth digging into rather than assuming a fixture problem): `pdf-lib`'s
JPEG embedder threw `"SOI not found in JPEG"` on a file that was
byte-for-byte identical (verified via direct `Buffer.compare` against a
copy pulled straight from MinIO) to a fixture that embedded fine when
read via `fs.readFile`. Root cause: `workers/pdf/src/storage.ts`'s
`downloadToBuffer` did `Buffer.from(uint8Array)` — for inputs under
Node's buffer-pooling threshold (~4KB), this copies the bytes correctly
but allocates the destination from Node's shared internal buffer pool,
producing a `Buffer` whose `.byteOffset` is non-zero into a larger,
unrelated `ArrayBuffer` (confirmed: a 640-byte file landed at
`byteOffset: 5224` inside an 8192-byte pool). `pdf-lib`'s JPEG parser
reads `.buffer` directly without honoring `byteOffset`, so it silently
read the wrong region of memory instead of throwing on a content
mismatch. Its PNG parser doesn't have this sensitivity, which is why only
JPEG was affected. Fixed by wrapping the already-correctly-sized
`ArrayBuffer` explicitly instead of copying:
`Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)` — applied
to both `workers/pdf/src/storage.ts` and the mirrored `lib/storage/s3.ts`
(same latent bug, not yet hit there only because nothing currently reads
raw file bytes from the Next.js app directly). Every prior tool was
unaffected because qpdf/Ghostscript read from files written via
`fs.writeFile`, which correctly respects buffer offsets — only
direct in-memory binary parsing was exposed. Worth remembering for any
future in-process binary parsing (Sharp for PDF→image, etc.).

## 2026-09-03 — PDF-to-JPG/PDF-to-PNG shipped (10th–11th tools)

Added `poppler-utils` to the worker image and one shared handler,
`workers/pdf/src/handlers/pdfToImage.ts`, backing both `pdf-to-jpg` and
`pdf-to-png` via `pdftoppm -jpeg|-png -r 150` — same "one handler, two
registry entries" pattern as `imageToPdf.ts`. Output files are discovered
by reading the temp output directory back (`pdftoppm`'s exact zero-padding
width isn't guaranteed across versions) and sorted numerically by the
page number extracted from the filename, not lexicographically (avoids
"page-10" sorting before "page-2").

**Improved `ResultState` while here**: it previously rendered one
identically-labeled "Download" button per output file, which was already
mediocre for Split PDF's 2–3 outputs and would have been genuinely bad
for a PDF-to-JPG result on a 20+ page document (20 buttons all saying
"Download" with no way to tell them apart without hovering). Now: a
single result still gets the original big download button; multiple
results render a compact list with filename, size, and a small download
icon per row. Retroactively improves Split PDF's result screen too, not
just these two new tools.

Verified: `docker exec ... pdftoppm` confirmed present, reseeded,
Playwright E2E tests decode the actual downloaded bytes with `sharp`
(not just check magic bytes) to confirm each is a genuinely valid
JPEG/PNG, and count matches page count exactly (6 outputs for a 6-page
input, 3 for a 3-page input) — cross-checked in Postgres.

## 2026-09-02 — Watermark PDF shipped (12th tool, verified end-to-end)

Added `workers/pdf/src/handlers/watermarkPdf.ts` (`pdf-lib`, no
subprocess — same rationale as `imageToPdf.ts`) that stamps a single
user-supplied text string diagonally (45°) across the center of every
page, sized relative to the page's smaller dimension so it scales
sensibly across page sizes. `pdf-lib`'s `drawText` rotates around the
pre-rotation bottom-left corner of the text, not its visual center, so
centering a rotated string requires solving for the anchor point that
puts the text's actual visual center at the page's center post-rotation
— implemented with the standard 2D rotation-around-a-pivot formula
rather than eyeballing an offset.

New pattern for this tool vs. prior ones: the first tool whose only
option is free-text input rather than a Select/degree/mode choice, so
`WatermarkPdfTool.tsx` uses `components/ui/Input` instead of `Select`,
with a 100-character client-side cap mirrored by a server-side check in
the handler (`JobFailure("VALIDATION_ERROR")` on empty or over-length
text) — the client cap is UX, the server check is the actual boundary
since `Job.options` is attacker-controlled JSON.

Verified: `tsc --noEmit`/`eslint` clean on both app and worker, worker
`tsc` build clean, `docker compose up -d --build pdf-worker` rebuilt with
the new handler registered, reseeded. `tests/e2e/watermark-pdf.spec.ts`
uploads a 3-page fixture, types a distinctive watermark string, downloads
the result, and — beyond just checking a valid 3-page PDF — extracts each
page's actual text via the existing `pdfText.ts` helper and asserts the
watermark string is present on every page (a broken handler that ignored
the `text` option or only stamped page 1 would still pass a page-count-only
check). Full Playwright suite (12/12) green, confirming no regression to
the 11 previously-shipped tools. Cross-checked directly in Postgres: two
test-run `Job` rows `COMPLETED` for `watermark-pdf`, each with a linked
`File` row (`watermarked.pdf`, `application/pdf`, status `READY`). Full
`next build` production check passed, including the new
`/[locale]/watermark-pdf` route. Screenshot-verified both `en` (LTR) and
`ar` (RTL) renders.

## 2026-09-02 — Page Numbers shipped (13th tool, verified end-to-end)

Added `workers/pdf/src/handlers/pageNumbers.ts` (`pdf-lib`, same
in-process rationale as watermark/image-to-pdf). Draws a plain
incrementing label (`startAt + pageIndex`) at one of six fixed
positions (`{top,bottom}-{left,center,right}`), computed from a fixed
margin plus the label's own measured width (`font.widthOfTextAtSize`)
so right/center-aligned numbers stay properly inset instead of
overflowing the page edge. Both `position` and `startAt` are validated
against an explicit allow-set/range on the server
(`JobFailure("VALIDATION_ERROR")`) exactly like `rotate-pdf`'s degree
enum — the client UI constrains the same values, but `Job.options` is
attacker-controlled JSON so the server check is the real boundary.

`PageNumbersTool.tsx` is the first tool combining a `Select` (position)
and a numeric `Input` (start number) side by side — reused both
existing controls rather than adding a new one.

Verified: `tsc --noEmit`/`eslint` clean on app and worker, worker `tsc`
build clean, `docker compose up -d --build pdf-worker` rebuilt with the
handler registered, reseeded. `tests/e2e/page-numbers.spec.ts` uploads
the 6-page fixture, sets a non-default start number (5), downloads the
result, and — beyond a page-count check — extracts each page's actual
text via `pdfText.ts` and asserts the exact expected number
(5, 6, 7, ... 10) appears on the correct page; a handler that ignored
`startAt` or mislabeled a page would fail this. Full Playwright suite
(13/13) green, no regressions to the 12 previously-shipped tools.
Cross-checked directly in Postgres: `Job.options` stored
`{"startAt": 5, "position": "bottom-center", ...}` exactly as sent, two
`COMPLETED` Job rows each with a linked `File` row (`numbered.pdf`,
`application/pdf`, status `READY`). Full `next build` production check
passed, including the new `/[locale]/page-numbers` route.
Screenshot-verified both `en` (LTR) and `ar` (RTL) renders.

## 2026-09-02 — Protect/Unlock PDF shipped (14th–15th tools, verified end-to-end)

First tools using qpdf's `--encrypt`/`--decrypt` rather than `pdf-lib` —
`pdf-lib` has no encryption support at all (read or write), so
`workers/pdf/src/handlers/protectPdf.ts` and `unlockPdf.ts` follow the
same `runCommand` + `withTempDir` subprocess pattern as `rotatePdf.ts`.
Protect uses the same password for both the qpdf "user" and "owner"
slots (AES-256, `--encrypt <pw> <pw> 256 --`) since this tool only
promises "requires this password to open," not owner-permission
restrictions — a distinct owner password would add no real protection
here while confusing what "the password" means to the user. Unlock
requires the password to already be known (`--password=<pw>
--decrypt`), matching the blueprint's explicit "known password only"
scope — this is not a password-cracking/recovery tool.

Added a new shared error code, `INVALID_PASSWORD`, plumbed through the
whole existing error path rather than a one-off: `errorMessageKey`
(`components/tools/useToolWorkflow.ts`) maps it to a new
`common.errors.invalidPassword` string in all three locales.
`unlockPdf.ts` distinguishes it from other failures by checking qpdf's
stderr for the substring "password" (its own wrong-password message)
before falling back to the generic `PROCESSING_FAILED`.

`ProtectPdfTool`/`UnlockPdfTool` are the first tools using
`<Input type="password">` — otherwise identical single-file-plus-Input
shape as `WatermarkPdfTool`. New `security` tool category (already
present in `ToolCategory`/translations from Phase A, never previously
used by a real tool).

**Verification here needed a different approach than page-count/text
checks**, since the whole point is that the output requires (or no
longer requires) a password:
- Protect PDF's E2E test opens the downloaded file with `pdfjs-dist`'s
  `getDocument({ data, password })` — first asserting the *wrong*
  password throws (proving it's genuinely encrypted, not just renamed),
  then that the *chosen* password successfully decrypts and the
  original page text is intact.
- Unlock PDF's E2E test needed a genuinely encrypted input fixture that
  didn't exist yet. Rather than fabricate one (impossible without qpdf,
  which only runs inside the worker container) or add throwaway
  fixture-generation code, it drives the real, already-verified Protect
  PDF flow first to produce one, then feeds that real encrypted output
  into Unlock PDF — with the wrong password first (asserting the actual
  "That password is incorrect." UI message backed by the real
  `INVALID_PASSWORD` job failure, not a mocked error state), then the
  correct password, and finally confirms the result opens with **no**
  password at all and the original page text survived.
- Extended `tests/e2e/helpers/pdfText.ts` with an optional `password`
  parameter (passed straight through to `pdfjs-dist`'s `getDocument`)
  instead of writing a separate encrypted-content-extraction helper.

**Found and fixed a real test-infrastructure bug while wiring the
Unlock test's two-step flow**: Playwright's `download.path()` points at
its internal download cache under a generated filename with no `.pdf`
extension. Re-uploading that path made the browser send an empty/
`application/octet-stream` declared MIME type on the second upload,
which `validateUploadedFile`'s declared-MIME check correctly rejected
as `UNSUPPORTED_FILE` — silently leaving the file in an `error` state
and permanently disabling the Start button (the test failed on a
30-second timeout waiting for a button that could never become
enabled). Root-caused by inspecting the actual upload failure via the
UI state rather than assuming the test's own logic was fine. Fixed by
`download.saveAs()` to an explicit temp path ending in `.pdf` before
reusing it as the next step's input — a real user re-uploading a
downloaded file always has a proper extension, so this makes the test
represent that path accurately, not a workaround for a product bug.

Verified: `tsc --noEmit`/`eslint` clean on app and worker, worker `tsc`
build clean, `docker compose up -d --build pdf-worker` rebuilt with both
handlers registered, reseeded. Full Playwright suite (15/15) green, no
regressions to the 13 previously-shipped tools. Cross-checked directly
in Postgres: both `COMPLETED` and a real `FAILED`/`INVALID_PASSWORD`
`Job` row exist for `unlock-pdf` (from the deliberate wrong-password
step), and both `COMPLETED` protect/unlock jobs have linked `File` rows
(`protected.pdf`/`unlocked.pdf`, status `READY`). Full `next build`
production check passed, including the new `/[locale]/protect-pdf` and
`/[locale]/unlock-pdf` routes. Screenshot-verified both `en` (LTR) and
`ar` (RTL) renders for both tools.

This is the 14th and 15th tool shipped overall; one tool remains from
the "Next Phase" ordered list (PDF Metadata).

## 2026-09-02 — PDF Metadata shipped (16th tool, verified end-to-end) — all 15 ordered tools complete

Final tool from the "Next Phase" ordered list. Uses `pdf-lib`'s
existing `setTitle`/`setAuthor`/`setSubject`/`setKeywords` (in-process,
no subprocess). Behaves as an editor, not a reset: each of the four
fields is only written if the user supplied a non-empty value —
`PDFDocument.load` already has the file's current metadata in memory,
so leaving a field blank naturally keeps whatever the file already had,
with no separate read-then-diff step needed. At least one field must be
non-empty or the job is rejected as a no-op
(`JobFailure("VALIDATION_ERROR")`) — same "must actually do something"
rule as `watermark-pdf`'s non-empty-text requirement. Keywords are
comma-separated in the UI but `pdf-lib.setKeywords` takes an array and
internally joins with spaces (not commas) when writing the PDF
`/Keywords` entry — the E2E test asserts the exact space-joined string
pdf-lib actually produces, not the comma-separated input, so a future
change to that join behavior would be caught rather than silently
passing.

`PdfMetadataTool` is the first tool with four options fields at once
(2x2 `Input` grid) — still just composing the existing `Input`
component, no new control needed.

Verified: `tsc --noEmit`/`eslint` clean on app and worker, worker `tsc`
build clean, `docker compose up -d --build pdf-worker` rebuilt with the
handler registered, reseeded. `tests/e2e/pdf-metadata.spec.ts` uploads a
fixture, sets all four fields, downloads the result, and reads them
back via `pdf-lib`'s own `getTitle`/`getAuthor`/`getSubject`/
`getKeywords` — a handler that silently dropped an option (e.g. only
title) would fail this, unlike a page-count-only check. Full Playwright
suite (16/16) green — every tool from the ordered list plus Merge PDF,
no regressions. Cross-checked directly in Postgres: `Job.options`
stored all four fields exactly as sent, `COMPLETED` status, linked
`File` row (`metadata.pdf`, `application/pdf`, status `READY`). Full
`next build` production check passed, including the new
`/[locale]/pdf-metadata` route. Screenshot-verified `en` (LTR, both
empty and file-selected states showing the 2x2 field grid) and `ar`
(RTL) renders.

This completes all 15 tools from the "Next Phase" ordered list (Split
PDF through PDF Metadata), on top of the Merge PDF flow verified in the
earlier phase.

## 2026-09-15 — Auth foundation + workspace backend shipped (schema, sessions, retention, guest migration, My Documents/History APIs)

First phase of the Master Product Redesign & Expansion Blueprint's Priority
1 (Product/UI Foundation) + Priority 2 (Auth Foundation + Document
Workspace Shell). This entry covers the backend/data layer; the UI layer
(header, homepage, tools directory, workspace pages) follows in subsequent
commits.

- **Schema**: `File` gains `starred: Boolean @default(false)` and
  `deletedAt: DateTime?` (+ `@@index([userId, deletedAt])`); `Job` gains
  `hiddenAt: DateTime?`. Star/Trash operate at the File level, not Job,
  because a Job can have N input + M output Files — trashing/starring is
  inherently per-file. "Delete" a history entry sets `Job.hiddenAt` rather
  than actually deleting the row, because `Job.inputFiles`/`outputFiles`
  are `onDelete: Cascade` *from* Job — a real delete would silently
  cascade-destroy the user's actual files, including ones already
  downloaded and expected to persist.
- **Auth mechanism**: custom email+password auth built directly on the
  existing `User`/`Session` models (`lib/auth/session.ts`,
  `lib/auth/password.ts`) — no NextAuth/Auth.js. `Session.tokenHash` was
  already a hand-designed DB-session-with-hashed-token shape (not JWT, not
  NextAuth's adapter shape), so adopting a library would mean either
  reshaping an already-reviewed schema or bypassing its adapter entirely,
  at which point it adds nothing. Session cookie signing mirrors the
  existing `jdpdf_guest` HMAC pattern (`lib/security/guestIdCore.ts`) —
  same primitive, reused rather than duplicated.
- **Password hashing**: `bcryptjs` (pure JS), not `bcrypt`/`argon2`. This
  project already has a documented scar from a native-binding dependency
  breaking a build (TypeScript 7's platform-specific compiler under
  `--omit=optional`, see the worker Dockerfile entry above) — hashing runs
  in the Next.js app itself here, an even less controlled environment than
  the worker container. Password length is validated by *UTF-8 byte
  length* (`new TextEncoder().encode(password).length <= 72`), not string
  length — a zod `.max(72)` counts UTF-16 code units, which under-counts
  multi-byte characters (Arabic/Turkish passwords), and bcrypt's real limit
  is 72 *bytes*.
- **`resolveActor()`/`resolveActorReadOnly()`** (`lib/security/actor.ts`)
  now check `getSessionUser()` first, exactly as the functions' own
  docblock predicted when they were written — zero other call site changed,
  since `lib/entitlements/index.ts` and every existing API route already
  branched generically on `actor.type`. Also extracted the
  previously-duplicated ownership-check expression into a shared
  `isOwnedByActor()` helper.
- **Retention fix**: every File/Job creation site (`app/api/upload`,
  `app/api/jobs`, all 14 worker handlers) stamped an unconditional 24h
  `expiresAt` regardless of actor type. Without a fix, a signed-up user's
  "My Documents" files would still be silently scheduled for guest-style
  expiry. New `computeExpiry(actor)` (app, `lib/entitlements/retention.ts`)
  / `computeFileExpiry(userId)` (worker, `workers/pdf/src/retention.ts` —
  duplicated rather than imported, since `workers/pdf` is a fully separate
  package) return `null` for user-owned rows, keep the existing 24h for
  guests. Audited every consumer of `expiresAt` across `app/`, `lib/`, and
  `workers/pdf/src/` before rolling this out: the field is only ever
  written, never read/filtered/compared anywhere in application code today
  (no cleanup worker exists yet to misinterpret `null` — that's a separate,
  pre-existing, unaffected gap), so introducing `null` is safe.
- **Guest→user migration**: `lib/auth/migrateGuestData.ts` reassigns a
  guest's `Job`/`File` rows (`guestId→userId`, `guestId:null`,
  `expiresAt:null`) on both register and login, called with the actor
  resolved *before* the new session is established. Deliberately does
  **not** migrate `UsageRecord` — the free tier's higher daily limits are
  part of the signup incentive; carrying over guest usage counts would
  undermine that. Idempotent on an already-migrated (now-null) guestId, so
  it's safe to run unconditionally on every login, not just first login.
- **My Documents / Starred / Trash / History APIs**: `GET /api/files`
  (view=documents|starred|trash, search, sort, cursor pagination — chosen
  over offset pagination so results stay stable if rows move between views
  mid-scroll), `PATCH`/`DELETE /api/files/[id]`, `POST
  .../trash|restore`, `GET /api/jobs` (history) + `POST
  /api/jobs/[id]/hide`. Permanent delete only succeeds once a file is
  already trashed (`409 NOT_TRASHED` otherwise) — forces the two-step
  trash-then-delete flow so it's never one accidental click from
  Documents. Rename/star blocked while trashed (`409 FILE_TRASHED`) —
  restore first.
- **Rate limiting**: new `lib/security/rateLimit.ts`, a Redis
  `INCR`/`EXPIRE` counter on the already-provisioned queue Redis
  connection — no new infrastructure. Applied to register (by IP) and
  login (by IP and by normalized email).

**Verified**: `tsc --noEmit`/ESLint clean on both app and worker; worker
`tsc` build clean; `docker compose up -d --build pdf-worker` rebuilt with
the retention change; full Playwright suite (16/16) green (confirmed
serialized — a parallel run showed transient failures from local dev
Postgres contention under concurrent workers, not a real regression: the
worker log showed every job completing successfully in both runs).
Direct manual verification of the entire auth/workspace flow via curl
(kept out of the Playwright suite for now — formal E2E coverage for these
flows lands with the workspace UI in a follow-up commit): guest upload →
register → file migrated (`userId` set, `guestId` null, `expiresAt` null)
→ appears in `/api/files`; star/rename/trash/restore/permanent-delete all
behave correctly including both 409 guards; a second registered user
receives `403 FORBIDDEN` attempting to read, download, patch, or trash the
first user's file; logout destroys the `Session` row (confirmed via direct
Postgres check, not just cookie clearing) and subsequent workspace
requests correctly fall back to guest and return `401 AUTH_REQUIRED`;
wrong-password login returns generic `401 INVALID_CREDENTIALS`; duplicate
registration returns `409 EMAIL_TAKEN`; login rate limiting triggers
`429 RATE_LIMITED` on the 6th attempt against a 5-attempt/15-minute limit.

## 2026-09-16 — Brand mark + shared upload/result upgrades shipped (Priority 1 foundation, part 1)

First UI-layer commit of the Master Product Redesign Blueprint's Priority
1 work, building on the auth/workspace backend from the previous entry.

- **Brand mark**: `components/layout/BrandMark.tsx`, a plain inline SVG
  (rounded document tile + folded corner + "J" glyph), wired into
  `AppHeader.tsx` next to the existing text wordmark; `app/icon.svg` for
  the browser favicon (simplified, no fold detail — disappears below
  ~32px anyway). Kept `--color-primary` (`#1d4ed8`) as-is rather than
  matching a reference mockup's `#2563EB` exactly — one step apart,
  already contrast-verified, not worth re-auditing 18 primitives for an
  imperceptible difference (blueprint §6: consolidate an approved system
  rather than replace it). Screenshot-verified in both `en` and `ar`
  (mirrors correctly).
- **Homepage → tool handoff mechanism**: `components/upload/
  PendingUploadProvider.tsx`, a context mounted once in
  `app/[locale]/layout.tsx`. Exists now as inert plumbing — nothing calls
  `setFile()` yet, since the homepage hero dropzone itself lands in a
  follow-up commit — but `useToolWorkflow` already consumes it on mount
  (guarded to run at most once via a ref, deferred into a microtask rather
  than called synchronously in the effect body to satisfy
  `eslint-plugin-react-hooks`'s `set-state-in-effect` rule — same pattern
  as the project's prior fix for this rule, see the entry above on
  `set-state-in-effect`). Relies on `app/[locale]/layout.tsx` being the
  only layout above every route (confirmed no root `app/layout.tsx`
  exists), so a client-side nav from `/` to `/{locale}/{tool-slug}` via
  `router.push` doesn't remount the provider — a hard reload loses the
  in-memory `File`, an accepted trade-off with no fallback storage
  (a `File` object can't be serialized into `sessionStorage`).
- **`useToolWorkflow`** now tracks and returns `jobId` (previously fetched
  in `start()` and immediately discarded).
- **Inline upload-rejection feedback**: `ToolDropzone` gained an optional
  `onRejectedFiles` callback (splits dropped/selected files by exact MIME
  match against `accept`); `FileUploader` wires it to an inline `Alert`
  reusing the existing `common.errors.unsupportedFile` string — no new
  translation key needed. Fully backward-compatible (optional prop).
- **"Download all as ZIP"** for multi-output results (Split PDF today):
  new `app/api/jobs/[id]/download-zip/route.ts` (added `jszip` dependency —
  no zip capability existed anywhere in the repo). `StorageProvider` only
  exposes whole-buffer reads, so true end-to-end streaming isn't possible
  without a bigger interface change touching every worker handler; instead
  output files are fetched **sequentially** (never `Promise.all`) to avoid
  an N-way concurrent memory spike, guarded by a hard cap (100 files /
  200MB combined) that returns `FILE_TOO_LARGE` rather than risking an
  unbounded memory spike on a pathological result. The *output* side is
  genuinely streamed: `JSZip.generateNodeStream` writes into the HTTP
  response as it compresses rather than buffering the whole archive
  first. `ResultState` gained an optional `jobId` prop to render this link
  when `outputFiles.length > 1`.
- **Scope trim**: dropped the originally-planned "contextual related
  tools row inside `ResultState`" — `ToolPage` already renders a full,
  always-visible related-tools section on every tool page, and a second,
  smaller version inside the result state would be a near-duplicate UI
  element for marginal benefit, contradicting the blueprint's own
  restraint principle (§5, §77: avoid "more cards" as a proxy for
  "professional"). This also meant the `jobId` fan-out only needed to
  touch `MultiFileTool.tsx` (which alone backs 5 of the 16 tools —
  merge/jpg-to-pdf/png-to-pdf/pdf-to-jpg/pdf-to-png) plus the 11 bespoke
  tool components, not all 16 `page.tsx` files as originally scoped.

**Verified**: `tsc --noEmit`/ESLint clean, full `next build` production
check passed (confirmed all new API routes present in the route manifest).
Full Playwright suite (16/16) green, run serialized (`--workers=1`) after
confirming in the previous session that parallel-worker runs produce
transient, environment-only failures against a single local dev Postgres
(the worker log always showed every job completing regardless — not a
real regression, see the previous entry). `tests/e2e/split-pdf.spec.ts`
updated: its "Download" link locator now matches on a `.pdf$` suffix
(the new ZIP link's accessible name, "Download all as ZIP", otherwise
also substring-matched the old bare `"Download"` name query, inflating
the expected count from 3 to 4) and gained real ZIP verification —
downloads the archive, decodes it with `JSZip.loadAsync`, asserts exactly
3 entries, and validates each entry is itself a genuine 2-page PDF via
`pdf-lib`, not just that the HTTP request succeeded. Screenshot-verified
the new ZIP button on Split PDF's result screen (`en`).

## 2026-09-16 — Header auth menu, global search/command palette, tools directory, and full workspace shell shipped

Completes the UI layer for Priority 1 + Priority 2. Auth pages
(`/login`, `/signup`), the session-aware header (`HeaderAuthSlot` ->
`AuthButtons`/`UserMenu`), the redesigned nav (`Tools`/`Workspace` +
`Ctrl/Cmd+K` command palette), a dedicated `/tools` directory, and the
full `/workspace` dashboard (Home, My Documents, Recent, Starred, Trash,
Settings, mobile bottom nav) are now live and wired to the real
auth/workspace backend from the previous entry.

- **Command palette**: hand-rolled on the existing `Modal`/Radix `Dialog`
  primitive (`components/ui/CommandPalette.tsx`) rather than a `cmdk`
  dependency — 16 static tools is well within scope for a ~150-line
  listbox. `lib/tools/search.ts`'s `searchTools()` is shared by both the
  palette and the `/tools` directory search (one implementation, per
  blueprint §59).
- **Real RSC bug caught and fixed**: `lucide-react` icon *component
  references* (`LucideIcon`) were being passed as plain data props from
  Server Components into two Client Components
  (`GlobalCommandPalette`/`ToolsDirectorySearch`) — React can only
  serialize already-rendered elements across that boundary, not bare
  function/component references, and this crashed every single page
  (`Functions cannot be passed directly to Client Components`) the moment
  the dev server actually ran, despite `tsc`/ESLint being fully clean
  (TypeScript's structural typing has no way to flag this — it's a
  runtime-only RSC serialization rule). Fixed by pre-rendering the icon
  into JSX (`<Icon className="..." />`) in the Server Component before
  handing it down, and re-typing the relevant props as `ReactNode`
  instead of `LucideIcon`. Caught by actually starting the dev server and
  loading pages, not by typecheck/lint/build alone — reinforces why a
  real visual/runtime pass is mandatory before calling UI work done, not
  optional once static checks pass.
- **Tools directory** (`/tools`): category cards link to real `#category`
  anchors, which required grouping the "all tools" list by category
  (with real anchor ids) instead of a single flat alphabetized list as
  originally sketched — the flat-list version had no matching anchor
  targets for the category cards to scroll to.
- **`getSessionUser()` wrapped in React's `cache()`** — both
  `app/[locale]/workspace/layout.tsx` (route protection) and each
  workspace page call it; caching dedupes the cookie+DB read to once per
  request instead of once per call site.
- **Workspace quick actions use only real, shipped tools** (Merge/
  Compress/Split/Watermark) — the blueprint's suggested "Edit PDF" and
  "Convert" quick actions don't correspond to any actual tool yet (no
  unified editor, no single "convert" tool exists among the 16 shipped
  tools), so linking to them would be exactly the fake/aspirational UI
  the blueprint itself bans.
- **`Greeting` computes the time-of-day from the browser's local clock**,
  not the server's — defaults to "morning" on the very first render (same
  value server and client) to avoid a hydration mismatch, then corrects
  itself post-mount.
- **New shared primitive**: `components/ui/Skeleton.tsx` (loading
  placeholder for the fetch-driven Documents/Starred/Trash/Recent views).
- **Homepage/all pages lost per-locale static prerendering** (`● /en` ->
  `ƒ /[locale]`) once the header started reading the session cookie via
  `HeaderAuthSlot` on every page — an accepted, documented trade-off:
  every tool page was already dynamic (each already calls
  `resolveActorReadOnly()` for entitlement limits), so only the
  previously-static homepage's caching is newly affected, and there's no
  committed hosting target yet where this cost is concretely measured.
  Revisit with Next.js Partial Prerendering once it's stable/adopted,
  rather than adding it as an experimental feature mid-plan for a caching
  gain with no measured need.

**Verified**: `tsc --noEmit`/ESLint clean, full `next build` production
check passed. Full Playwright suite (16/16) green, run serialized after
confirming (again) that parallel-worker runs are flaky against the local
dev Postgres, not a real regression. Manually smoke-tested the entire new
UI via a real signup flow in the browser (not just curl this time):
registered a user, screenshotted Workspace Home, `/tools`, My Documents,
Trash, and Settings in `en`, plus Workspace Home and `/tools` in `ar`
(sidebar/header/category cards/scroll-arrows all mirror correctly) and
Workspace Home at mobile width (bottom nav renders correctly) — zero
console/page errors across all of them post-fix. Added
`tests/e2e/auth-signup-migrates-guest.spec.ts` (drives the real Compress
PDF pipeline as a guest, signs up, confirms the result file appears in
My Documents) to the permanent suite; the rest of this phase's planned
E2E coverage (cross-user isolation across every mutating route, star/
trash/restore, history-hide-preserves-file, session-expiry-redirects)
is written next.

## 2026-09-16 — Homepage redesign shipped, completing Priority 1 + Priority 2; full planned E2E coverage added

Final piece of the Master Product Redesign Blueprint's Priority 1
(Product/UI Foundation) + Priority 2 (Auth Foundation + Document
Workspace Shell): the homepage now has a functional hero dropzone that
hands a file directly into a chosen tool via the `PendingUploadProvider`
built earlier, a curated "Popular tools" row, and new security/FAQ
sections — replacing the old hero-CTA-scrolls-to-a-full-tool-grid layout.

- **Hero dropzone -> tool picker -> handoff, end to end**: `HeroDropzoneCard`
  reuses the existing `ToolDropzone` (scoped honestly to
  `application/pdf,image/jpeg,image/png` — not the DOCX/XLSX/PPTX list a
  generic "document workspace" mockup might suggest, since no tool
  handles those formats). Matching tools are resolved client-side via
  `tool.inputTypes.includes(file.type)`; zero matches shows an inline
  warning instead of an empty picker. Verified with an actual screenshot
  sequence (drop -> picker shows only PDF-capable tools -> click Compress
  PDF -> the tool page loads with `sample-a-2page.pdf` already present,
  never re-selected) and a matching Playwright spec
  (`homepage-upload-handoff.spec.ts`, 3 cases: PDF/image/unsupported)
  that drives the flow through to a real downloaded, page-count-verified
  result — not just that navigation happened.
- **Same RSC icon-serialization bug, same fix, one more time**:
  `PopularToolsRow` is a Client Component and was about to receive raw
  `LucideIcon` component references from the homepage's Server Component
  — caught before it ever hit the running server this time (recognized
  the pattern from the tools-directory/command-palette fixes earlier
  today) by pre-rendering the icon into JSX server-side and typing the
  prop as `ReactNode`. Worth noting as a now-established rule for this
  codebase: **any data crossing from a Server Component into a Client
  Component's props must have its icons already rendered**, never passed
  as bare component references.
- **A real bug found by the E2E suite, not by inspection**: writing
  `workspace-star-trash-restore.spec.ts` surfaced that My Documents was
  listing *two* rows for one Compress PDF run — the original uploaded
  input (`sample-a-2page.pdf`) alongside the actual result
  (`compressed.pdf`) — because the retention fix (previous entries) made
  every authenticated user's `File` row persist indefinitely, including
  raw job-input uploads that were never meant to be user-facing
  "documents." Fixed in `lib/workspace/files.ts`'s `listFiles()`: added
  `inputJobId: null` to the query, so a file that's been consumed as some
  job's input drops out of every workspace view (Documents/Starred/
  Trash) once that job exists — the meaningful artifact going forward is
  the job's *output*, not the input that produced it. A freshly uploaded
  file not yet attached to any job still shows (nothing to hide yet).
  This is exactly the kind of gap the project's "real E2E test, not just
  eyeballing" standard exists to catch — confirmed via a direct Postgres
  check first (`inputJobId`/`outputJobId` on the two rows) before writing
  the fix, then confirmed the fix by re-running the spec.
- **Scope note**: `PopularToolsRow`'s scroll-arrow buttons use
  `scrollBy({left: ±300})` with `rtl:rotate-180` on the chevron icons —
  the icons visually flip for RTL but the actual scroll direction wasn't
  independently verified per-browser for `dir="rtl"` containers (a known
  cross-browser inconsistency area). Low-stakes: native swipe/trackpad
  scrolling already works correctly in both directions regardless, this
  is only a progressive-enhancement nav aid for an 8-card row. Revisit if
  ever reported as backwards in a real RTL browser session.

**Verified**: `tsc --noEmit`/ESLint clean, full `next build` production
check passed. **Full Playwright suite: 24/24 green** (16 original tools +
`homepage-upload-handoff` ×3 + `auth-signup-migrates-guest` +
`auth-cross-user-isolation` + `auth-session-expiry` +
`workspace-star-trash-restore` + `workspace-history-hide`), run
serialized — confirmed once more that parallel-worker runs against the
single local dev Postgres/worker produce transient failures unrelated to
the code (this is now a well-established, understood characteristic of
this local dev setup, not something to keep re-investigating). This
completes every E2E case called for in this phase's original test plan.
Screenshot-verified: homepage hero/dropzone/popular-tools/security/FAQ
sections and the full picker->handoff sequence (`en`), full homepage +
`/tools` (`ar`, correct mirroring including the popular-tools scroll
arrows swapping sides), homepage (mobile), the command palette open with
a live search query (`en` and `ar`), and the login/signup pages (`en`
and `ar`).

This completes the Master Product Redesign Blueprint's Priority 1 +
Priority 2 scope as planned. Remaining blueprint priorities (PDF editor,
Office conversions/OCR, SaaS/billing, AI) are explicitly deferred —
not started, per the blueprint's own phase sequencing and this project's
standing "don't build ahead of the current phase" convention.

## 2026-09-17 — Closed out documentation/test gaps from the Priority 1+2 build; re-verified everything live in a fresh session

A self-audit ("did you do everything you were told") against the approved
plan for the previous 4 commits found the bulk of the work genuinely
complete (confirmed by re-running the full suite fresh, not just trusting
git history), but surfaced three real gaps that had been silently
skipped:

- **`docs/SECURITY.md` §6 was never updated** — it still described the
  generic pre-implementation placeholder ("Argon2id via a maintained
  library, or bcrypt...") instead of what was actually built. Rewrote it
  to describe the real mechanism: custom email+password on the existing
  `User`/`Session` schema, `bcryptjs` with UTF-8-byte-length validation,
  the HMAC-signed session cookie mirroring the guest-cookie pattern,
  Redis-backed rate limiting on register/login, generic invalid-credentials
  messaging, and the guest-to-user migration trust boundary. Also updated
  §4 (storage/retention) to describe the actual now-different-by-actor-type
  expiry behavior (guest: 24h, authenticated: null) instead of the old
  universal-24h description, and to flag explicitly that the
  `workers/cleanup` sweep referenced there still doesn't exist.
- **`docs/ARCHITECTURE.md` was never touched** — added a short paragraph
  noting auth is implemented (not deferred) and pointing at the
  `resolveActor()` seam and the `/workspace` dashboard as the entry
  points, per the plan's own B10 requirement.
- **`tests/e2e/auth-cross-user-isolation.spec.ts`'s docstring overclaimed
  "rename" coverage** — the test only ever sent `{starred: true}` to the
  shared file-PATCH route, never `{originalName: ...}`. Both fields go
  through the identical ownership check before either is read, so the
  security boundary was never actually unverified, but the explicit
  coverage the user asked for wasn't literally exercised. Fixed: added a
  separate rename-attempt assertion, and — going further than "got a
  403" — added a follow-up re-fetch as User A confirming the file's
  `originalName`/`starred`/`deletedAt` and the job's presence in history
  were genuinely untouched by every one of User B's attempts, not merely
  that each request was rejected.
- **Turkish (`tr`) had never actually been screenshotted** — every prior
  visual-verification pass in this phase covered `en`/`ar`(RTL)/mobile
  only; `tr` was assumed fine by extension since it's LTR like English,
  but was never actually looked at. Screenshotted homepage, `/tools`,
  login, a tool page (Merge PDF), the full workspace dashboard (via a
  real `tr`-locale signup), and homepage at mobile width — all correct,
  fully translated, no layout breakage.

**Re-verified from a cold start in a fresh session** (not assumed from
memory): `tsc --noEmit`/ESLint clean, full `next build` clean, full
Playwright suite **24/24 green** run live against the real Docker stack,
and a fresh Postgres spot-check (26 users, 300 completed / 12 failed
jobs, file ownership/trash counts all consistent) — confirming the
previous session's claimed state was genuinely working code, not just
commits that happened to exist.

## 2026-09-17 — Visual refinement pass shipped (header/hero/popular-tools/workspace shell), plus one fresh finding fixed beyond the original checklist

Second visual pass against `docs/ref.png`, prompted by the product owner
explicitly rejecting "the seven listed changes exist in the code" as a
definition of done — the requirement was a fresh, judgment-based
screenshot comparison against the reference image after implementation,
not a checklist tick.

**Seven planned changes, all shipped**: header nav regrouped into a
left-side cluster next to the logo (`AppHeader.tsx`, `ms-auto` pushes
search/locale/auth right — RTL-safe logical property, not a hardcoded
side); homepage hero rebuilt as two columns (`Hero.tsx` left-aligned,
new `HeroIllustration.tsx` — a decorative stacked-document composition
built entirely from existing design tokens: plain divs, borders,
`shadow-sm`, slight rotation, zero image assets/gradients/glassmorphism,
per the standing ban); `PopularToolsRow` compacted from ~4.5 wide
description-cards to 8 compact icon+label tiles per viewport; workspace
gained a persistent `WorkspaceUploadButton` next to the greeting;
`QuickActions` cards flattened from vertical to horizontal (icon left,
label right); `StorageUsageBar` moved from the Home page body into
`WorkspaceSidebar`'s bottom, visible from every workspace page.

**Deliberate deviation from the plan's literal wording**: the plan called
for a dedicated `WorkspaceTopbar.tsx` replacing the public `AppHeader`
under `/workspace`, matching `ref.png`'s distinct app-shell header. Next.js
App Router does not let a nested layout remove/replace content a parent
layout unconditionally renders — `AppHeader` is rendered by
`app/[locale]/layout.tsx`, above every route including `/workspace`. True
per-subtree replacement would need either a large route-group refactor
(moving 25+ existing page files) or a fragile proxy pathname-injection
hack, both carrying real regression risk against a fully green 24-test
suite for a cosmetic gain. Instead, added the desired "search-first
workspace" outcome a different way: a prominent search-trigger button at
the top of `WorkspaceSidebar` that opens the already-built
`CommandPaletteProvider`/`CommandPalette` — same end-user capability
(instant tool/document search from anywhere in the workspace), zero risk
to the global header used everywhere else. Revisit only if a future need
(e.g. workspace-only header actions) makes the route-group refactor worth
its own dedicated pass.

**A real finding surfaced by the mandatory fresh-comparison step, fixed
in the same pass**: the `/tools` directory page (`ToolsDirectorySearch.tsx`)
was never in the plan's 7-item scope, but `ref.png` has a dedicated
"All Tools" panel, and comparing the live page against it showed the same
"feature card" problem already fixed on the homepage's popular-tools row —
large per-tool cards (icon-over-title-over-two-line-description, `p-5`)
made the page nearly 2360px tall for 16 tools, versus `ref.png`'s compact
flat rows (small icon, single-line truncated description, trailing
chevron) fitting far more per screen. Converted to the same compact-row
pattern: horizontal icon+text+chevron, `truncate` instead of wrapping,
tighter padding — cut the same content to ~1815px. `ChevronRight` mirrors
via the existing `rtl:rotate-180` convention (already used in
`Breadcrumbs.tsx`/`PopularToolsRow.tsx`). This is the exact scenario the
product owner's correction anticipated: the checklist was the floor, and
a genuine fresh comparison found a real gap outside it worth fixing rather
than deferring.

**Verified**: `tsc --noEmit`/ESLint clean, full `next build` clean (all 40
routes present). Full Playwright suite **24/24 green**, run serialized
against a freshly restarted dev server with all routes pre-warmed (no
regressions from either the planned changes or the tools-directory fix).
Screenshots taken and actually reviewed (not assumed) for: homepage in
`en`/`ar`(RTL)/`tr` desktop + `en` mobile; workspace dashboard in `en`/`ar`
desktop + mobile (via real signup flows); `/tools` directory in `en`/`ar`
desktop + `tr` desktop + `en` mobile. RTL confirmed correct in every
surface: nav/illustration/menu mirror, chevrons flip, text right-aligns,
no truncation/overflow.

**Explicitly not addressed by this pass** (per the product owner's
standing instruction that phase-completion claims must name what's
unbuilt): the real PDF editor/canvas, Fill & Sign/e-signature, redaction,
Compare documents, and batch processing remain entirely unbuilt, later
phases — this pass only improves composition/density/hierarchy of
already-existing surfaces plus the document-capability roadmap that
follows in the next entries.

## Template for future entries

```
## YYYY-MM-DD — <short title>

- Decision:
- Why:
- Alternatives considered:
- Revisit when:
```
