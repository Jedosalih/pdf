# Deployment — JPdf

## Current state (2026-10-21 — see `docs/DECISIONS.md` for dated entries)

- **JPdf is not deployed anywhere.** There is no production server,
  domain, hosting account or deploy workflow. Nothing in this repository
  should be read as "JPdf is publicly live".
- **CI** (`.github/workflows/ci.yml`) is written but **has never run**:
  the commits that add it have not been pushed to GitHub yet. Its steps
  were exercised locally piece by piece (lint, typecheck, worker
  typechecks, app build, worker image builds, the worker-image security
  tests and the Playwright suite against the Compose stack; see
  `MAINTENANCE_REPORT.md`), but "CI passes" can only be claimed after a
  real run on GitHub Actions.
- **Health endpoint**: `GET /api/health` exists and checks Postgres, Redis
  and object storage (returns `{status, checks}`, 503 when degraded; never
  connection strings or error details). Covered by
  `tests/e2e/health.spec.ts`. The worker containers have no HTTP endpoint
  of their own; their health is inferred from the container running.
- **Production stack template**: `docker-compose.prod.yml` +
  `.env.production.example` + `Dockerfile` (app) + `deploy/` (per-service
  Postgres roles/grants and MinIO access keys). Validated with
  `docker compose -f docker-compose.prod.yml --env-file .env.production.example config`
  (also a CI step); never started against real infrastructure.
- **CD**: does not exist. A deploy workflow needs a real target first.

## Local development vs production

| | `docker-compose.yml` (dev/CI) | `docker-compose.prod.yml` |
|---|---|---|
| Credentials | fixed public dev values | all from `.env.production` (never committed); missing ones abort startup |
| Published ports | Postgres/Redis/MinIO/ClamAV on 127.0.0.1 | app 3000 and MinIO S3 API 9000 only, on 127.0.0.1, for a host reverse proxy |
| Redis | no password | `requirepass` |
| DB/storage credentials | one shared superuser / root key | one least-privilege Postgres role and MinIO key per service |
| Images | pinned by digest | pinned by digest |
| App | `npm run dev` on the host | `Dockerfile` (`next build` + `next start`) |
| Migrations | `npx prisma migrate deploy` by hand | one-shot `migrate` service: migrate, seed, grants |

Least-privilege mapping (derived from what each service's code calls):

- app: full DML on all tables (no DDL); storage Get/Put/Delete + ListBucket.
- pdf/office/ocr/html workers: `Job` SELECT/UPDATE, `File` SELECT/INSERT;
  storage Get on the bucket, Put on `results/*` only.
- cleanup worker: `Job` SELECT/UPDATE, `File` SELECT/UPDATE/DELETE;
  storage Delete only.
- migrations run as the Postgres admin role, used by nothing else.

Network isolation: workers sit only on the `internal: true` `backend`
network (no route out). The app and ClamAV are also on `edge` (outbound
access; freshclam must download definitions).

## What deploying this for real still needs (owner actions)

1. **A host**: a Linux VM with Docker. Sizing: the worker limits in the
   Compose files total about 9 CPUs / 13 GB worst case under full load.
2. **A domain and a reverse proxy** (Caddy, nginx or Traefik) terminating
   HTTPS for the app and for the storage origin (`STORAGE_PUBLIC_ENDPOINT`,
   since browsers fetch signed download URLs directly). The proxy **must
   append `X-Forwarded-For`** and the app must not be reachable except
   through it: per-IP rate limits trust the entry `TRUSTED_PROXY_HOPS`
   from the right, which a client can forge if it can reach the app
   directly. No proxy config is included; none was invented.
3. **Real secrets** in `.env.production`, generated fresh (never from
   `.env.example` or a dev `.env`), and later as GitHub Actions secrets
   for a deploy workflow, never printed in logs.
4. **Object storage decision**: the MinIO images pinned here are the last
   community images MinIO published (September 2025); they will not get
   security fixes. Before going live, either move to a managed
   S3-compatible store (R2/S3: only the `STORAGE_*` variables change;
   `lib/storage` speaks plain S3) with per-service scoped keys, or run a
   maintained MinIO distribution. Note that a managed store needs the
   workers to have outbound access to it, which the current `internal`
   network forbids; that needs an egress proxy or a network policy
   allowing only the storage endpoint.
5. **A deploy workflow** once 1–4 exist. Intended shape:

```
Push to main → CI passes
  → build + push app/worker images (GHCR)
  → SSH to host: docker compose -f docker-compose.prod.yml pull && up -d
    (the `migrate` service runs migrations/seed/grants before app/workers start)
  → health-check https://<domain>/api/health
  → on failure: redeploy the previous image tags
```

6. **Backups**: nothing backs up the Postgres or object-storage volumes.

## Environment variables in production

See `.env.production.example` for the full list with comments. Optional
abuse-control overrides: `UPLOAD_RATE_LIMIT_PER_IP`,
`UPLOAD_RATE_LIMIT_PER_ACTOR`, `JOB_RATE_LIMIT_PER_IP`,
`JOB_RATE_LIMIT_PER_ACTOR`, `GUEST_DAILY_JOBS_PER_IP` (defaults in
`lib/security/abuseLimits.ts`).
