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
   **Correction (2026-10-21): this gate never actually worked at runtime
   until then.** Inside the Next.js server bundle pdf.js could not load its
   worker module, so every count threw, and the route turned any error
   into "0 pages": every file passed `maxPages`. Counting now uses pdf-lib
   (pure JS, `lib/security/pageCount.ts`) and **fails closed**: a PDF whose
   pages can't be counted is refused, `ENCRYPTED_PDF` for
   password-protected files and `UNSUPPORTED_FILE` otherwise
   (`tests/e2e/page-limit-fail-closed.spec.ts` verifies 301 pages are
   refused and 300 accepted for a guest). The two tools whose purpose is unreadable
   input (`unlock-pdf`, `repair-pdf`, flagged `deferPageLimitToWorker` in
   the registry) get the actor's `maxPages` stamped into the job options
   server-side (overwriting anything the client sent), and their worker
   enforces it on the decrypted/repaired output before storing it
   (`workers/pdf/src/pageLimit.ts`).

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
whole; `app/api/jobs/route.ts`'s `MAX_JOB_BODY_BYTES` (50MB) bounds the
aggregate. It is enforced on the bytes actually received
(`lib/security/requestBody.ts` counts the stream and cancels it past the
limit), so a caller that lies about or omits `Content-Length` can't make
the route buffer more. Uploads work the same way: `/api/upload` takes
`toolId` in the query string, resolves the actor's per-tool size limit
first, and reads at most that (+64KB multipart overhead) before parsing.

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
- An argument array is still not enough for user-supplied *passwords*:
  qpdf 11.3 only takes encryption passwords positionally and parses any
  argument starting with `-` as an option, so `--help` or `-` as a
  password could not be passed correctly at all. `protect-pdf` and
  `unlock-pdf` therefore hand qpdf a job JSON file
  (`workers/pdf/src/qpdfJob.ts`, `--job-json-file`) written mode 0600 to
  the job's private temp dir, which also keeps passwords out of the
  process list. Passwords are no longer trimmed (the protected file must
  open with exactly what the user typed), and `protect-pdf` refuses
  passwords over 127 UTF-8 bytes, since AES-256 (revision 6) silently
  ignores everything after byte 127. Covered by
  `workers/pdf/src/qpdfJob.test.ts` against the real binary.
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
  **Handlers with no engine subprocess of their own** — `edit-pdf`,
  `fill-sign-pdf`, `page-numbers`, `watermark-pdf`, `pdf-metadata`,
  `image-to-pdf` (pure `pdf-lib`) and `pdf-to-md` (pure `pdfjs-dist`) — now
  get the same real protection through a different mechanism
  (`workers/pdf/src/runPureCompute.ts`): the actual computation runs in a
  short-lived Node child process (`pureComputeRunner.ts`), invoked through
  the same `runCommand`/`SIGKILL` machinery as every engine subprocess, with
  a 45s default budget. This is deliberately *not* a `Promise.race`-style
  timeout in the same process — Node is single-threaded, so a timer
  callback can't run (and therefore can't "time out" anything) until the
  current synchronous, CPU-bound block yields on its own; a real OS-level
  `SIGKILL` on a genuinely separate process is the only honest way to bound
  this. Verified, not assumed: a forced artificially-short timeout was
  confirmed to actually kill the subprocess and fail the job cleanly before
  this was shipped. Trade-off, documented rather than hidden: each
  concurrent job now pays a real module cold-start cost a same-process call
  never did; `pdf-processing`'s BullMQ concurrency was lowered from 4 to 2
  after measuring real contention under concurrent load on dev hardware.
- **Per-container memory/CPU limits** are configured in `docker-compose.yml`
  for all four workers (`deploy.resources.limits`, verified applied via
  `docker inspect` — Compose honors this outside Swarm mode too, not just
  in a Swarm cluster): 2 CPUs each, memory sized to each engine's real
  footprint (1.5GB pdf-worker, 3GB office-worker for LibreOffice, 2GB
  ocr-worker, 3GB html-worker for Chromium). One hostile/pathological job
  can no longer exhaust host memory/CPU without bound. An equivalent limit
  still needs configuring in whatever production orchestrator eventually
  runs this (ECS task definitions, Kubernetes resource limits, etc.) —
  this only covers the Compose-based deployment shape.
- Randomized temp directories, deleted in a `finally` block on every code
  path (success, failure, timeout). A dedicated sweep for anything
  orphaned despite that was considered and deliberately not built: the
  temp root (`/tmp`, `os.tmpdir()`) is each container's own ephemeral
  filesystem with no persistent volume backing it in `docker-compose.yml`,
  so a hard-killed worker's leftover temp files vanish the moment that
  container is recreated, which `restart: unless-stopped` already
  guarantees happens. There is no persistent, shared temp location in
  this architecture for a periodic sweep to act on.
- **No worker needs outbound internet access to process a file, and none
  can reach it**: `docker-compose.yml`'s network is now `internal: true`
  — Docker configures no default route to the outside world for any
  container on it at all, verified by confirming a worker container gets
  an immediate `ENETUNREACH` connecting to a real external IP, while
  container-name resolution and connectivity between services on the
  same network (worker → postgres/redis/minio) keeps working normally.
  This is the network-level backstop `workers/html`'s own application-
  level request-blocking (`context.route()`, see
  `workers/html/src/render.ts`) already documented as required. Build-time
  networking (`apt-get`/`npm install`/`playwright install` during
  `docker build`) is unaffected — `internal: true` only restricts already-
  built containers at runtime. Gotcha hit while shipping this: changing
  the network definition alone does not recreate already-running
  containers with no other config diff (`postgres`/`redis`/`minio` here) —
  they're left attached to the old, soon-orphaned network object while
  freshly recreated containers join the new one, breaking DNS resolution
  between them until a full `docker compose down` + `up` cycle.

## 4. Storage & access control

- PDF binaries are never stored in Postgres — only metadata (`storageKey`,
  `size`, `status`, `expiresAt`, owning `userId`/`guestId`).
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
  delete) instead. `workers/cleanup` (a dedicated, lightweight worker
  package — no engine binaries, pure Postgres/Redis/S3 client code) runs
  an hourly sweep (also once immediately at startup) that deletes the
  storage object and marks a guest file `EXPIRED` once its `expiresAt`
  has passed, unless it's currently the input to a job still queued or
  processing — verified with a real seeded scenario, not just reasoned
  about, that an expired-but-actively-used file survives a sweep
  untouched. The same worker also permanently removes files sitting in
  Trash for more than 30 days (a real, previously-undocumented gap: the
  Trash feature itself only ever sets `deletedAt` and never touches the
  storage object, so a trashed-but-never-explicitly-purged file kept its
  bytes forever before this existed) and marks any job stuck in
  `PROCESSING` for more than 30 minutes as failed (a worker crash
  signature, not a legitimately slow job — the longest per-subprocess
  timeout anywhere in this codebase is 300s). See `docs/DECISIONS.md`.

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
`fetch`). Mitigated in two independent layers now: at the application
level, `workers/html/src/render.ts` registers a Playwright
`context.route("**/*", ...)` handler *before* any content loads, aborting
every request except `about:blank`/`data:` — plus `javaScriptEnabled:
false` at context creation, which independently closes JS-driven
`fetch()`-based SSRF. A referenced external resource is left missing
(broken-image-style degradation) rather than the job being hard-failed.
At the network level, `docker-compose.yml`'s `internal: true` network (see
§3) means the container has no route to the outside world at all even if
the application-level control had a bug or Chromium did something
`page.route()` doesn't cover (DNS prefetch, safety-check pings) — the
backstop this section previously described as aspirational is now
actually configured.

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
  existing BullMQ Redis connection; `INCR` + `EXPIRE NX` in one MULTI so a
  counter can never be left without an expiry) on `/api/auth/register`
  (by IP), `/api/auth/login` (by IP and by normalized email), and — since
  2026-10-21 — `/api/upload` and `POST /api/jobs` (per IP and per actor,
  `lib/security/abuseLimits.ts`; defaults 200/IP and 100/actor per 10
  minutes, overridable via env).
- Client IP (`lib/security/clientIp.ts`) is the `X-Forwarded-For` entry
  `TRUSTED_PROXY_HOPS` (default 1) from the right, i.e. the address the
  nearest trusted proxy saw. The leftmost entry, used before, is
  client-controlled and let anyone pick their own IP for every per-IP
  limit. Next.js passes a client-supplied header through unchanged when
  no proxy is in front, so production must run behind one that appends
  the header (docs/DEPLOYMENT.md).
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
off this id) enforce `dailyOperations` per guest id. Because discarding the
cookie yields a fresh guest id (and a fresh per-tool quota), guests are
also bounded per IP across all guest ids (since 2026-10-21): at most
`GUEST_DAILY_JOBS_PER_IP` (default 300) jobs per rolling day, plus the
per-IP upload/job request rate limits in §6. Trade-off, accepted: guests
behind one NAT share these IP buckets; signed-in users are bounded by
their own account instead. `tests/e2e/abuse-controls.spec.ts` verifies
that cookie-less requests from one IP hit the shared per-IP limit.

`dailyOperations` is now a hard cap under concurrency, not a soft/best-
effort one: `tryReserveToolUsage` (`lib/entitlements/index.ts`) checks and
records usage atomically inside one Postgres transaction, guarded by a
transaction-scoped advisory lock (`pg_advisory_xact_lock`, keyed by a hash
of `actor:tool`) so concurrent requests from the *same* actor+tool are
serialized while different actors/tools never contend. This replaced a
previous check-then-write (`canUseTool`'s old daily-limit check, a
separate `recordToolUsage` insert after the job was created) that let
concurrent requests all read the same pre-increment count and all pass.
Verified, not assumed: `tests/e2e/daily-limit-atomic.spec.ts` fires 20
genuinely concurrent job-creation requests as one guest against an 8/day
limit and asserts *exactly* 8 succeed — this was the batch-processing
feature's own trigger for this race before the fix (it now also sends its
own requests one at a time as an additional, redundant safeguard, but the
real fix is this one). Usage is recorded *before* `Job.create()`; if the
job then can't be enqueued (Redis down), the route marks it `FAILED`
(`QUEUE_UNAVAILABLE`) and releases the reservation (`releaseToolUsage`).
A job whose queue entry is lost later is failed by the cleanup worker
(`QUEUE_LOST`, only when BullMQ no longer holds it) but its reservation is
not refunded, because usage records aren't linked to a job id.

## 8. Logging

Structured logs include: job id, tool id, user/guest id, duration, worker
name, result, error code. Logs never include: passwords, auth tokens/session
secrets, file contents, or extracted document text.

## 9. Malware scanning

Uploaded files are scanned by a real ClamAV daemon (`clamav` service in
`docker-compose.yml`) after structural validation (magic bytes, size —
§1) and before persisting to storage or the DB. `lib/security/scan.ts`
hand-rolls clamd's `INSTREAM` wire protocol over a raw TCP socket
(connect, `zINSTREAM\0`, length-prefixed chunks, a zero-length terminator,
then read the one-line reply) rather than adding a third-party client
dependency — most such packages are thin, sparsely-maintained wrappers
around this exact same protocol.

**Fails open, deliberately**: `scanFile()` returns `"skipped"` (not
`"clean"`) if `CLAMD_HOST` is unset (e.g. a dev/CI environment without the
`clamav` Compose service) or if the scanner is unreachable, times out, or
errors. This is one defense-in-depth layer on top of structural
validation, not the only gate — a transient scanner outage should not
take down the entire upload path for every user. An infected result is
rejected with the same generic `UNSUPPORTED_FILE` code (413/415 territory)
a structural validation failure would use — the client is never told a
scan ran or what it found, and the server log records only that an
upload was rejected as infected (mime type, size), never file contents,
per §8.

**Verified against a real detection, not assumed from the client code
working**: `tests/e2e/malware-scan.spec.ts` builds a genuine PDF (via
`pdf-lib`, never written to disk — an in-memory buffer is handed directly
to Playwright's `setInputFiles`) with the industry-standard, harmless
EICAR test payload attached as a real embedded-file stream, and asserts
the upload is rejected; a second test confirms a clean PDF is unaffected.

**Real, non-obvious finding from testing this against the actual
daemon**: ClamAV's PDF-aware content extraction did *not* detect EICAR
bytes appended after a bare `%PDF-` header with no real PDF structure
behind it, nor EICAR bytes placed in a document metadata field (`Subject`)
of an otherwise-valid PDF — only a genuine embedded-file attachment
stream (`pdf-lib`'s `.attach()`) was reliably detected. This matters
because it means ClamAV's real detection surface for this format is
narrower than "scans every byte of the file" — anyone extending this
scanning integration to other formats should verify detection against
the *actual* daemon with a realistic payload shape for that format,
not assume a raw-byte match applies to every parser it has.

## 10. Dependency/licensing hygiene

Before adding any new processing dependency, check maturity, maintenance
status, and license compatibility with a commercial SaaS (blueprint §63–64).
Decisions are logged in `docs/DECISIONS.md`.

## 11. Redaction guarantee

`redact-pdf` is the one tool whose entire purpose is a security property,
so its guarantee is stated precisely here. Pipeline:
`workers/pdf/src/redaction.ts` (+ `pureCompute/redactAssemble.ts`).

**History (2026-10-21):** the first implementation rasterized redacted
pages correctly but built the output by editing the source document in
place with pdf-lib (`insertPage` + `removePage`). `removePage` only
unlinks a page; `save()` still serializes every object, so the original
content stream, form-field values and the Info dictionary all survived in
the file as recoverable objects. The E2E test only checked the page's
extractable text, which was empty, so it passed. Fixed and covered by
byte-level regression tests (below); see `docs/DECISIONS.md`.

**What is guaranteed now**

- Encrypted input (including owner-password-only) and input qpdf can't
  parse are refused (`ENCRYPTED_PDF` / `UNSUPPORTED_FILE`): removal is only
  promised for structure the pipeline can fully read.
- Visible annotations and form values are baked into page content first
  (qpdf `--flatten-annotations=all --generate-appearances`), so a redacted
  page's raster shows exactly what the user saw in the editor.
- Each redacted page is rasterized with pdftoppm `-cropbox` (the same
  CropBox-relative, rotation-applied space the editor's boxes use) and the
  boxes are burned into the pixels. The output page holds only that image,
  sized to the page's visible box, so rotated and cropped pages keep their
  displayed geometry (verified pixel-by-pixel in the test). Before this
  fix pdftoppm rendered the MediaBox, which put boxes in the wrong place
  on cropped pages.
- The output is a **new document**: no Info dictionary, XMP, AcroForm,
  outline/bookmarks, names tree (attachments, named destinations,
  document JavaScript), OpenAction, structure tree or page labels from the
  source. Untouched pages are copied minus annotations (links, comments,
  hidden annotations), page-level XMP, thumbnails, actions and private
  application data.
- qpdf then rebuilds the file from its pages (`--empty --pages`): only
  objects reachable from those pages are written, and resources a page
  lists but never uses are dropped, so a resource dictionary shared with a
  redacted page can't carry that page's XObjects into the output (a plain
  qpdf rewrite does not do this; verified).
- Any page that can't be redacted fails the whole job, and a box outside
  the page range or entirely outside the visible area is refused rather
  than ignored. The job never "partially" succeeds.

**Verification:** `workers/pdf/src/redaction.test.ts` (runs inside the
pdf-worker image, and in CI) builds a fixture with unique markers in page
text, a form value, a comment, a hidden annotation, an attachment, a
bookmark, document JavaScript, Info and XMP metadata, a shared-resource
XObject, a rotated page and a cropped page, then searches the fully
decoded output (`qpdf --qdf --decode-level=all`) for each marker in raw,
hex and UTF-16 forms. `tests/e2e/redact-pdf.spec.ts` repeats a byte-level
check through the real UI.

**Known limitations (documented, not hidden)**

- Untouched pages are copied as-is: text the user didn't box, on pages
  they didn't redact, stays, by design.
- Interactive form fields are removed from the whole document (their
  visible values remain as flattened content); links and comments are
  removed from untouched pages too.
- A redacted page's text is no longer selectable or searchable.
- Content hidden inside an untouched page's own drawing (text drawn
  off-page or in white) is not detected: only what is displayed is in
  scope for "redact what you see".
