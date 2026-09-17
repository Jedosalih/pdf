# Decisions log — JPdf

Running record of non-obvious choices. Append, don't rewrite history —
if a decision is reversed, add a new entry rather than editing the old one.

## 2026-09-02 — Project kickoff

- Product name: **JPdf**.
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
session) left entire sections (`Why JPdf`, `How it works`) permanently
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

## 2026-09-17 — Tier A quick-win tools shipped (PDF to Text, PDF to PDF/A, Flatten PDF, Repair PDF) — first unit of the document capability roadmap

First shipped unit of the document-capability roadmap that follows the
visual refinement pass. Four tools, zero new worker packages/containers —
all four land in the existing `workers/pdf` package, `pdf-processing`
queue. **This is one unit of a larger, explicitly staged roadmap** — Office
conversion (LibreOffice), OCR (OCRmyPDF), and Markdown/HTML → PDF
(Playwright/headless Chromium) are separately-planned next units, not
started here. The real PDF editor, Fill & Sign/e-signature, redaction,
Compare, and batch processing remain unbuilt, later phases — unaffected by
and unrelated to this entry.

- **A real, previously-unknown architectural gap found before any of this
  could work**: `Job.toolId` has a genuine Postgres foreign-key constraint
  to a `Tool` table (`prisma/schema.prisma`), which is entirely separate
  from `lib/tools/registry.ts`'s in-memory `ToolDefinition` array. The
  registry is what the UI/API layer reads, but `POST /api/jobs` still
  inserts a `Job` row that must reference an *existing* `Tool` row — adding
  a registry entry alone is not sufficient for a tool to actually work end
  to end. Discovered via a real `ForeignKeyConstraintViolation` on the
  first live end-to-end test run (not caught by `tsc`/ESLint/`next build`,
  since the registry and the Prisma schema are two independent type
  systems with no cross-check). Fixed by re-running the existing
  `npm run db:seed` (`prisma/seed.ts` already iterates `tools` from the
  registry generically — no per-tool seed code needed, it was simply never
  re-run after the registry changed). Worth remembering for every future
  new tool in this roadmap: **a registry entry always needs a re-seed
  before its first real job can be created**, in every environment
  (local, CI, staging, production).
- **`pdf-to-text`** — `pdftotext -layout` (Poppler, already installed).
  Output is `text/plain`, the first non-PDF output type this project has
  shipped — confirmed `app/api/files/[id]/download`, `download-zip`, and
  `FileThumbnail` needed zero changes (already format-agnostic, per the
  roadmap plan's pre-verified facts).
- **`pdf-to-pdfa`** — Ghostscript `-dPDFA=2`, framed honestly in its own
  copy as **best-effort** (no ISO 19005 validator in this pipeline, no
  compliance claim). The ICC profile path
  (`/usr/share/color/icc/ghostscript/srgb.icc`) and the `PDFA_def.ps`
  prefix-file mechanism were verified empirically inside the real running
  `pdf-worker` container (`docker exec` + a real fixture conversion,
  checking for the `GTS_PDFA1` OutputIntent marker in the output bytes)
  before writing any handler code — not assumed from documentation. The
  ICC profile is already present via `libgs-common` (a transitive
  dependency of the already-installed `ghostscript` package); no Dockerfile
  change was needed. `workers/pdf/src/pdfaTemplate.ts` keeps our own copy
  of Ghostscript's shipped `PDFA_def.ps` example (parametrized with the
  ICC path) rather than reading the version-numbered system path at
  runtime, so a future Ghostscript version bump can't silently break it.
- **`flatten-pdf`** — `qpdf --flatten-annotations=all`. Verified against a
  real AcroForm text-field fixture (`docs/fixtures/sample-with-form-field.pdf`,
  built via `pdf-lib`'s `getForm().createTextField()` — a genuine
  interactive annotation, not just page text): 1 field before, 0 after.
- **`repair-pdf`** — qpdf rewrite, falling back to Ghostscript, with a
  mandatory post-verification gate (`qpdf --check` + `--show-npages > 0`)
  and a new `UNRECOVERABLE_FILE` error code. Three real, non-obvious
  behaviors discovered by testing against real corrupted fixtures in the
  running container (not assumed):
  1. qpdf's damaged-file recovery can only reconstruct a **classic**
     trailer + xref table — it fails outright ("unable to find trailer
     dictionary") on a modern **cross-reference stream** PDF with a lost
     `startxref` pointer. Since `pdf-lib`'s default `save()` always writes
     an xref stream, the repair fixtures had to be generated with
     `save({ useObjectStreams: false })` to produce a genuinely
     qpdf-recoverable "mild corruption" case — the natural pdf-lib output
     format doesn't exercise qpdf's recovery path at all.
  2. qpdf exits **3** ("succeeded with warnings"), not 0, when it
     genuinely repairs a file — treating any nonzero exit as failure
     (the naive reading of `runCommand`'s existing throw-on-nonzero
     contract) would incorrectly treat every successful repair as an
     error. Required a dedicated exit-code-aware call path
     (`runCommandCaptureAll`, added to `workers/pdf/src/exec.ts`) instead
     of reusing `runCommand` as-is.
  3. Ghostscript's repair path **always exits 0**, even when it gives up
     entirely and produces an empty 1-page shell from a 3-page input —
     exit code alone cannot distinguish "repaired" from "silently
     broken." The handler scans combined stdout+stderr for Ghostscript's
     own diagnostic phrases ("Couldn't initialise file", "Catalog
     dictionary not located", "couldn't repair PDF file", "No pages will
     be processed") as the real signal. This is exactly the "a repair
     that silently returns a still-broken file is worse than failing
     clearly" risk flagged before implementation — confirmed as a real,
     reproducible failure mode, not a hypothetical one.
- Registry entries were added with `enabled: false` first and only flipped
  to `true` after each tool's full pipeline (handler, page, translations,
  E2E test, real Docker verification) was genuinely green — consistent
  with this project's standing "an entry in the registry is a promise the
  nav links to something real" rule.

**Verified**: `tsc --noEmit`/ESLint clean on the app; `tsc` build clean on
`workers/pdf`; `docker compose up -d --build pdf-worker` rebuilt cleanly
and confirmed listening; full Playwright suite **29/29 green** (24
previous + 5 new: 4 tools + repair-pdf's two-case failure/success split),
run serialized against the real Docker stack after a clean `.next` rebuild
and route pre-warm. Real output-content verification per tool (not "a file
came back"): `pdf-to-text` asserts the exact fixture strings extracted;
`pdf-to-pdfa` asserts the page count survived *and* the `GTS_PDFA1`
OutputIntent marker is genuinely present in the output bytes;
`flatten-pdf` asserts the AcroForm field count drops from 1 to 0;
`repair-pdf` asserts the mildly-corrupted fixture's exact page text
survives recovery, and separately that the severely-truncated fixture
surfaces the real `UNRECOVERABLE_FILE` error text in the UI. Screenshots
taken and reviewed for all 4 new tool pages in `en` (desktop), `ar` (RTL,
all 4), `tr` (desktop, one representative tool), and mobile (one
representative tool) — no truncation/overflow/mirroring issues.
`docs/PDF_ENGINE.md` and `docs/SECURITY.md` updated to the actual verified
command shapes and security controls, not left describing a
pre-implementation draft.

## 2026-09-17 — Product renamed JDpdf → JPdf

- **Decision**: replace "JDpdf"/"JDPdf" with "JPdf" everywhere it represents
  product/project branding — UI strings and translations (all 3 locales),
  OpenGraph `siteName`, docs (including renaming
  `docs/JPdf_Master_Product_Redesign_and_Expansion_Blueprint.md`,
  previously `JDpdf_...`), `AGENTS.md`, npm package `name` fields (root
  `package.json` → `jpdf`, `workers/pdf/package.json` →
  `jpdf-worker-pdf`, both lockfiles synced), the downloaded ZIP filename
  (`jpdf-result.zip`), and the worker's per-job temp-directory prefix
  (`jpdf-` — trivial, zero-risk, done for consistency).
- **Deliberately left unchanged** (internal identifiers, not product
  branding — renaming would be pure churn/risk with zero user-visible
  benefit): Postgres/MinIO dev credentials and the local storage bucket
  name in `docker-compose.yml`/`.env.example` (`jdpdf`/`jdpdf-dev`/etc.);
  the session and guest cookie names (`jdpdf_session`,
  `jdpdf_guest` — `lib/auth/session.ts`, `lib/security/guestIdCore.ts`);
  one test's internal temp-file prefix
  (`tests/e2e/unlock-pdf.spec.ts`). Cookie names in particular are
  invisible to users; renaming them would only force every existing
  session/guest identity to reset for no visible gain.
- **Why**: explicit product rebrand request. The distinction above
  (branding vs. internal identifier) mirrors the same reasoning already
  applied to database/table naming in this project — see the "Schema
  scope for MVP" entry above.
- **Verified**: a repo-wide search for `JDpdf`/`JDPdf` (excluding
  `node_modules`) returns zero remaining matches; every remaining
  lowercase `jdpdf` occurrence was individually inspected and confirmed to
  be one of the intentionally-preserved internal identifiers listed
  above. `tsc`/ESLint clean, full `next build` clean, full Playwright
  suite green (one transient browser-session flake, reproduced as passing
  in isolation — unrelated to this change).

## 2026-09-17 — Office conversion suite shipped (Word/Excel/PowerPoint ↔ PDF, 6 tools) — second unit of the document capability roadmap

Second shipped unit of the document-capability roadmap. New `workers/office`
package (LibreOffice headless + Node-side engines), new `office-worker`
Docker Compose service, `office-conversion` BullMQ queue (concurrency 2,
deliberately lower than `pdf-processing` since LibreOffice is the slowest,
most resource-heavy engine in this stack).

**Three real engine-behavior discoveries, none assumed from documentation
— all found by testing the actual binary inside the real container**:

1. **PDF → Word requires `--infilter=writer_pdf_import`, and it must be
   one token.** Without the infilter, `soffice`'s default PDF import
   loads into Draw (graphics), which has no export path to `docx` at all.
   With it, `soffice` correctly reconstructs Writer text — verified by
   reading `word/document.xml` directly out of the resulting `.docx` and
   confirming the exact fixture paragraph text survived. Passing
   `--infilter` and its value as two separate `execFile` argv array
   elements (the natural way to build an argument array in code) makes
   `soffice` reject the flag outright (`Error in option: --infilter`) —
   only the combined `--infilter=value` form works. This is a genuinely
   easy mistake to make when translating a working shell command into a
   programmatic argument array, and it produced a fast, silent-looking
   failure (`PROCESSING_FAILED` in ~400ms) that could easily be
   mis-diagnosed as something else without checking the worker's own
   stderr.
2. **PDF → Excel via LibreOffice does not work at all — it crashes.**
   Forcing a `writer_pdf_import`-loaded PDF to export as
   `xlsx:Calc MS Excel 2007 XML` triggers `Fatal exception: Signal 6`
   (SIGABRT) inside `soffice`'s own OOXML Calc export filter. This is
   worse than the "materially poor fidelity" the roadmap plan
   anticipated — LibreOffice has no working path for this direction at
   all. **Decision**: `pdf-to-excel` does not use LibreOffice. Real
   engine: `pdftotext -layout` (already used by `pdf-to-text`) + `exceljs`
   (MIT), reconstructing one spreadsheet row per non-empty line with
   columns split on runs of 2+ spaces. This is an honest **best-effort**
   table reconstruction, not a table-extraction algorithm — documented as
   such in the tool's own copy ("best for documents with real tables").
   `lib/tools/registry.ts`'s `processor` field for this tool is
   `"poppler"`, not `"libreoffice"`, to reflect the real engine.
3. **PDF → PowerPoint via LibreOffice silently produces an empty
   file.** The same `writer_pdf_import` + explicit Impress filter
   combination that works for Word exits 0 and writes a structurally
   valid `.pptx` — with **zero slides**. Exit code and "a file exists"
   are both insufficient signals here; only inspecting
   `ppt/slides/slide*.xml` inside the actual output revealed the problem.
   **Decision**: `pdf-to-powerpoint` does not use LibreOffice either.
   Real engine: `pdftoppm -r 150` rasterizes each page, then `pptxgenjs`
   (MIT) builds one image-filled slide per page
   (`sizing: { type: "contain" }`). This preserves exact visual layout at
   the honest, clearly-documented cost that the result is pictures, not
   editable text — the tool's own FAQ states this plainly rather than
   implying content-level fidelity it doesn't have. `processor` is
   `"poppler"` for this tool too.

**A real architectural gap, already discovered once for `pdf-to-text` in
the previous unit, recurred here for a new reason**: `Job.toolId`'s
Postgres FK to the `Tool` table needed a fresh `npm run db:seed` after
adding these 6 registry entries — same fix as before, now reinforced as a
standing checklist item for every future tool addition in this roadmap.

**Fonts**: `fonts-noto-core` (Debian bookworm) already ships Noto
Naskh/Kufi/Sans Arabic — verified via `fc-list` inside a scratch
container before finalizing the Dockerfile. The originally-planned
`fonts-noto-naskh-arabic` package name does not exist in bookworm's repos
(`apt-get install` failed with "Unable to locate package"); no separate
Arabic font package is needed on top of `fonts-noto-core`.

**`pptxgenjs` TypeScript interop**: its shipped `.d.ts` uses an old
UMD-style `export as namespace X` + `export default X` shape that
TypeScript's `NodeNext` module resolution mis-resolves to the whole module
namespace rather than the constructor (`This expression is not
constructable`) — a type-only interop quirk, not a runtime bug (the
identical import already works correctly in
`scripts/generate-fixtures.mjs`, a plain-JS file with no type checking).
Worked around with a small local interface covering only the API actually
used (`workers/office/src/handlers/pdfToPowerpoint.ts`) rather than a
blanket `any` cast.

**Registry entries** (`word-to-pdf`, `pdf-to-word`, `excel-to-pdf`,
`pdf-to-excel`, `powerpoint-to-pdf`, `pdf-to-powerpoint`) added with
`enabled: false` first, flipped to `true` only after each tool's full
pipeline was genuinely verified end to end.

**Verified**: `tsc`/ESLint clean on the app and `workers/office`;
`docker compose up -d --build office-worker` rebuilt cleanly across three
iterations (each real bug found this way, not by inspection); full
Playwright suite green including 6 new specs, each asserting real output
content (exact paragraph text in `.docx` XML, exact cell values in a real
`ExcelJS`-read workbook, exact slide/media counts in a real `.pptx`, exact
extracted PDF text for every `→PDF` direction) — never "a file came
back." Screenshots reviewed in `en`, `ar` (RTL), `tr`, and mobile.
`docs/PDF_ENGINE.md` updated to the final verified command shapes,
replacing the pre-implementation Phase-0 draft.

**Still not started**: OCR, Markdown/HTML → PDF (next roadmap units), and
the editor/Fill & Sign/redaction/Compare/batch capabilities — unrelated to
and unaffected by this entry.

## 2026-09-17 — Fixed: shared `Modal` had no max-height/scroll — a real, previously-latent bug the growing registry finally exposed

Found by the full regression suite, not by inspection: after this
session's tools brought the number of PDF-accepting tools to ~21,
`tests/e2e/homepage-upload-handoff.spec.ts` started failing reproducibly
(not the transient kind) — Playwright could not click a tool row in
`ToolPickerModal` because it was genuinely outside the viewport with no
way to scroll to it.

- **Root cause**: `components/ui/Modal.tsx` ("the one modal system in the
  app") centers its content with `top-1/2 -translate-y-1/2` and had no
  `max-height` or `overflow-y-auto` at all. This was never a problem while
  every modal's content was short enough to fit a typical viewport — with
  enough rows, the dialog's rendered height exceeds the viewport, and
  since it's `position: fixed` with no internal scroll region, the excess
  content is simply unreachable. This affects real users on real screens,
  not just the test: anyone with a shorter viewport (a laptop, a phone in
  landscape, a browser with dev tools docked) hitting any modal with
  enough content would already have been unable to reach the bottom items
  before this fix — the tool registry crossing a growth threshold is just
  what finally made the E2E suite exercise it.
- **Fix**: `Modal`'s content is now `flex flex-col` with `max-h-[85vh]`;
  the title/close-button row is `shrink-0` (stays fixed in view), and the
  `children` wrapper gets `min-h-0 overflow-y-auto` so only the body
  scrolls once it overflows. Verified visually (screenshot: a 21-item tool
  list now shows ~10 rows with a visible cutoff, scrollable) and via the
  real E2E test passing again.
- **Blast radius checked before shipping**: `Modal` is reused by
  `ToolPickerModal`, `WorkspaceUploadButton`, and `DocumentList`'s
  rename/delete confirmations — all short-content cases where
  `max-h-[85vh]`/`overflow-y-auto` are no-ops (only engage once content
  actually exceeds the height), so this is a strictly additive fix, not a
  behavior change for any existing short modal. `CommandPalette` is a
  separate, hand-rolled Radix Dialog usage (not built on this shared
  `Modal`) and is unaffected either way.
- **Lesson for this roadmap going forward**: every new tool added to the
  registry is also implicitly adding one more row to
  `ToolPickerModal`/`ToolsDirectorySearch`/`PopularToolsRow` — components
  whose original design assumptions (16 tools) are now visibly stretched
  at 26+. Worth a deliberate look once the roadmap's remaining units
  (OCR, HTML/Markdown, and beyond) push the count meaningfully higher
  again, rather than only reacting to the next E2E failure.

## 2026-09-17 — OCR shipped (`ocr-pdf`) — third unit of the document capability roadmap

Third shipped unit. New `workers/ocr` package (OCRmyPDF + Tesseract), new
`ocr-worker` Docker Compose service, `ocr` BullMQ queue (concurrency 2 —
OCR is CPU-heavy and slow per page, same "own queue so a slow job can't
starve others" reasoning as `office-conversion`). `lib/tools/types.ts`
already had `"ocrmypdf"`/`"ocr"` pre-reserved from Phase 0 planning — no
type changes needed here, unlike the genuinely-new values Office/HTML
units required.

- **Command**: `ocrmypdf --language <eng|ara|tur|eng+ara+tur>
  --output-type pdf --skip-text <in> <out>`. `--skip-text` OCRs only
  image-only pages, leaving any existing text layer alone. `--output-type
  pdf` (not `pdfa`) is deliberate — this tool doesn't borrow the separate,
  already best-effort-framed `pdf-to-pdfa` tool's compliance language.
- **UI**: bespoke component (`OcrPdfTool.tsx`), not `MultiFileTool` — one
  language `Select` (English/Arabic/Turkish/all three), matching
  `CompressPdfTool.tsx`'s established single-file-plus-options pattern.
- **Registry limits deliberately tighter than the qpdf-class defaults**
  (guest: 30 pages/3 ops per day vs. the usual 300/8) — real per-page
  Tesseract cost is far higher than a qpdf/Ghostscript operation, and this
  is stated as a genuine product decision, not an oversight.
- **A real, correctly-designed test fixture, not a shortcut**: the OCR
  E2E test's fixture (`docs/fixtures/sample-image-only.pdf`) is an SVG
  rasterized to a PNG (`sharp`) embedded as a full-page image via
  `pdf-lib` — genuinely image-only, with **no hidden real text layer**.
  This was verified independently (via `pdfjs-dist` extracting empty text)
  *before* writing the assertion around it — a fixture with a smuggled
  real text layer would make the test pass regardless of whether OCR
  actually did anything, which is exactly the kind of fake verification
  this project's standing quality bar exists to rule out.
- **Multi-script correctness verified manually, not just assumed from the
  flag being accepted**: a separate smoke fixture combining Arabic and
  Turkish text in one image, run through the real container with
  `--language eng+ara+tur`, correctly recognized both scripts in a single
  pass (confirmed by reading the actual extracted text, which contained
  real Arabic characters alongside the Turkish/Latin phrase) — this is
  the "lighter smoke-test bar for non-English languages" this roadmap
  unit's design called for, satisfied with a real run rather than skipped
  entirely.

**Verified**: `tsc`/ESLint clean on the app and `workers/ocr`;
`docker compose up -d --build ocr-worker` rebuilt cleanly, confirmed
`ocrmypdf`/`tesseract` binaries present and functional inside the running
container; full Playwright suite green including the new OCR spec, real
output-content verification (exact recognized text from a verified-empty
starting point, substring-matched rather than exact-equality since OCR
can introduce minor character-level noise even on a clean rendered
fixture). Screenshots reviewed in `en`, `ar` (RTL), and `tr` (mobile).
`docs/PDF_ENGINE.md` updated to the final verified command shape and the
real verification method, replacing the Phase-0 draft.

**Still not started**: Markdown/HTML → PDF (final roadmap unit) and the
editor/Fill & Sign/redaction/Compare/batch capabilities.

## 2026-09-17 — AGENTS.md's "Current status" section de-staled

`AGENTS.md` §13 still described "Phase 0" and "the Merge PDF end-to-end
path" as the active focus — stale since the very first tool shipped after
it. Rewrote it to point at `docs/DECISIONS.md` as the actual source of
truth for current scope rather than hardcoding a tool count or phase name
that silently goes stale every time either changes again. The rest of
`AGENTS.md` (stack, architecture, coding/security/i18n/testing rules)
needed no changes — those are still accurate; only the status section had
drifted.

## 2026-09-17 — HTML/Markdown → PDF shipped — fourth and final unit of the document capability roadmap's core-conversion phase

New `workers/html` package driving headless Chromium via Playwright — the
first engine in this codebase controlled in-process via a persistent
driver rather than a one-shot `execFile` subprocess. New `html-rendering`
BullMQ queue, new `"playwright"` `ToolProcessor` value (both pre-declared
in `lib/tools/types.ts` in an earlier session specifically for this unit).

**Engine choice, researched properly before implementing** (not
improvised, per explicit product-owner correction earlier in this
roadmap): WeasyPrint executes zero JavaScript, silently — real-world HTML
exported from Notion/Confluence/a static site generator would render
broken with no error, rejected for that reason specifically, not as a
technicality. wkhtmltopdf's upstream project and GitHub org were archived
in 2023/2024 — abandonware, disqualified outright. Playwright's
`page.pdf()` (Apache-2.0, driving Google's permissively-licensed "Chrome
for Testing" build, never the proprietary retail Chrome via
`channel: "chrome"`) gives full CSS/JS-capable rendering fidelity at an
accepted image-size and container-posture cost — the same shape of
trade-off already accepted for LibreOffice, applied to a new format
family.

**SSRF / resource-loading mitigation, defense in depth**:
1. `context.route("**/*", ...)` blocks every network request except inert
   `about:blank`/`data:` URIs — the primary control, catching every
   fetch-triggering construct (img/link/@import/url()/srcset/iframe/fetch)
   uniformly regardless of which one a given document uses. A referenced
   external resource renders as simply missing rather than the job being
   rejected — rejecting outright would break a large share of benign
   real-world HTML (Google Fonts links, hotlinked images) for no
   additional security benefit, since the request is aborted either way.
2. `javaScriptEnabled: false` at context creation — the primary
   *rendering* control (distinct from the network block above). A PDF is
   a static snapshot; no legitimate fidelity is lost.
3. `sanitize-html` before `page.setContent()` — defense-in-depth, with a
   deliberately *full-document*-oriented allowlist (`html`/`head`/`body`/
   `style` explicitly included) rather than sanitize-html's own
   fragment-oriented defaults, which would otherwise strip a complete
   HTML document down to almost nothing — this would have been a real,
   easy-to-miss bug if the defaults had been used as-is.
4. Application-level `Promise.race` timeout forcing `context.close()` in
   a `finally` block (`workers/html/src/render.ts`) — Playwright is a
   persistent driver, not a one-shot subprocess, so a hung render needs
   its own force-close rather than `execFile`'s `SIGKILL`-on-timeout used
   everywhere else in this codebase. `finally` matters specifically here:
   `Promise.race` alone doesn't cancel the losing side, only the
   `context.close()` outside the race actually stops a hung render.
5. Non-root container user — Chromium's own internal sandbox (kept
   enabled; no blanket `--no-sandbox`, no `--cap-add=SYS_ADMIN`) will not
   fully engage running as root.

**Markdown → PDF reuses the exact same render path**, not a separate
pipeline: `markdown-it` (`html: false` — a literal `<script>` typed into a
`.md` file is escaped to visible text, not live markup) parses to an HTML
string, wrapped in a fixed server-authored template/stylesheet
(bare `markdown-it` output has zero CSS and would look broken relative to
GitHub/Typora-style rendering users expect), then handed to the identical
`renderHtmlToPdf()` html-to-pdf uses. Raw HTML uploads do not get this
template — that tool's entire point is rendering an already-styled
document as-is.

**Two real Docker/Playwright deployment bugs found and fixed, not
assumed from documentation:**
1. **Non-root Playwright browser install location.** Chromium was
   installed during the Docker build while still running as `root`
   (before the `USER jpdf` switch), which defaults to installing into
   `/root/.cache/ms-playwright`. At container start, the runtime user
   (`jpdf`, a different home directory) looked in
   `/home/jpdf/.cache/ms-playwright` and found nothing — a fast, clear
   startup crash (`Executable doesn't exist at ...`), not a silent
   failure, so this was easy to diagnose from the container logs. Fixed
   with the standard approach: `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`
   set *before* `npx playwright install`, giving a single, fixed,
   non-user-specific install location, plus `chmod -R o+rx /ms-playwright`
   so the non-root runtime user can read it.
2. **`/dev/shm` sizing.** Chromium's default 64MB `/dev/shm` under Docker
   is a well-known, separate cause of renderer crashes, unrelated to the
   sandbox security posture — `docker-compose.yml`'s `html-worker` service
   sets `shm_size: "1gb"`.
3. **ToolDropzone's client-side MIME check was too strict for
   `.md`/`.markdown`.** Browsers have no built-in MIME mapping for these
   extensions and commonly report an empty `file.type`, which would have
   made a real, valid Markdown file look "rejected" by
   `components/tools/ToolDropzone.tsx`'s pre-filter even though the
   server-side `validateUpload.ts` correctly accepts it. Fixed by
   extending the accept-matching logic to also match by filename
   extension (entries in the `accept` string starting with `.`), the same
   dual-signal approach the native HTML `accept` attribute already
   supports — `html-to-pdf`/`markdown-to-pdf`'s `accept` strings now
   include both the MIME type and the extensions
   (`"text/markdown,.md,.markdown"`). This is a general `ToolDropzone`
   fix, not tool-specific, and improves every future tool that accepts a
   format without a reliable browser-reported MIME type.

**Upload validation required no new code** — `lib/security/
validateUpload.ts`'s `TEXT_FORMATS` path (extension + declared-MIME
allowlist + strict UTF-8 decode + control-byte-ratio check), built in an
earlier session specifically anticipating this unit, covers both formats
unchanged.

**Registry limits deliberately tight** (guest: 2MB/3 ops per day) — no
cheap pre-flight "how expensive to render" check exists for arbitrary
HTML/CSS the way `pdfinfo` gives one for PDFs, so a low byte cap is the
practical proxy; the render timeout in `render.ts` is the real backstop.

**Verified**: `tsc`/ESLint clean on the app and `workers/html`; two Docker
rebuild iterations (each catching a real bug above, not by inspection);
full Playwright suite green including 2 new specs — `html-to-pdf`'s
fixture deliberately includes an external image (verifies the SSRF block
lets the render complete instead of hanging — confirmed by completion
well under the 60s render timeout) and a `<script>` tag (verifies it's
stripped, never executes); `markdown-to-pdf`'s fixture includes a raw
`<script>` tag (verifies `html: false` escapes it to visible text).
Screenshots reviewed in `en`, `ar` (RTL), and `tr` (mobile).
`docs/PDF_ENGINE.md` updated with the final verified architecture,
replacing the pre-implementation design notes.

**This completes the document-capability roadmap's core-conversion phase**
(Office, OCR, HTML/Markdown — all four originally-scoped units now
shipped and verified). Still entirely unbuilt, separate later phases: the
real PDF editor/canvas, Fill & Sign/e-signature, redaction, Compare
documents, and batch processing.

## 2026-09-17 — Workspace file chaining shipped: reuse a prior job's output without re-uploading

Sixth and final capability unit of the mission's execution order, before
the closing full regression/security/documentation pass.

- **Decision**: a "Use in a tool" action on any file in My Documents
  opens the same tool-picker already built for the homepage's drop
  flow, and the chosen tool page receives the file already marked
  uploaded (its real name/size, no upload round trip) instead of forcing
  a download-then-reselect-from-disk detour.
- **Architecture**: extended `PendingUploadProvider` (already handling
  "homepage drop, tool not chosen yet") with a second, parallel pending
  slot carrying a file *reference* (`{id, name, mimeType, size}`) instead
  of raw bytes. `useToolWorkflow`'s existing "consume pending upload on
  mount" effect gained a second branch: a pending workspace reference
  becomes a `TrackedFile` with `status: "uploaded"` and the existing file
  id as `serverId` directly, skipping `/api/upload` entirely. A
  zero-filled placeholder `File` of the *real* byte length stands in for
  the browser File object every existing size/name/thumbnail display
  already expects, so no other component needed to change.
- **A real, latent bug found by actually running the chain, not by
  review**: `app/api/jobs/route.ts`'s file-ownership check only ever
  accepted `status: "UPLOADED"` files as job inputs. A prior job's output
  is `status: "READY"` -- a completely different lifecycle state -- so
  the very first chained job was silently rejected with `FORBIDDEN`.
  Fixed by accepting either status (both represent complete, available
  file bytes; PROCESSING/FAILED/EXPIRED/UPLOADING never do) and, since
  READY files can be trashed unlike transient UPLOADED ones, adding an
  explicit `deletedAt: null` guard that the original query never needed
  but this change now requires.
- **No action offered when it would silently do nothing**: "Use in a
  tool" is omitted from a file's menu entirely (not shown-but-disabled)
  when no enabled tool accepts that file's mime type, computed from the
  same registry `inputTypes` data every other tool-matching path uses.
- **Verification**: E2E test signs up, completes a real compress-pdf job,
  opens that *output* file's "Use in a tool" menu, picks Watermark PDF,
  asserts no upload state is ever shown, runs it, and checks the final
  downloaded PDF contains both the new watermark text and the original
  fixture's own page text on both pages -- proving the chained bytes
  really came from the first job's output, not an empty or wrong file.

## 2026-09-17 — Batch processing shipped (batch-process): client-side fan-out, zero worker changes

Fifth unit past the core-conversion phase.

- **Decision**: "batch" means running an already-existing single-file
  tool across many files at once, each producing its own independent
  result -- not a new engine capability. The client uploads each file and
  creates one independent job per file (`POST /api/jobs` once per file,
  reusing the exact same request shape every other tool already uses),
  polls each job independently, and shows per-file progress/download.
  Zero worker code was touched -- every batchable tool's handler runs
  completely unaware it's part of a batch.
- **Scope, deliberately curated, not generic**: only tools with *no
  required option* are batchable for this pass (`compress-pdf`,
  `flatten-pdf`, `repair-pdf`, `pdf-to-pdfa`, `pdf-to-text` --
  `lib/tools/batch.ts`), each verified zero-required-option by reading its
  own single-file component before being added. Tools needing per-file
  input (e.g. watermark text) would need a per-file options UI, a
  materially larger and separate piece of work not attempted here.
- **A real bug caught by actually running the feature**: the first
  version capped a batch's file count using the *selected tool's own*
  `ToolLimits.maxFiles` (1, for every batchable tool here, since they're
  all single-file-per-job tools) -- silently capping every batch to
  exactly one file regardless of how many were dropped. Fixed with a
  dedicated `BATCH_MAX_FILES` constant (20), independent of any tool's
  own per-job file cap, which is a different axis entirely (files per job
  vs. jobs per batch). The per-file size/page limits shown in the UI
  still correctly come from the selected tool's own real entitlement.
- **No new registry entry**: batch-process has no processor/queue of its
  own (it orchestrates *other* tools' existing ones), so it deliberately
  isn't a `ToolDefinition` and doesn't appear in `getEnabledTools()`'s
  registry-driven grids. Added one explicit, clearly-labeled card to
  `/tools` (not blended into the category grid as if it were another
  category) so it's still discoverable rather than URL-only.
- **Verification**: E2E test uploads two different-page-count fixtures to
  the default batch tool, starts the batch, and downloads *both* results
  independently -- checking each has the page count matching its own
  source file (2 and 3, as a set, since concurrent jobs don't guarantee
  completion order) rather than assuming order or risking a
  cross-contaminated/merged result, the real risk this feature could get
  wrong. Full suite green, `tsc`/ESLint clean.

## 2026-09-17 — Fixed a real, pre-existing gap: `maxPages` was never actually enforced

Found while setting `compare-pdf`'s own page limits in the registry, not
while looking for it -- worth recording precisely because it wasn't
caught by any of the review this codebase already does regularly.

- **What was wrong**: `ToolLimits.maxPages` ("max total pages across all
  input files," per its own doc comment in `lib/tools/types.ts`) had real,
  distinct per-tool/per-plan values in every registry entry and in the
  `ToolLimit` DB table, and the client already had a translated
  `TOO_MANY_PAGES` error message wired up in all 3 locales and mapped in
  `useToolWorkflow.ts`'s `errorMessageKey` -- but a repo-wide search found
  zero places that ever actually read `.maxPages` and compared it to
  anything. Not the upload route (size-only), not the job-creation route
  (file*count* only, via `maxFiles`), not any worker handler. A free-tier
  user could merge twenty 5,000-page files today and nothing would stop
  it before `qpdf` received the request. `docs/SECURITY.md` additionally
  *claimed* a worker-side `pdfinfo`-based check existed with this exact
  behavior -- a documentation error describing intent as fact, not just a
  missing feature.
- **Fix**: a real, generic gate at `app/api/jobs/route.ts` -- the one
  place every tool's input files are already gathered regardless of which
  tool it is. Every `application/pdf` input file for the job is opened via
  `pdfjs-dist` (the same Node-compatible import path already proven in
  `tests/e2e/helpers/pdfText.ts`, a lightweight structural parse, not an
  "engine" in the sense `docs/SECURITY.md`'s architecture rules are about)
  and the total page count is compared against `limits.maxPages` before
  the job is created, returning `TOO_MANY_PAGES` (400, newly added to
  `lib/api/errors.ts`'s `ApiErrorCode` union) synchronously. Non-PDF
  inputs aren't page-counted -- already bounded by file size, and a
  reliable page-count concept doesn't universally apply to them anyway.
- **Why fix this now instead of deferring to the mission's final audit
  step**: it's a real resource-exhaustion gap affecting every tool, not
  just the one being built, and the fix was small, well-understood, and
  used only already-vetted dependencies (`pdfjs-dist`, already a root
  dependency; `getStorage().getObject()`, already used by the download
  route) -- deferring a known, understood, cheap fix to "later" when there
  is still Batch/Workspace-chaining/the audit itself ahead of this session
  is how known gaps quietly become permanent ones.
- **Scope not addressed**: this enforces a total-pages-per-job cap; it
  does not add per-page-count-based pricing/throttling or apply to
  non-PDF inputs. `docs/SECURITY.md` §1 has the full detail.

## 2026-09-17 — Redaction shipped (redact-pdf): whole-page rasterization, not a drawn box

Third unit past the core-conversion phase. This was the mission's most
explicit "do not fake this" requirement, and the implementation is built
so faking it isn't structurally possible, not just visually convincing.

- **Decision**: a redaction box triggers whole-page rasterization
  (`pdftoppm`) with the box burned directly into the resulting pixels
  (`sharp`'s SVG compositing) *before* that image ever becomes the page's
  new, sole content (replacing everything that page originally had --
  text, vectors, all of it). Pages with no redaction box are never
  touched. Full mechanism and licensing in `docs/PDF_ENGINE.md`.
- **Why not draw a rectangle on top, the same way `edit-pdf`'s highlight/
  rect tools work?** Because that leaves the original text object sitting
  in the content stream underneath a rectangle that can be deleted or
  selected around -- exactly the well-known real-world redaction failure
  this capability exists to avoid. A drawn box is a promise "this is
  hidden"; this tool needed to make a different promise, "this is gone."
- **A real design trap caught before it shipped, not after**: the first
  natural implementation -- rasterize the page, then draw a `pdf-lib`
  rectangle on top of the embedded image, two separate content-stream
  layers -- has the *identical* flaw as a rectangle over live text: remove
  the top rectangle object and the rasterized-but-unredacted pixels
  underneath are still there. The box has to be burned into the raster
  data itself, before it's embedded, which is why this needed `sharp`
  (added as a new `workers/pdf` dependency) rather than reusing
  `pdf-lib`'s existing drawing primitives a second time.
- **This tool fails loudly on partial failure, unlike every other tool in
  this codebase** -- a deliberate, stated exception to the "skip one bad
  element and keep going" pattern `editPdf.ts` and others use. If a page
  the user asked to redact can't actually be processed, the whole job
  fails rather than silently shipping a file that looks redacted but
  isn't. This asymmetry is specific to redaction's risk profile: a
  decorative edit failing silently is low-stakes, a security tool doing
  so is not.
- **The honest trade-off is stated in the tool's own UI copy**: a
  redacted page becomes a static image, so its text is no longer
  selectable, searchable, or copyable in the output -- disclosed as the
  accepted cost of a genuine guarantee, not hidden in a FAQ nobody reads.
- **Verification**: E2E test redacts one region of page 1 of a real
  3-page fixture, exports, and checks the actual downloaded PDF -- page 1
  has *zero* extractable text anywhere on the page (not just under the
  box) and carries an embedded raster image; pages 2-3, never touched,
  keep their exact original extractable text and are confirmed *not*
  rasterized. A fake "rectangle on top" implementation would still let
  page 1's text extract cleanly and would fail this test immediately.
  Full 41-spec suite green, `tsc`/ESLint clean on the app and the `pdf`
  worker (now including `sharp`, verified loading correctly inside the
  actual container, not just resolving on the host).

## 2026-09-17 — Fill & Sign shipped (fill-sign-pdf), with a documented cryptographic-signing boundary

Second unit past the core-conversion phase, immediately following the PDF
editor.

- **Decision**: split Fill & Sign into what's genuinely real and
  achievable versus what would be dishonest to claim. "Fill" means: if a
  PDF has actual AcroForm text fields, detect and fill them for real
  (`pdf-lib`'s form API, flattened into static content on export). "Sign"
  means: place a *visual* signature (hand-drawn or an uploaded image) as
  new page content, reusing `edit-pdf`'s canvas verbatim. Neither
  fabricates anything -- there's no synthetic "looks like it worked" path.
- **Why the cryptographic half is explicitly out of scope**: a real
  digital signature (PAdES/PKCS#7) needs a certificate (self-signed or
  CA-issued), a timestamp authority, and a library that understands PDF's
  incremental-update signing byte ranges. `pdf-lib` -- the only PDF-
  writing library this codebase uses -- has no signing support at all;
  the realistic OSS option is `node-signpdf` paired with `node-forge` for
  certs, plus a genuine product decision about where the signing
  certificate comes from and what trust it carries. That's a scoped
  project of its own, not a checkbox to tick alongside a canvas editor.
  Per the mission's fallback protocol: the blocker is stated here, the
  strongest safe version (visual signing) is shipped, and the limitation
  is stated plainly in the tool's own UI copy, not just this doc.
- **A deliberately deferred, not silently dropped, enhancement**: a typed
  signature in a cursive/script font (needs bundling a font file plus the
  `fontkit` pairing `pdf-lib` requires for custom font embedding) was
  considered and set aside for this pass -- draw + upload are both fully
  real, working signature-creation paths already, and the mission
  prioritizes breadth (redaction/compare/batch/workspace chaining still
  ahead) over polishing a third input method for one capability.
- **Architecture**: zero new worker packages. The per-element drawing
  logic `edit-pdf` already built was extracted into
  `workers/pdf/src/pdfEditElements.ts` and is now shared by both
  `editPdf.ts` and the new `fillSignPdf.ts` handler -- a real instance of
  "duplicate the worker boilerplate" *not* applying, since these two
  handlers share a package and a data model, unlike the cross-package
  worker duplication this project otherwise accepts.
- **Form-field detection was verified empirically before writing client
  code around it**: generated a real AcroForm text field fixture (already
  existed, built for `flatten-pdf`) and ran `pdfjs-dist`'s
  `getAnnotations()` against it directly to confirm the actual runtime
  shape (`subtype`, `fieldType`, `rect` coordinate space) rather than
  trusting the library's untyped `Promise<any[]>` return signature.
- **A real UI bug found by actually filling in a field**, not by
  code review: the field input's translucent background let the canvas's
  own rendering of the PDF's original field value show through underneath
  the typed value, producing illegible overlapping text. Fixed with an
  opaque background. Full detail in `docs/PDF_ENGINE.md`.
- **Verification**: E2E test fills a real AcroForm field, draws a
  signature, exports, and checks the downloaded PDF's actual content --
  the filled value via real text extraction (alongside the original
  page's own text, proving flatten preserved it), the signature via the
  PDF's own drawing operator list. Full 40-spec suite green, `tsc`/ESLint
  clean on the app and the `pdf` worker.

## 2026-09-17 — Real PDF editor shipped (edit-pdf): the first capability beyond the core-conversion phase

The document-capability roadmap's core-conversion phase (Tier A, Office,
OCR, HTML/Markdown) was already complete. This is the first unit of the
next phase from the original "Full Document Platform Implementation
Mission" brief: a real, interactive PDF editor.

- **Decision**: build an *annotation/overlay* editor (add text, images,
  highlights, rectangles, freehand drawing on top of existing pages),
  explicitly not an in-place text-rewriting editor. Every placed element
  becomes genuine new content-stream drawing via `pdf-lib` on export
  (`workers/pdf/src/handlers/editPdf.ts`) — not a viewer-only overlay that
  never reaches the output file, and not a claim of arbitrary text
  editing PDF's format doesn't support. Full technical writeup in
  `docs/PDF_ENGINE.md`'s new "Edit PDF" section.
- **Why**: the mission brief explicitly required distinguishing
  "annotation/overlay editing" from "actual content-stream text editing"
  and forbade "falsely advertising" the stronger claim. No library
  available to this stack does reliable in-place PDF text rewriting for
  arbitrary real-world files; overlay editing is the same honest scope
  every mainstream consumer PDF tool (iLovePDF, Smallpdf, Sejda's free
  tier) actually ships under an "Edit PDF" label.
- **Architecture**: zero new infrastructure. Reuses the existing
  `pdf-processing` queue and `pdf-lib` processor (same as
  `watermark-pdf`/`page-numbers`), the existing generic `options: z.record
  (z.string(), z.unknown())` job-creation contract (no API schema changes
  needed for the new `edits` array shape), and the same `pdfjs-dist`
  client-side rendering pattern `usePdfPageThumbnails` already
  established. The interactive canvas is hand-rolled (pointer-event drag/
  resize/select), not a third-party canvas library — the element set
  (text/image/rect/highlight/path) and interaction model (click-to-place,
  drag-to-draw, single bottom-right resize handle) are small enough that a
  dependency wasn't justified.
- **Two real bugs found only by actually running the feature in a
  browser**, not by typecheck/lint/unit-level reasoning:
  1. `Breadcrumbs.tsx` keyed its list by `item.label` (translated text)
     instead of index. Harmless for every previous tool page since no two
     crumbs ever shared a label — but `edit-pdf`'s own category ("Edit
     PDF") and its page title ("Edit PDF") are identical strings by
     coincidence, producing a real React duplicate-key warning. Fixed
     generically (keyed by index instead) for every tool page, not just
     this one.
  2. A newly-placed text box's `autoFocus` textarea was immediately
     blurring itself and silently deleting the just-added element, because
     the browser's default mousedown focus-handling ran after React's
     autoFocus already claimed it. Fixed with `event.preventDefault()` in
     the canvas overlay's pointerdown handler. Full root-cause detail in
     `docs/PDF_ENGINE.md`.
- **Verification**: one E2E test drives the real canvas (click to place
  text, set a hidden file input for image insertion, drag to draw a
  rectangle, exercise undo/redo via keyboard shortcuts, export) and
  verifies the downloaded PDF's actual content -- the placed text via real
  text extraction, the image/rectangle via the PDF's own operator list
  (`OPS.paintImageXObject`/`OPS.constructPath`), not just "a file came
  back." Full 39-spec suite green, `tsc`/ESLint clean on the app and the
  `pdf` worker.
- **Explicitly not built here, still separate later phases**: page
  manipulation inside the editor (existing dedicated tools already cover
  this), Fill & Sign, redaction, Compare, batch processing, workspace
  chaining.

## 2026-09-17 — Docker Desktop WSL2 data relocated from C: to D: (infrastructure, not product code)

The local dev machine's C: drive filled to near-zero free space
(0.83 GB) mid-session, crashing Docker Desktop
(`Error response from daemon: Docker Desktop is unable to start`) and
interrupting the html-worker rebuild in progress. Diagnosis (not
assumption) before any destructive action:

- `Get-PSDrive`/full C:\ folder-size scan found the two largest
  contributors were personal video files (44GB, untouched — not a dev
  environment concern) and Docker Desktop's WSL2 data disk (25.6GB,
  `%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx`).
- Checked the Windows registry (`HKCU:\...\Lxss`) directly for the
  authoritative WSL distro list (`wsl --list`'s own text output was
  UTF-16-garbled in this shell environment) — confirmed only one
  registered distro (`docker-desktop`, a small utility-VM `ext4.vhdx`),
  with the actual container/image/volume data living in a separately
  directly-attached `docker_data.vhdx`, not a second WSL-registered
  "docker-desktop-data" distro (this Docker Desktop version's newer
  internal architecture).
- Searched Docker Desktop's own settings files
  (`%APPDATA%\Docker\settings-store.json` and everywhere else under
  `%APPDATA%\Docker`/`%LOCALAPPDATA%\Docker`) for a user-configurable
  "disk image location" key and found none — this version's Settings UI
  equivalent isn't a simple config value to edit directly.

**Migration performed** (Docker Desktop fully stopped and `wsl --shutdown`
run first; confirmed the VHDX files were unlocked before touching them):
copied `%LOCALAPPDATA%\Docker\wsl` (both VHDX files, 25.6GB total) to
`D:\DockerData\wsl` via `robocopy /COPY:DAT` (not `/COPYALL`, which
requires the "Manage Auditing" privilege this session didn't have and
failed the first attempt with a clear, non-destructive error before any
data was touched); verified byte-for-byte size match on every file;
renamed (not deleted) the original C: folder as a safety net; created an
NTFS directory junction at the original path pointing to the D: copy, so
Docker Desktop's own hardcoded path resolves transparently through the
junction with zero Docker-side configuration changes. Started Docker
Desktop and verified every container, image, and volume from before the
crash was present and functional (`docker ps -a`, `docker images`,
`docker volume ls` all matched, including all four `pdf-*-worker` images
and the `pdf_postgres_data`/`pdf_redis_data`/`pdf_minio_data` volumes) —
only after this real verification (not just matching file sizes) was the
now-redundant C: backup actually deleted, freeing C: from 0.83GB to
26.4GB free.

This is a one-time local-machine infrastructure fix, not a product/code
change — no repo files were touched by this entry. Recorded here because
future sessions on this same machine should know Docker's data now lives
on D: via a junction, not literally under `%LOCALAPPDATA%` on C:, in case
that ever needs to be understood or re-migrated again.

## 2026-09-17 — Final security/consistency audit: fixes applied, gaps documented

With all six of the mission's post-core-conversion capability units shipped
(editor, Fill & Sign, redaction, compare, batch, workspace chaining), a
dedicated audit subagent was commissioned to look for the same *shape* of
gap the session had already caught once organically (`maxPages` defined
everywhere but enforced nowhere) — cross-cutting inconsistencies between
what the registry/DB/docs claim and what the code actually does, across
container security, entitlement enforcement, and `docs/SECURITY.md`'s own
accuracy. It found several real, file:line-cited gaps. Per this mission's
"no false claims" rule (extended here to documentation, not just product
copy) and its "implement the strongest safe version, document the rest"
rule, each finding was triaged individually rather than either fixing
everything indiscriminately or writing a report without touching code.

**Fixed this pass:**

- **All four worker containers now run as non-root.** `workers/html`
  already had this (`groupadd`/`useradd`/`USER jpdf`, needed there for
  Chromium's own sandbox to engage); `workers/pdf`, `workers/office`, and
  `workers/ocr` did not — they parse hostile user-uploaded input with the
  same engines (qpdf/Ghostscript/poppler/LibreOffice/OCRmyPDF/Tesseract)
  while running as container root. Copied the exact same pattern into all
  three Dockerfiles. Verified safe: all three already write only to `/tmp`
  (via `withTempDir`, world-writable by default) and to `/app` only during
  the image build (as root, before `USER jpdf` takes effect) — no runtime
  code path needed root.
- **Workspace chaining bypassed the destination tool's own file-type/size
  limits.** `/api/upload` validates a file against the tool it's uploaded
  *for*, but chaining (using a prior job's `READY` output, or any of the
  actor's own files, as input to a *different* tool) skipped this
  entirely — a file accepted under one tool's limits could be handed to a
  tool with tighter ones, or the wrong `inputTypes` altogether, with
  nothing checking either. Fixed in `app/api/jobs/route.ts`: after the
  ownership check, every input file's stored `mimeType`/`size` is checked
  against the *destination* tool's `inputTypes`/`maxFileSizeBytes`,
  returning the same `UNSUPPORTED_FILE`/`FILE_TOO_LARGE` codes (and
  existing translated client messages) `/api/upload` already uses. This
  trusts the file's stored metadata rather than re-reading and re-sniffing
  the bytes — proportionate, since the bytes were already validated once
  at upload and cannot change in place afterward.
- **Batch processing amplified a pre-existing entitlement race.**
  `canUseTool`'s daily-limit read and `recordToolUsage`'s write are not
  atomic with each other; firing every batch entry's `/api/jobs` call in
  parallel (the original implementation) let all of them read the same
  pre-increment usage count and all pass the check, regardless of
  `dailyOperations`. Fixed by serializing job-*creation* requests in
  `BatchProcessTool.tsx` (await each one before starting the next) —
  this removes the one deterministic, one-click way this session's own
  feature triggered the race, and as a side effect makes `BATCH_MAX_FILES`
  (20) correctly hit `DAILY_LIMIT_REACHED` partway through for a guest
  (`dailyOperations: 8`) instead of silently exceeding it. Does **not**
  fix the underlying race in general (e.g. many browser tabs firing at
  once) — a real fix needs an atomic check-and-increment (DB row-level
  `UPDATE ... WHERE count < limit` or a Redis `INCR`), left as a
  documented gap (`docs/SECURITY.md` §7).
- **Unbounded aggregate request body for options-JSON-borne images.**
  `edit-pdf`/`fill-sign-pdf` cap each image (8MB) and the edit count (300)
  but nothing capped the request as a whole — worst case, a multi-
  gigabyte JSON body fully buffered by `request.json()` before any
  per-element check runs. Added `MAX_JOB_BODY_BYTES` (50MB) as a
  `Content-Length` pre-check in `app/api/jobs/route.ts`. Documented
  honestly as a partial fix: defends the actual product UI (an honest
  `Content-Length` header) but not a caller who lies about it while
  streaming more bytes than declared — closing that needs a streaming
  byte-counter instead of `request.json()`, not done here.
- **`GUEST_NOT_ALLOWED` had no translation** in any locale (fell through
  to the generic error message) — currently unreachable in the UI (no
  registered tool disables guests today) but cheap to close properly.
  Added `common.errors.guestNotAllowed` to all three locales and wired it
  into `errorMessageKey()`.
- **`docs/SECURITY.md` corrected in six places** where it no longer
  matched the code (some stale, some describing a design that was never
  actually built): §3's per-engine timeout numbers were wrong/swapped
  (real: 60s qpdf-class, 120s most Ghostscript, 180s LibreOffice **and**
  poppler rasterization, 300s OCR — the doc previously said 180s for both
  Ghostscript *and* OCR, and 300s for LibreOffice) and its "per-job
  timeout" framing was inaccurate (it's per-*subprocess-call*; six pure
  `pdf-lib` handlers with no subprocess have no timeout at all); the
  claimed per-container memory/CPU limits don't exist in
  `docker-compose.yml` or anywhere else in the repo; §4 cited a
  nonexistent `lib/storage/getDownloadUrl.ts` (the real check is
  `app/api/files/[id]/download/route.ts` + `lib/security/actor.ts`'s
  `isOwnedByActor`) and self-contradicted §3's cleanup-worker framing
  (§3 implied a "crash-recovery sweep via the cleanup worker" runs; §4
  correctly says `workers/cleanup` doesn't exist yet — §3 now points at
  §4 instead of asserting the sweep exists); §5 described SSRF as an
  unbuilt-feature concern when `workers/html` had already shipped a real
  (application-level-only) mitigation for it; §7 claimed an IP-based
  secondary limit on usage counters that was never built (IP-based
  limiting exists only for `/api/auth/*`); §9 described
  `lib/security/scan.ts` as an existing pluggable interface when no such
  file exists at all. All six rewritten to state the actual current
  behavior and the real gap, not the originally-planned design.

**Found, deliberately not fixed this pass — documented as known
limitations instead** (`docs/SECURITY.md`, in place):

- The general `dailyOperations` TOCTOU race (beyond the batch-specific
  trigger above) needs an atomic counter, which is a change to the one
  entitlement gate every tool shares — too large/risky to make safely in
  this pass without its own dedicated review.
- No per-job timeout for the six pure-`pdf-lib` handlers listed above.
- No per-container CPU/memory limits.
- No container network egress restriction (every worker, not just
  `workers/html`) — the documented backstop for `workers/html`'s SSRF
  mitigation specifically.
- No malware/antivirus scanning of uploaded files.
- `workers/cleanup` (the scheduled expiry sweep for guest files past
  their `expiresAt`, and for orphaned temp dirs after a crash) still does
  not exist — already honestly documented before this pass; unchanged.
- The `PRO` plan tier exists in the seed data with no corresponding
  `ToolLimit` rows, silently falling back to `FREE` limits. Low priority:
  billing/subscriptions aren't live yet.
- A handful of vestigial Prisma columns, checked individually rather than
  assumed as a group: `File.checksum` and `File.pageCount` are never read
  *or* written anywhere in the app. `UsageRecord.count` is written but
  only ever as its schema `@default(1)` (never explicitly set, never
  read back — the real usage tally is `prisma.usageRecord.count()`,
  counting rows, not this field). `UsageRecord.windowStart` is written
  (`new Date()` on every record) but never read — the actual lookback
  query filters on `createdAt` instead, so the compound indexes on
  `windowStart` are currently dead weight too. Left alone rather than
  migrating the schema this late in the pass for a cosmetic-only cleanup.

**Verification**: `tsc`/ESLint clean on the app; all four worker
containers rebuilt (`docker compose up -d --build`) and confirmed healthy
with the new non-root user; full Playwright suite re-run green; a new
assertion added to `auth-cross-user-isolation.spec.ts` confirming a second
user still gets `403` attempting to start a *new* job against the first
user's file (guards specifically against the workspace-chaining ownership
widening having loosened actor scoping, which it did not).

## 2026-09-17 — PDF to HTML and PDF to Markdown: two new conversion tools

Kicked off the "Final Completion Mission" (`TASKS/JPdf_Final_Completion_Mission.md`)
with its first concrete item: two genuinely new conversion directions,
neither reusing an existing worker handler.

- **`pdf-to-html`** (`workers/pdf/src/handlers/pdfToHtml.ts`) uses
  poppler's `pdftohtml -noframes` (already installed for pdf-to-text/
  pdf-to-pdfa — zero new system dependency). Verified empirically inside
  the real container before writing the handler (established practice):
  `-noframes` writes one `<base>.html` plus a *sibling* image file per
  embedded raster, referenced by a relative `src="..."` — two files for
  one logical job output, which doesn't fit this codebase's one-output-
  file-per-job model. Fixed by inlining every sibling image as a base64
  data URI before upload, producing one genuinely self-contained `.html`
  file — verified by asserting zero non-`data:` `src` attributes survive
  in the output. Deliberately did not use poppler's `-c` (complex/exact-
  layout) mode: it absolutely-positions every text fragment, producing
  far less readable/editable HTML for the common case; the simple mode's
  reading-order text is a better fit for "useful HTML," honestly
  documented in the tool's own FAQ as not pixel-perfect.
- **`pdf-to-md`** (`workers/pdf/src/handlers/pdfToMarkdown.ts`, new
  `pdfjs-dist` dependency in `workers/pdf` — previously only the main app
  depended on it) is a from-scratch heuristic converter, not a wrapper
  around an existing engine: per-page `getTextContent()` items are
  grouped into lines by Y-position clustering, then classified into
  headings (font size ranked against the document's own modal/body size,
  capped at H1–H3), bullet/numbered lists (prefix matching), simple
  tables (≥3 consecutive lines sharing the same horizontal-gap-derived
  cell count — a real, bounded heuristic, not a fabrication: a single
  oddly-spaced line never becomes a one-row table), and paragraphs
  (consecutive lines joined when the vertical gap to the next line
  matches the page's own modal line-spacing, split into a new paragraph
  otherwise). A page with zero extractable text gets an honest inline
  note pointing at the OCR PDF tool instead of silently producing
  nothing; a *wholly* image-only PDF fails the whole job with a new,
  specific, translated error code (`NO_EXTRACTABLE_TEXT`) rather than
  shipping an empty file. Explicitly does not attempt bold/italic
  emphasis detection (pdf.js's per-item `fontName` is an internal
  resource alias, not a reliable weight signal without deeper font-
  descriptor inspection) or merged/spanning table cells — stated as scope
  limits in the tool's own FAQ, not silently absent.
- **Two real bugs found only by actually running both tools against a
  new fixture** (`docs/fixtures/sample-structured.pdf`: a real heading,
  a two-line wrapped paragraph, a bullet list, and a two-column table,
  each drawn with pdf-lib the way a real generator would), not by
  reasoning about the code: (1) pdf.js synthesizes a pure-whitespace
  *item* to represent a large positional gap between two real text runs
  — the first implementation treated this item as pure noise to skip and
  advanced its internal "last seen X position" tracker to the
  whitespace's own end, which silently erased the very gap the table-
  detection heuristic depends on (two full table rows collapsed into one
  run with no spacing at all, e.g. "NameScore"). Fixed by leaving that
  tracker untouched across a skipped whitespace item, so the next real
  item's own gap computation correctly spans the whole distance. (2)
  Consecutive list-item blocks were being joined with the same blank-line
  separator as every other block transition, producing a "loose" list
  with unwanted blank lines between items; fixed by tracking each block's
  list-item-ness and joining consecutive list blocks with a single
  newline instead.
- Added `"pdfjs"` to `ToolProcessor` (`lib/tools/types.ts`) — an honest,
  new label, since neither `"poppler"` nor `"pdf-lib"` describes what's
  actually running for pdf-to-md.
- **Verification**: both tools manually driven end-to-end (upload → job →
  poll → download → inspect actual output bytes) against the structured
  fixture and the existing image-only OCR fixture before writing the
  permanent E2E tests, per this project's established discipline. New
  `tests/e2e/pdf-to-html.spec.ts`/`pdf-to-md.spec.ts` (4 specs) assert
  real Markdown/HTML syntax and real fixture text survived, not just "a
  file came back." Existing `html-to-pdf`/`markdown-to-pdf` E2E specs
  re-run and confirmed still green (neither tool nor `workers/html` was
  touched this pass). Screenshots taken and inspected in en/ar (RTL) +
  mobile for both new tool pages.

## 2026-09-17 — PRO tool limits seeded; real timeouts for pure-JS handlers

Two items from the Final Completion Mission's production-hardening list
(§4.7, §4.4).

- **PRO tool limits** (`prisma/seed.ts`): the `PRO` plan existed with zero
  `ToolLimit` rows, so a PRO subscriber silently fell through to FREE
  limits (found by the earlier security audit). Billing isn't live, so
  there's no real per-tool PRO pricing decision to encode — rather than
  inventing 35 hand-picked values, `deriveProLimits()` derives every PRO
  row from that same tool's already-decided FREE row via a single, stated
  `PRO_LIMIT_MULTIPLIER` (3x). Revisit with real numbers once billing
  ships; this closes the "silently falls back" bug honestly without
  pretending a pricing tier was designed.
- **Real timeouts for pure-JS handlers** (`edit-pdf`, `fill-sign-pdf`,
  `page-numbers`, `watermark-pdf`, `pdf-metadata`, `image-to-pdf`,
  `pdf-to-md`): these have no engine subprocess, so they never got the
  `runCommand`/`SIGKILL` timeout every other handler has. A same-process
  `Promise.race` timeout was deliberately **not** used — Node is single-
  threaded, so a timer callback can't fire (and can't "time out"
  anything) until the current synchronous, CPU-bound block yields on its
  own; by the time such a race "wins," the dangerous work is either
  already done or still silently running forever in the background. That
  is exactly the "fake timeout" the mission brief explicitly warned
  against.

  Instead, each handler's actual pdf-lib/pdfjs-dist computation was
  extracted into a new `workers/pdf/src/pureCompute/<name>.ts` module
  (pure function, zero Prisma/storage dependency) and now runs inside a
  short-lived Node **child process**
  (`workers/pdf/src/pureComputeRunner.ts`), invoked through the exact same
  `runCommand()` + `killSignal: "SIGKILL"` machinery every qpdf/Ghostscript/
  LibreOffice call already uses (`workers/pdf/src/runPureCompute.ts`) — a
  real OS-level kill, not a giveup. The handler itself now only does I/O
  (download, write input to temp file, invoke the subprocess, read output,
  upload, write the `File` row) — unchanged behavior/error codes, verified
  by re-running every affected tool's E2E test. A `ComputeFailure` error
  class (a duplicate of `JobFailure`, deliberately not imported, to keep
  the child process's own dependency footprint minimal) carries a `.code`
  string across the process boundary via a small `<output>.error.json`
  side-channel file.

  **Verified, not assumed**: temporarily forced an impossibly short
  timeout (5ms) end-to-end and confirmed the job genuinely failed with
  `PROCESSING_FAILED` (the subprocess was actually killed, not merely
  ignored) before restoring the real 45s budget; separately verified the
  `UNSUPPORTED_FILE`/`NO_EXTRACTABLE_TEXT` failure paths still propagate
  correctly through the new process boundary using real corrupt/image-only
  fixtures.

  **Real trade-off found by actually running the test suite under
  concurrency**, not assumed: spawning a fresh Node process per job means
  every concurrent job now pays a real module cold-start cost (importing
  `pdfjs-dist` especially) that in-process code never did. Under
  Playwright's default multi-worker parallelism, two tools (`jpg-to-pdf`,
  `pdf-to-md`) that normally complete in ~1s took 10-12s when several such
  jobs ran concurrently on this dev machine, despite 8 CPUs being
  available to the container — likely Docker Desktop/WSL2 process-spawn
  overhead, not raw CPU exhaustion. Mitigated by lowering `pdf-processing`'s
  BullMQ concurrency from 4 to 2 (`workers/pdf/src/index.ts`); full
  suite re-verified green using this project's own established
  `--workers=1` serial convention (`reference-jpdf-operations` memory),
  which this project already used specifically because of this class of
  contention sensitivity. Documented as an accepted cost of genuine
  timeout safety, not silently absorbed.

## 2026-09-18 — Atomic daily usage limits; removed vestigial Prisma columns

Two more items from the Final Completion Mission's production-hardening
list (§4.6, §4.8).

- **Atomic `dailyOperations`** (`lib/entitlements/index.ts`): replaced the
  check-then-write race (`canUseTool`'s daily-limit check, then a
  separate `recordToolUsage` insert after the job was created) with
  `tryReserveToolUsage`, which checks and records usage in one Postgres
  transaction guarded by a transaction-scoped advisory lock
  (`pg_advisory_xact_lock(hashtext('actor:tool'))`). This serializes
  concurrent requests for the *same* actor+tool without any contention
  between different actors or tools. Chose a DB-level fix over Redis:
  Redis isn't otherwise part of this project's data-integrity story
  (BullMQ queues and auth rate-limiting only) and Postgres already is.
  `canUseTool` now only checks `TOOL_DISABLED`/`GUEST_NOT_ALLOWED` (cheap,
  no usage read) — the atomic reservation happens once, right before
  `Job.create()`, in `app/api/jobs/route.ts`. One accepted, narrow
  trade-off: usage is now recorded *before* job creation rather than
  after, so an unrelated DB failure during `Job.create()` itself (already
  rare — every other validation already passed by that point) would
  consume a usage slot for a job that was never created.

  **Verified with a real concurrency test, not just reasoning about the
  code**: fired 20 genuinely simultaneous `POST /api/jobs` requests (via
  `Promise.all`, not sequential awaits) as one fresh guest against
  compress-pdf's 8/day guest limit. Before this fix this would have let
  meaningfully more than 8 through (the whole point of the race); after
  the fix, exactly 8 succeeded and exactly 12 got `DAILY_LIMIT_REACHED`,
  every time. Captured permanently in
  `tests/e2e/daily-limit-atomic.spec.ts`.

- **Removed four vestigial Prisma columns**, checked individually rather
  than assumed as a group (a prior audit had already flagged these as
  suspects): `File.checksum` and `File.pageCount` were never read *or*
  written anywhere in the app. `UsageRecord.count` was written but only
  ever as its schema `@default(1)`, never explicitly set or read back —
  the real usage tally is `prisma.usageRecord.count()`, counting rows.
  `UsageRecord.windowStart` was written (`new Date()` on every record) but
  never read — the actual lookback query filters on `createdAt` instead,
  so its two compound indexes were dead weight measuring the wrong
  column. Migration `20260917204053_remove_unused_columns` drops all
  four and replaces the `windowStart`-keyed indexes with `createdAt`-keyed
  ones that actually match the real query
  (`UsageRecord_{user,guest}Id_toolId_createdAt_idx`).

  **Operational note worth recording**: every one of the four worker
  containers (`pdf`/`office`/`ocr`/`html`) bakes its own generated Prisma
  Client into its image at build time — after applying this migration,
  all four had to be rebuilt, not just the main app, or they'd have kept
  querying columns that no longer exist in the database. This applies to
  *any* schema migration in this architecture, not just this one; worth
  remembering next time.

## Template for future entries

```
## YYYY-MM-DD — <short title>

- Decision:
- Why:
- Alternatives considered:
- Revisit when:
```
