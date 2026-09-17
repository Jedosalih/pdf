# Security — JPdf

## Threat model summary

Every uploaded file is treated as hostile input. The primary attack
surfaces are: (1) the upload endpoint, (2) the PDF/office/OCR worker
processes parsing that input, (3) cross-user access to files/jobs, and
(4) standard web app auth/session risks.

## 1. File upload validation

Order of checks in `lib/security/validateUpload.ts`:

1. Declared `Content-Type` and extension are a hint only — never trusted
   alone.
2. Magic-byte/file-signature check against the tool's declared
   `inputTypes` (e.g. `%PDF-` header for PDFs, JFIF/EXIF markers for JPG).
   Reject on mismatch with a generic `UNSUPPORTED_FILE` error.
3. Size check against the caller's entitlement (`getToolLimits`) — reject
   before the full body is buffered where the runtime allows streaming
   size checks.
4. Filename is never used as a filesystem path. We generate a random
   storage key (`crypto.randomUUID()`-based) and keep the original name
   only as a display-only DB column, escaped when rendered.
5. Page-count validation (`limits.maxPages`, "max total pages across all
   input files") happens at job creation (`app/api/jobs/route.ts`), not at
   upload time and not in the worker — every PDF input file is opened via
   `pdfjs-dist` (already a proven, Node-compatible, structural-only parse;
   see `tests/e2e/helpers/pdfText.ts` for the identical import path used
   elsewhere) and the total page count across all of that job's PDF inputs
   is compared against the caller's entitlement before the job is ever
   enqueued, returning `TOO_MANY_PAGES` (400) synchronously rather than a
   later async `Job.errorCode`. This was a real, previously-undiscovered
   gap: `maxPages` had genuine per-tool/per-plan values in the registry
   and `ToolLimit` DB table, and the client already had a translated error
   message ready for `TOO_MANY_PAGES`, but nothing anywhere actually
   compared a page count against it until this fix (found while adding
   `compare-pdf`'s own page limits — see `docs/DECISIONS.md`). Non-PDF
   input files aren't page-counted (already bounded by file size).

**Exception: `edit-pdf`'s inserted images bypass this pipeline entirely.**
The PDF editor (`components/tools/edit-pdf/`) builds its edit list
client-side and only uploads the *original* PDF through the normal
`/api/upload` path above — any image a user adds via the "Add image" tool
is read locally as a base64 data URL and travels inside the job's
`options.edits` JSON, which `app/api/jobs/route.ts` accepts as an opaque,
minimally-validated record (`z.record(z.string(), z.unknown())`) by design
(every tool's options shape differs). The worker
(`workers/pdf/src/handlers/editPdf.ts`) is therefore the *only* gate for
that image data: a strict regex requires an exact `data:image/(png|jpeg);
base64,...` prefix, the decoded byte length is capped (8MB), and a failed
`pdfDoc.embedPng`/`embedJpg` call is caught and that one edit is skipped
rather than failing the whole job. There is no magic-byte cross-check
beyond what `embedPng`/`embedJpg` themselves enforce by successfully
decoding the image — acceptable here because the bytes are only ever
handed to `pdf-lib`'s own image embedders (never written to disk, executed,
or parsed by a native library), the same reasoning already applied to
Markdown/HTML uploads in §5. `fill-sign-pdf`'s signature elements travel
the identical `options.edits` path and are validated by the exact same
worker code (`applyEditElements()`, shared by both handlers). Per-image
size and edit-count caps bound each element, but not the request as a
whole; `app/api/jobs/route.ts`'s `MAX_JOB_BODY_BYTES` (50MB, checked via
`Content-Length` before the body is parsed) bounds the aggregate — see the
code comment there for what this does and does not defend against.

`fill-sign-pdf` also sends a separate `options.fields` record (field name
→ typed value) for AcroForm filling. Both keys and values are plain
strings, length-capped (200/2000 chars) and count-capped (200 fields) in
`workers/pdf/src/handlers/fillSignPdf.ts`; an unrecognized field name is
silently ignored via `form.getFieldMaybe()` rather than trusted to exist,
and only fields that resolve to a real `PDFTextField` on *this specific*
uploaded document are ever written — a client cannot target a field on a
document other than the one it uploaded, since the field name is resolved
against the freshly-loaded `PDFDocument` for that job's own input file.

## 2. Command execution

- All engine invocations use `child_process.execFile`/`spawn` with an
  **argument array**. String interpolation into a shell command
  (`exec("qpdf " + userInput)`) is banned — code review must reject it on
  sight.
- Only a fixed, known set of flags/binaries can ever be invoked per tool;
  user-controlled values (e.g. rotation degrees, page ranges) are
  validated against a strict schema (numbers/ranges) before being placed
  into the argument array — never passed through as opaque strings.
- Worker processes run with a working directory scoped to their own
  per-job temp folder. All four worker containers (`pdf`, `office`, `ocr`,
  `html`) run as a dedicated non-root `jpdf` user (each Dockerfile's final
  `USER jpdf`) rather than the image default root — a parser exploit in
  any engine binary does not hand an attacker root inside the container.
- `pdf-to-pdfa`'s Ghostscript invocation runs with `-dSAFER` (Ghostscript's
  own sandbox flag, restricting filesystem access) plus an explicit
  `--permit-file-read=<icc-path>` naming only the one fixed system ICC
  profile the conversion needs — never a broader allowance, and never
  disabled.

## 3. Process isolation & resource limits

- Every engine subprocess (`workers/*/src/exec.ts`'s `runCommand`/
  `runCommandCapture`/`runCommandCaptureAll`) is invoked with a `timeoutMs`
  and `killSignal: "SIGKILL"` — actual current values (verified against the
  handlers, not aspirational): 60s default and for most qpdf-class
  operations, 120s for most Ghostscript invocations (compress/pdf-to-image/
  pdf-to-pdfa), 180s for LibreOffice (`workers/office`) and for poppler's
  page-rasterization step in redact-pdf/compare-pdf, 300s for OCR
  (`ocrmypdf`, the single most expensive per-page operation in the
  codebase). Tunable per call site.
  **This is a per-subprocess-call timeout, not a per-job timeout**: handlers
  that never shell out to an engine binary — `edit-pdf`, `fill-sign-pdf`,
  `page-numbers`, `watermark-pdf`, `pdf-metadata`, `image-to-pdf` (all
  pure `pdf-lib` manipulation) — have no timeout mechanism at all today.
  A pathological input that made `pdf-lib` itself hang would not be killed
  by anything in this codebase. Known gap, not yet fixed.
- **No per-container memory/CPU limits are currently configured** —
  `docker-compose.yml` sets none, and there is no separate production
  orchestrator config in this repo. Known gap; add `deploy.resources`
  (Compose) or the equivalent orchestrator limit before any non-trusted-
  traffic production deployment, so one hostile/pathological job can't
  starve the host.
- Randomized temp directories, deleted in a `finally` block on every code
  path (success, failure, timeout). **The scheduled sweep for anything
  orphaned despite that (a crashed worker, a killed container) does not
  exist yet** — see §4's identical caveat for the guest-file-expiry sweep;
  it's the same missing `workers/cleanup` service.
- No worker needs outbound internet access to process a file. **This is
  not currently enforced** — no container network egress restriction is
  configured in `docker-compose.yml` today; `workers/html`'s own
  application-level request-blocking (`context.route()`, see
  `workers/html/src/render.ts`) is the only control in place, and it
  explicitly documents a network-level backstop as still required. Known
  gap for every worker.

## 4. Storage & access control

- PDF binaries are never stored in Postgres — only metadata (`storageKey`,
  `size`, `checksum`, `status`, `expiresAt`, owning `userId`/`guestId`).
- Downloads go through an authorization check
  (`app/api/files/[id]/download/route.ts`'s `isOwnedByActor()`, from
  `lib/security/actor.ts`): caller must own the `File` (matching `userId`
  or `guestId`) before `getStorage().getSignedDownloadUrl()` issues a
  short-lived (300s) signed URL. No file is ever served from a public,
  guessable path.
- Object storage buckets are private by default; the app is the only
  credentialed writer/reader.
- Guest-owned files/jobs get `expiresAt` set 24h out
  (`lib/entitlements/retention.ts` / `workers/pdf/src/retention.ts`).
  Authenticated-user-owned files/jobs get `expiresAt: null` (never
  expire on their own) so they can persist in My Documents/History —
  deletion for those is by explicit user action (Trash → permanent
  delete) instead. **The `workers/cleanup` scheduled expiry sweep that
  would actually act on a guest row's `expiresAt` does not exist yet**
  — this is a known, pre-existing gap (rows/objects are not currently
  reaped automatically); do not assume guest data is actually deleted
  after 24h until that worker is built.

## 5. SSRF

No dedicated "URL to PDF" tool (fetching a server-side URL directly) ships
today. If/when one is built, it must go through an allowlist + IP-range
blocklist (localhost, RFC1918 ranges, link-local, cloud metadata
`169.254.169.254`, and any internal DNS) before the platform ever issues a
server-side request on a user-supplied URL — see blueprint §45. Do not
build this without that control in place.

`html-to-pdf`/`markdown-to-pdf` (`workers/html`) are a related but distinct
surface: the rendered HTML/CSS a user uploads can itself reference
external URLs (`<img>`, `<link>`, `@import`, `url()`, `<iframe>`, JS
`fetch`). Mitigated at the application level today —
`workers/html/src/render.ts` registers a Playwright `context.route("**/*",
...)` handler *before* any content loads, aborting every request except
`about:blank`/`data:` — plus `javaScriptEnabled: false` at context
creation, which independently closes JS-driven `fetch()`-based SSRF. A
referenced external resource is left missing (broken-image-style
degradation) rather than the job being hard-failed. **The documented
network-level backstop (restricting the container's own egress to only
the object storage endpoint) is not actually configured** — see §3; today
this surface relies on the application-level control alone.

## 6. Authentication (implemented)

- Custom email+password auth built directly on the `User`/`Session`
  schema (`lib/auth/session.ts`, `lib/auth/password.ts`) — no NextAuth/
  Auth.js. `Session.tokenHash` is a hand-designed DB-session-with-
  hashed-token shape; the raw token only ever lives in the cookie, never
  in the database.
- Passwords hashed with **`bcryptjs`** (pure JS, cost 12) rather than
  Argon2id or native `bcrypt`/`argon2` — this project was previously
  burned by a platform-specific native-binding dependency breaking a
  Docker build (see `docs/DECISIONS.md`), and password hashing runs in
  the Next.js app itself, an even less controlled environment than the
  worker container. Password length is validated by **UTF-8 byte
  length** (`new TextEncoder().encode(password).length <= 72`), not
  string length — bcrypt's real truncation limit is 72 bytes, and a
  naive character-count check under-counts multi-byte (Arabic/Turkish)
  passwords, silently truncating them instead of rejecting with a clear
  error.
- Sessions via a random 256-bit token in a `httpOnly`, `SameSite=Lax`,
  `secure`-in-production cookie (`jdpdf_session`); the server stores only
  `HMAC-SHA256(AUTH_SECRET, token)`, mirroring the guest-cookie signing
  primitive already in `lib/security/guestIdCore.ts`. 30-day expiry.
  `SameSite=Strict` was not adopted — no inbound-link auth flow (email
  verification, password reset) exists yet to require it; revisit if one
  is built.
- Rate limiting (Redis-backed, `lib/security/rateLimit.ts`, reusing the
  existing BullMQ Redis connection) on `/api/auth/register` (by IP) and
  `/api/auth/login` (by IP and by normalized email) — upload/job-creation
  rate limiting is not yet implemented (see §10/known gaps).
- Login returns the same generic `401 INVALID_CREDENTIALS` for an unknown
  email, a wrong password, or a disabled account — never reveals which,
  to avoid user enumeration.
- Password reset flow: not implemented — there is no email provider
  wired up yet. Change-password (while authenticated) requires the
  current password and is the only credential-rotation path today.
- On signup/login, any files/jobs created while the same browser was a
  guest are reassigned to the new account
  (`lib/auth/migrateGuestData.ts`) — trusted because the guest cookie
  being presented is itself HMAC-signed, the same trust boundary the
  download-ownership check already relies on.

## 7. Guest usage identity

Guests are identified by a signed, `httpOnly` cookie (`guestId`) set on
first visit — not by fingerprinting. Usage counters (`UsageRecord`, keyed
off this id) are the only mechanism enforcing `dailyOperations`; there is
**no IP-based secondary limit** on top of it today, so clearing cookies
(or any other way of obtaining a fresh `guestId`) resets a guest's daily
quota entirely. IP-based rate limiting exists elsewhere in the codebase
(`lib/security/rateLimit.ts`, §6) but only guards `/api/auth/register` and
`/api/auth/login` — it is not applied to upload/job-creation usage
counting. Known gap, not yet fixed.

Separately, `getRemainingUsage`'s read (`canUseTool`) and
`recordToolUsage`'s write are not atomic with each other — concurrent
requests from the same actor can all read the same pre-increment count and
all pass the check before any of their writes lands, so `dailyOperations`
is a soft, best-effort limit rather than a hard cap under concurrency. The
batch-processing feature (`components/batch/BatchProcessTool.tsx`)
deliberately sends its job-creation requests one at a time rather than in
parallel specifically to avoid being the one deterministic, one-click way
to trigger this; the general race (e.g. multiple browser tabs) remains
open. A real fix needs an atomic check-and-increment (a DB row-level
`UPDATE ... WHERE count < limit` or a Redis `INCR`), not attempted here.

## 8. Logging

Structured logs include: job id, tool id, user/guest id, duration, worker
name, result, error code. Logs never include: passwords, auth tokens/session
secrets, file contents, or extracted document text.

## 9. Malware scanning (not implemented)

**No malware-scanning code exists in this codebase today** — no
`lib/security/scan.ts` or equivalent. Uploaded files are validated
structurally (magic bytes, size, page count — §1) but never scanned for
malicious payloads. A ClamAV-backed (or similar) scan step is a real gap
for a product that stores and later serves back arbitrary user-uploaded
files; if built, it should sit as one more check in
`lib/security/validateUpload.ts`'s pipeline, returning a distinct
`INFECTED_FILE`-style error rather than the generic `UNSUPPORTED_FILE`
(blueprint §43).

## 10. Dependency/licensing hygiene

Before adding any new processing dependency, check maturity, maintenance
status, and license compatibility with a commercial SaaS (blueprint §63–64).
Decisions are logged in `docs/DECISIONS.md`.

## 11. Redaction guarantee

`redact-pdf` (`workers/pdf/src/handlers/redactPdf.ts`) is the one tool in
this codebase whose entire purpose is a security property, not just a
convenience, so its guarantee is stated explicitly here rather than left
implicit: any page containing a redaction box is rasterized whole, the
box is burned into that raster's pixels, and the page's original content
(text, vectors, everything, not only the boxed region) is discarded and
replaced by the flattened image. There is no code path that draws a box
on top of otherwise-intact content — a rectangle-over-text or
rectangle-over-image implementation was deliberately rejected specifically
because it fails this property (the original content is still present
underneath, recoverable by removing the rectangle or extracting text).
This is verified, not assumed: `tests/e2e/redact-pdf.spec.ts` asserts the
redacted page has zero extractable text anywhere on the page and carries
an embedded raster image, while untouched pages keep their original
extractable text and are confirmed not rasterized.

This tool also deviates from the "skip a bad element, keep going" pattern
every other handler in this codebase uses: if any page the user asked to
redact can't actually be processed, the whole job fails
(`PROCESSING_FAILED`) rather than shipping a file that could be mistaken
for fully redacted. See `docs/DECISIONS.md`'s 2026-09-17 redaction entry
for the reasoning.
