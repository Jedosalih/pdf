# JPdf

A multilingual (English/Arabic/Turkish) online document processing
platform — merge, split, compress, convert, OCR, edit, redact, and more,
run through a real queue-backed worker architecture rather than
client-side tricks.

This README describes what's actually implemented and running in this
repository. For the reasoning behind specific decisions and the honest
scope of each feature, see `docs/DECISIONS.md` (a running, dated log —
the authoritative source if anything here goes stale) and
`docs/SECURITY.md`.

## What JPdf is

- Upload a file, pick a tool, the file is processed by a real backend
  worker (never in the browser, never faked client-side), and you
  download the result.
- Guests get a free daily quota with no signup; signing up unlocks higher
  limits and a persistent workspace (My Documents, history, starring,
  trash).
- Every processing engine is a real, industry-standard tool (qpdf,
  Ghostscript, Poppler, LibreOffice, Tesseract/OCRmyPDF, headless
  Chromium) — not a reimplementation, and never silently faked.

## Capabilities

### Conversion matrix

| From → To | Engine | Notes |
|---|---|---|
| PDF ↔ JPG/PNG | Poppler / Sharp | |
| PDF → Text | Poppler (`pdftotext`) | |
| PDF → HTML | Poppler (`pdftohtml`), images inlined as base64 | Reading-order text, not pixel-perfect layout — see FAQ on the tool page |
| PDF → Markdown | `pdfjs-dist`, heuristic structure detection | Detects headings/lists/simple tables from font size and layout; not a layout-analysis engine — see `docs/PDF_ENGINE.md` |
| HTML → PDF | Headless Chromium (Playwright) | JS disabled, network requests blocked (SSRF hardening) |
| Markdown → PDF | `markdown-it` + the same Chromium renderer | |
| PDF → PDF/A | Ghostscript | **Best-effort** — no ISO 19005 compliance validator runs; do not treat as a compliance guarantee |
| Word/Excel/PowerPoint → PDF | LibreOffice (headless) | |
| PDF → Word | LibreOffice (headless) | |
| PDF → Excel | Poppler + `exceljs` | LibreOffice's own PDF→Excel path was found to crash — this is an honest substitute, not LibreOffice |
| PDF → PowerPoint | Poppler + `pptxgenjs` (image-per-slide) | LibreOffice's own path produces empty output — same reasoning |
| Scanned PDF → searchable PDF (OCR) | OCRmyPDF + Tesseract | English/Arabic/Turkish |

### Organize & optimize

Merge, split, rotate, delete/extract/reorder pages, compress, repair,
flatten form fields into static content.

### Edit & secure

- **PDF editor** — add text, images, shapes, highlights, and freehand
  drawing as new overlay content. This is annotation/overlay editing, and
  is never described as in-place editing of existing text — pdf-lib
  cannot rewrite a PDF's existing content stream, only add new content on
  top of it.
- **Fill & Sign** — fills real AcroForm text fields and flattens them,
  plus a drawn/uploaded visual signature. This is a **visual** signature,
  not a cryptographic one (no PAdES/PKCS#7) — there is no PKI/certificate
  infrastructure in this project, by deliberate scope decision.
- **Redaction** — each redacted page is rasterized and the boxes are
  burned into the pixels; the output is rebuilt as a new document, so the
  original page content, metadata, form fields, annotations, bookmarks
  and attachments are not carried over. Verified at the byte level (every
  stream decoded and searched), not just by text extraction — an earlier
  version passed a text-extraction test while the original content was
  still in the file. Password-protected PDFs must be unlocked first. See
  `docs/SECURITY.md` §11.
- **Compare** — a text diff and a visual/pixel diff, shown and computed
  completely separately, never combined into one blended score.
- Watermark, page numbers, metadata editing, password protect/unlock.

### Batch & workspace

- **Batch processing** — run one tool across many files at once, for
  tools with no required options.
- **Workspace file chaining** — reuse a previous job's output directly as
  the input to a different tool, with no re-upload round trip.

## Architecture

```
Browser → Next.js (upload, auth, API) → Job row in Postgres
        → BullMQ job in Redis → a worker process → the real engine
        → result written to S3-compatible storage → Job marked COMPLETED
        → Browser polls job status → signed download URL
```

- **App**: Next.js 16 (App Router), TypeScript strict, Tailwind v4,
  `next-intl` (en/ar/tr, Arabic is RTL).
- **Five independently deployable worker packages** (`workers/`), each
  its own Docker image, queue, and concurrency setting — heavy processing
  never runs inline in a Next.js request handler:
  - `pdf` — qpdf/Ghostscript/Poppler/`pdf-lib`/`pdfjs-dist`.
  - `office` — LibreOffice headless.
  - `ocr` — OCRmyPDF + Tesseract.
  - `html` — headless Chromium (Playwright).
  - `cleanup` — scheduled housekeeping (expired files, stale jobs); see
    `docs/DECISIONS.md`.
- **Postgres** (via Prisma) for all metadata — file/job/user rows, never
  file bytes.
- **Redis** (via BullMQ) for the job queue.
- **S3-compatible object storage** (MinIO locally; R2/S3 in production)
  for the actual file bytes.
- **ClamAV** for malware scanning on upload (fails open if unreachable —
  one defense-in-depth layer, not the only upload check).

Full detail: `docs/ARCHITECTURE.md`, `docs/PDF_ENGINE.md`.

## Local development

Requires Docker (Desktop or Engine) and Node.js 22+.

```bash
cp .env.example .env          # edit if you changed any default credential
docker compose up -d --build  # postgres, redis, minio, clamav, all 5 workers
npm install
npx prisma migrate deploy
npm run db:seed               # required after any lib/tools/registry.ts change
npm run dev                   # http://localhost:3000
```

After changing anything under a `workers/*` package, that container needs
an explicit rebuild — it does not hot-reload like the Next.js dev server:

```bash
docker compose up -d --build pdf-worker   # or office-worker/ocr-worker/html-worker/cleanup-worker
```

To verify a worker's engine binaries actually exist inside the running
container (never assume from the Dockerfile alone):

```bash
docker exec pdf-pdf-worker-1 qpdf --version
```

## Environment variables

See `.env.example` for the full, current list with inline comments. In
short:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string (BullMQ) |
| `STORAGE_*` | S3-compatible object storage endpoint/credentials/bucket |
| `CLAMD_HOST` / `CLAMD_PORT` | ClamAV daemon — optional; uploads are still structurally validated if unset, see `docs/SECURITY.md` §9 |
| `AUTH_SECRET` / `GUEST_ID_SECRET` | Session/guest-cookie HMAC signing keys — generate a real random value per environment, never reuse the example |
| `NEXT_PUBLIC_SITE_URL` | Public base URL, used for metadata/canonical links |

## Testing

Every tool is verified through a real Playwright E2E test that drives the
actual UI (or, for server-side limits, the API the way a script would),
uploads a real generated fixture, waits for the real worker to process
it, and inspects the actual downloaded bytes. A few security helpers have
direct, browser-less specs in the same suite
(`tests/e2e/security-helpers.spec.ts`).

```bash
npx playwright test --workers=1   # the full suite; workers=1 avoids a
                                   # real, documented resource-contention
                                   # flakiness pattern under this repo's
                                   # subprocess-isolated handlers — see
                                   # docs/DECISIONS.md
```

Worker-level tests run inside the real worker images (same qpdf/poppler
binaries as production):

```bash
docker compose run --rm --no-deps pdf-worker node dist/redaction.test.js   # redaction security regression
docker compose run --rm --no-deps pdf-worker node dist/qpdfJob.test.js     # protect/unlock password handling
docker compose run --rm --no-deps cleanup-worker node dist/sweep.test.js   # cleanup sweeps (needs migrated DB)
```

To test without touching your dev data, run an isolated stack with its own
volumes: `docker compose -p jpdf-test -f docker-compose.yml -f docker-compose.test.yml up -d --build --wait`
(Postgres on 127.0.0.1:55432; set `DATABASE_URL` for that shell).

## Deployment

JPdf is **not deployed** anywhere yet, and the CI workflow has not run on
GitHub yet. `docs/DEPLOYMENT.md` describes the production Compose
template (`docker-compose.prod.yml`) and what a real deployment still
needs. `docker-compose.yml` is for local development and CI only.

## Security model

See `docs/SECURITY.md` for the full, section-by-section threat model —
upload validation, malware scanning, command execution safety, process
isolation/resource limits, network egress restriction, storage access
control, authentication, and the redaction guarantee. It is written to
describe actual current behavior, including known gaps, not the
originally-planned design.

## Known limitations

Stated here plainly, not left implicit:

- Fill & Sign produces a **visual** signature only, never a cryptographic
  one.
- The PDF editor adds new overlay content; it does not rewrite existing
  text in place.
- PDF/A conversion is best-effort; no compliance validator runs.
- PDF→Excel and PDF→PowerPoint use a Poppler-based substitute, not
  LibreOffice, after LibreOffice's own path proved unusable for those two
  directions.
- PDF→HTML/Markdown are heuristic conversions (reading-order text/font-
  size-based structure detection), not exact layout reconstruction.
- Guests are identified by a cookie; clearing it gives a fresh per-tool
  quota, bounded by per-IP limits (`lib/security/abuseLimits.ts`). Guests
  behind one NAT share those IP limits. Per-IP limits require a reverse
  proxy that appends `X-Forwarded-For` in production.
- No per-container network egress restriction beyond the worker
  containers themselves (the app and infrastructure services are on an
  unrestricted network, needed for local host access — see
  `docs/SECURITY.md` §3).
- Password reset has no email provider wired up yet.
- Billing/subscriptions are not live; the `PRO` plan's limits are a
  placeholder multiplier of the `FREE` tier, not real pricing.
