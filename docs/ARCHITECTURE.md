# Architecture — JPdf

## System overview

```
Browser
  │
  ▼
Next.js Web App (App Router)
  │  - auth, account, CMS, tool landing pages
  │  - API routes: validate → persist → enqueue → respond
  ▼
PostgreSQL (metadata: users, jobs, files, tools, content)
  │
  ▼
Redis + BullMQ (job queues, per category)
  │
  ▼
Worker processes (separate Node processes, own Dockerfiles)
  │  - workers/pdf   → qpdf, Ghostscript, Poppler
  │  - workers/ocr   → OCRmyPDF + Tesseract
  │  - workers/office→ LibreOffice (headless)
  │  - workers/image → Sharp
  │  - workers/cleanup → scheduled expiry sweep
  ▼
Object storage (MinIO locally / R2 or S3 in production)
  │
  ▼
Job status flips to COMPLETED, output File row created
  │
  ▼
Browser polls job status → receives signed download URL → downloads
```

The browser never waits on a single long HTTP request for processing. Upload
and "start processing" are two separate, fast operations; the frontend then
polls `GET /api/jobs/:id` (short-poll to start — see "Deferred" below) until
the job reaches a terminal state.

**Auth is implemented** (not deferred): `lib/security/actor.ts`'s
`resolveActor()`/`resolveActorReadOnly()` are the single seam every route/
page uses to identify the caller — they check for a real session
(`lib/auth/session.ts`) first and fall back to the guest cookie, so the
entitlements/ownership code everywhere else never needed to change. The
`/workspace` dashboard (My Documents/Recent/Starred/Trash/Settings) is a
thin read/mutate UI over the same `Job`/`File` rows every tool already
produces — see `docs/DECISIONS.md`'s 2026-09-15/16 entries for the full
build.

## Why this shape

- **Isolation**: qpdf/Ghostscript/LibreOffice are native binaries operating
  on untrusted input. Running them in-process inside the Next.js server would
  mean a malformed PDF or a runaway conversion can degrade the web app for
  every user. A crashing/hanging worker only affects jobs in its own queue.
- **Independent scaling**: OCR and office conversion are CPU/memory heavy
  and slow (seconds–minutes); merge/split/rotate via qpdf are fast
  (milliseconds–seconds). Separate queues let us scale/throttle them
  independently instead of one worker pool being starved by OCR jobs.
- **Resilience**: if a worker container is redeployed or crashes mid-job,
  the job stays queued/failed in Postgres and can be retried — no processing
  state lives only in a request's memory.

## Data flow for one tool (Merge PDF), concretely

1. `POST /api/upload` — client sends file(s) as multipart; the route
   validates size/MIME/magic bytes, streams to a per-upload temp key in
   object storage, and creates `File` rows (`status = "uploaded"`).
2. `POST /api/jobs` — client sends `{ toolId: "merge-pdf", fileIds: [...],
   options: {...} }`. The route re-validates ownership of the files,
   re-checks entitlements (`canUseTool`) server-side, creates a `Job` row
   (`status = "QUEUED"`), and enqueues a BullMQ job with `{ jobId }` only
   (not the raw files — the worker loads what it needs from the DB/storage
   by id, so the queue payload stays small and re-processable).
3. Worker picks up the job, sets `PROCESSING`, downloads inputs to an
   isolated per-job temp directory (randomized name), runs qpdf with a
   fixed argument array, uploads the result, creates an output `File` row,
   sets `COMPLETED` (or `FAILED` with a safe `errorCode`), and deletes the
   temp directory in a `finally` block regardless of outcome.
4. Client polls `GET /api/jobs/:id`; on `COMPLETED` it calls
   `GET /api/files/:id/download` which issues a short-lived signed URL (or
   streams the file itself if signed URLs aren't wired to a real provider
   yet in local dev) rather than exposing a public storage path.

## Deferred for later phases (do not build yet)

- Real-time job updates via WebSocket/SSE — short-poll (e.g. every 1–2s) is
  sufficient for an MVP where most P0 jobs finish in seconds; revisit if
  OCR/office-conversion latency makes polling feel bad.
- Multi-region storage, CDN in front of downloads — still deferred.
  Malware scanning (ClamAV) is no longer deferred — see
  `lib/security/scan.ts` and `docs/SECURITY.md` §9 for the real,
  implemented version.
- Payments/webhooks, email provider, analytics SDK — entitlement and job
  systems are built so these can be added without a rewrite (see
  `docs/MONETIZATION.md`), but no provider is wired up yet.

## Local dev topology

`docker-compose.yml` runs: `postgres`, `redis`, `minio` (S3-compatible),
and the `pdf-worker`. The Next.js app runs on the host via `npm run dev`
and talks to those containers over `localhost` ports. This mirrors
production shape (web app separate from workers) without requiring the web
app itself to be containerized during development.

## Environment variables

See `.env.example` for the full list. Nothing in this repo should read a
secret from a hardcoded string — all provider credentials, connection
strings, and API keys come from `process.env`.
