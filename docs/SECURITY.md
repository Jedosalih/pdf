# Security — JDpdf

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
5. Structural validation (e.g. `pdfinfo` page count) happens once the file
   reaches the worker, before the real operation runs — a job that fails
   this check is marked `FAILED` with `errorCode: "TOO_MANY_PAGES"` etc.

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
  per-job temp folder and should run as a non-root container user with no
  write access outside that temp root and the storage upload path.

## 3. Process isolation & resource limits

- Per-job timeout with `SIGKILL` on expiry (blueprint §6). Default: 60s for
  qpdf-class operations, 180s for Ghostscript/OCR, 300s for LibreOffice —
  tunable per tool.
- Per-container memory/CPU limits set in `docker-compose.yml` (dev) and the
  production orchestrator config.
- Randomized temp directories, deleted in a `finally` block on every code
  path (success, failure, timeout, crash-recovery sweep via the cleanup
  worker for anything orphaned).
- No worker needs outbound internet access to process a file — restrict
  egress at the container/network level to the object storage endpoint.

## 4. Storage & access control

- PDF binaries are never stored in Postgres — only metadata (`storageKey`,
  `size`, `checksum`, `status`, `expiresAt`, owning `userId`/`guestId`).
- Downloads go through an authorization check
  (`lib/storage/getDownloadUrl.ts`): caller must own the `File` (matching
  `userId` or `guestId` + a signed job/session correlation) before a
  short-lived signed URL is issued. No file is ever served from a public,
  guessable path.
- Object storage buckets are private by default; the app is the only
  credentialed writer/reader.
- Temporary and result files expire (`expiresAt`) and are removed by the
  cleanup worker (`workers/cleanup`) on a schedule — see blueprint §49.

## 5. SSRF

No URL-fetching feature (e.g. "URL to PDF") ships in the MVP. If/when it is
built, it must go through an allowlist + IP-range blocklist
(localhost, RFC1918 ranges, link-local, cloud metadata `169.254.169.254`,
and any internal DNS) before the platform ever issues a server-side
request on a user-supplied URL — see blueprint §45. Do not build this
without that control in place.

## 6. Authentication (once Phase 4 is implemented)

- Passwords hashed with a modern adaptive hash (Argon2id via a maintained
  library, or bcrypt if Argon2 isn't available in the chosen runtime).
- Sessions via secure, `httpOnly`, `SameSite=Lax` (or `Strict` where it
  doesn't break OAuth-style flows) cookies.
- Rate limiting (Redis-backed) on login, registration, password reset, and
  job creation endpoints — see blueprint §41.
- Password reset tokens: single-use, short expiry, invalidated after use
  or after a new one is requested.
- Generic error messages for login/reset flows to avoid user enumeration
  where practical.

## 7. Guest usage identity

Guests are identified by a signed, `httpOnly` cookie (`guestId`) set on
first visit — not by fingerprinting. Usage counters key off this id plus a
server-side IP-based secondary limit to reduce trivial cookie-clearing
abuse, without storing raw IP long-term beyond a rate-limit window.

## 8. Logging

Structured logs include: job id, tool id, user/guest id, duration, worker
name, result, error code. Logs never include: passwords, auth tokens/session
secrets, file contents, or extracted document text.

## 9. Malware scanning (pluggable, not in MVP)

`lib/security/scan.ts` defines a `scanFile(buffer): Promise<"clean" |
"infected" | "skipped">` interface. MVP implementation returns `"skipped"`;
a ClamAV-backed implementation can be swapped in later without touching
call sites (blueprint §43).

## 10. Dependency/licensing hygiene

Before adding any new processing dependency, check maturity, maintenance
status, and license compatibility with a commercial SaaS (blueprint §63–64).
Decisions are logged in `docs/DECISIONS.md`.
