# Deployment — JPdf

## Current state (accurate as of this writing — see `docs/DECISIONS.md` for the dated entry)

- **CI**: `.github/workflows/ci.yml` — real, working, runs on every push
  to `main` and every PR. Lints, typechecks, and builds the app and all
  five worker packages, then brings up the *entire* stack via this
  repo's own `docker-compose.yml` (Postgres, Redis, MinIO, ClamAV, all
  five workers, built from their real Dockerfiles — not mocked) and runs
  the full Playwright E2E suite against it. No production secrets are
  used — the `.env` it writes is generated fresh per run with CI-only
  dummy values.
- **CD / production deployment: does not exist yet.** There is no
  production server, no domain, and no hosting account configured for
  this project — confirmed by inspecting the repository for any existing
  deployment config (Terraform, a second `docker-compose.*.yml`, a
  Procfile, Nginx/Caddy config, CI secrets referencing a live host) and
  finding none, not assumed. This is stated plainly rather than left
  implied, per this project's own "no false claims" standard — nothing
  in this codebase should be read as "JPdf is publicly live" until this
  section is updated to say otherwise, with a verified public URL.

## What deploying this for real needs

This project's whole architecture is already container-based
(`docker-compose.yml` defines Postgres/Redis/MinIO/ClamAV + five worker
services), so the most direct, lowest-effort path to production is
**the same Compose stack running on a real server**, not a rewrite into
a different deployment shape. Concretely, that needs:

1. **A host** — any Linux VPS/VM with Docker installed and enough
   resources for the stack's own limits (`docker-compose.yml`'s
   `deploy.resources.limits` currently total roughly 9 CPUs / 13GB memory
   worst-case across all services if every worker is under full load
   simultaneously — a real production sizing pass should right-size this
   against actual traffic, not just copy the dev defaults). Object
   storage can stay as self-hosted MinIO on the same host or move to a
   real S3-compatible provider (R2, S3) by changing only the `STORAGE_*`
   env vars — `lib/storage` was built against the S3 API specifically so
   this swap needs no code change.
2. **A domain**, pointed at that host, with a reverse proxy (Nginx,
   Caddy, or Traefik) terminating HTTPS in front of the Next.js app and
   handling the locale-prefixed routing already built into the app
   itself. No reverse proxy config exists in this repo yet — none is
   assumed or invented here, per the mission's own instruction not to
   invent a domain/DNS step.
3. **Real secrets**, generated fresh for this environment and never
   reused from `.env.example`'s placeholder values or a dev `.env`:
   `AUTH_SECRET`, `GUEST_ID_SECRET`, the storage provider's real
   credentials, and a production `DATABASE_URL`/`REDIS_URL`. Stored as
   GitHub Actions Secrets for the deploy workflow to use, never committed
   or printed in a workflow log.
4. **SSH (or an equivalent) access** from GitHub Actions to that host, so
   a deploy workflow can pull the latest image/code and restart the
   stack — the specific mechanism (SSH + `docker compose up -d --build`,
   or a registry-push-then-pull flow, or a managed platform's own CLI)
   depends on what the host actually is, which is exactly the piece this
   repository cannot supply on its own.

**None of this exists in this repository or its associated accounts
today.** Building a deployment workflow that references a specific host/
provider without one actually being available would mean committing a
workflow that can only ever fail, or inventing infrastructure/credentials
that were never authorized — both worse than stating the gap plainly.
The moment a real target is available, the deploy workflow should:

```
Push to main (after CI passes)
  → build/tag the app + worker images
  → push to a container registry (GHCR is free for public repos and
    needs no extra account — the natural default here)
  → SSH (or platform CLI) into the target, pull the new images
  → run `docker compose up -d` there (no `--build`, since the images
    were already built above -- see docker-compose.yml)
  → `docker compose exec app npx prisma migrate deploy` (or an
    equivalent one-off migration step)
  → health-check the public URL
  → roll back automatically (redeploy the previous image tag) on a
    failed health check
```

This shape reuses the existing Compose file, needs no application
rewrite, and matches every safety property the mission specified (only
deploys after CI passes, secrets only via GitHub Actions Secrets, never
printed, a real health check, a real rollback path).

## Environment variables in production

Same variables as local development (`.env.example`), with real,
per-environment values — see the root `README.md`'s environment
variables table for what each one does. `NODE_ENV=production` and a real
`NEXT_PUBLIC_SITE_URL` (the actual public domain) are the two most
commonly forgotten when promoting from a dev `.env`.

## Health checks

`docker-compose.yml` already defines a real healthcheck for every
long-running service except the four PDF/office/OCR/HTML workers and the
cleanup worker (which have no HTTP endpoint of their own to probe — a
future improvement could add a minimal `/health` endpoint to each for a
deploy workflow's own health-check step to call directly, rather than
inferring health from the container merely being "running"). The
Next.js app itself has no dedicated `/api/health` route yet either;
add one before wiring a real deploy workflow's health-check step, so
"deployed successfully" means "actually serving real requests," not
just "the container started."
