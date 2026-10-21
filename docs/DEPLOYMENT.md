# Deployment — JPdf

## Current state (2026-10-21; see `docs/DECISIONS.md` for dated entries)

- **JPdf is not deployed anywhere yet.** No production host, domain or
  hosting account exists for it. Nothing here should be read as "JPdf is
  publicly live" until this section names a verified public URL.
- **CI** (`.github/workflows/ci.yml`) runs on GitHub Actions for every push
  to `main` and every PR (see MAINTENANCE_REPORT.md for the latest real run).
- **CD** (`.github/workflows/deploy.yml`) is complete but **disabled**: it is
  skipped (grey, never green) until the owner configures a host and sets
  `DEPLOY_ENABLED=true` (below).
- **The production stack was smoke-tested locally** with this exact
  template (Caddy HTTPS on `*.localhost`, throwaway secrets): health, a real
  PDF job end to end with the signed download, privilege and network
  isolation checks, backup and restore. That proves the template works; it
  is not a public deployment.

## Architecture on one Docker host (`docker-compose.prod.yml`)

```
Internet ──443/80──> Caddy (only public service; HTTPS via Let's Encrypt)
                      ├─ APP_DOMAIN   -> app:3000 (Next.js)
                      └─ FILES_DOMAIN -> storage:8333 (signed GET/HEAD only)
backend network (internal, no route out):
  app, migrate (one-shot), postgres, redis (password), storage (SeaweedFS),
  clamav, pdf/office/ocr/html/cleanup workers
edge network: proxy, app (outbound SMTP), clamav (definition updates)
```

| Concern | How it's handled |
|---|---|
| Secrets | `.env.production` on the host only (template: `.env.production.example`); compose refuses to start if one is missing |
| HTTPS | Caddy, automatic certificates for `APP_DOMAIN` and `FILES_DOMAIN` |
| Client IP | Caddy sets `X-Forwarded-For` from the real connection; app trusts exactly one hop (`TRUSTED_PROXY_HOPS=1`) |
| Database | Postgres 16; migrations + seed + grants by the one-shot `migrate` service as the admin role |
| Least privilege | Separate Postgres roles (`deploy/postgres`) and storage keys (`deploy/storage`) for app, workers and cleanup |
| Object storage | SeaweedFS 4.48 (maintained, Apache-2.0); bucket private, downloads via signed URLs only |
| Queues | Redis + BullMQ, password-protected, not reachable from outside |
| Workers | Internal network only, CPU/memory limits, non-root, restart `unless-stopped` |
| Malware scan | ClamAV on the internal network |
| Health | `GET /api/health` (DB, Redis, storage) backs the app's container healthcheck and deploy verification |
| Logs | Docker `json-file`, 10MB x 5 per service (`docker compose logs <service>`) |

Least-privilege mapping (derived from what each service's code calls):

- app: full DML on all tables (no DDL); storage read/write/list.
- pdf/office/ocr/html workers: `Job` SELECT/UPDATE, `File` SELECT/INSERT;
  storage read on the bucket, write only under `results/*`.
- cleanup worker: `Job` SELECT/UPDATE, `File` SELECT/UPDATE/DELETE; storage
  write (SeaweedFS "Write" = put + delete), no read.
- Postgres admin role: migrations only.

Known limit of the SeaweedFS identity model: "Write" includes delete, so a
worker key could delete or overwrite objects under `results/` (not
`uploads/`). MinIO/IAM-style put-only policies are stricter; a managed
S3-compatible store with IAM policies (S3, R2) restores that if needed --
only the `STORAGE_*` variables change, but the workers then need egress to
that endpoint.

## First deployment (owner actions)

1. **Host**: a Linux VM with Docker Engine + Compose v2, ports 80/443 open,
   everything else closed. Sizing: worker limits total ~9 CPUs / 13 GB
   under full load; 4 vCPU / 8 GB is a sensible start for light traffic.
2. **DNS**: A/AAAA records for `APP_DOMAIN` and `FILES_DOMAIN` -> the host.
3. **SMTP**: a mailbox or relay that supports STARTTLS (587) or TLS (465);
   put its host/user/password in `.env.production`.
4. **On the host**:
   ```sh
   git clone https://github.com/Jedosalih/pdf.git /opt/jpdf && cd /opt/jpdf
   cp .env.production.example .env.production   # fill every value:
   # openssl rand -hex 32 for each secret; chmod 600 .env.production
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait
   curl https://<APP_DOMAIN>/api/health
   ```
5. **Backups**: add a daily cron entry, and copy `backups/` off the host:
   ```cron
   30 3 * * * cd /opt/jpdf && ./deploy/backup.sh scheduled >> /var/log/jpdf-backup.log 2>&1
   ```

## Continuous deployment (GitHub Actions)

`deploy.yml` runs after CI succeeds for a push to `main` and deploys that
exact commit (or a manually dispatched SHA that passed CI on `main`).

Configure once in GitHub -> Settings -> Environments -> `production`:
- Required reviewers (recommended), deployment branch rule: `main` only.
- Secrets: `DEPLOY_HOST`, `DEPLOY_USER` (a deploy-only user in the `docker`
  group), `DEPLOY_SSH_KEY` (its private key), `DEPLOY_KNOWN_HOSTS`
  (`ssh-keyscan -H <host>`, verified against the host's real key),
  `DEPLOY_PATH` (`/opt/jpdf`).
- Variable: `APP_DOMAIN`. Repository variable: `DEPLOY_ENABLED=true`.

Each deploy (`deploy/deploy.sh <sha>`): backup -> check out the commit ->
`compose up --build --wait` -> verify `https://APP_DOMAIN/api/health` ->
on failure, check the previous commit back out and restart it. The
workflow then verifies the health endpoint again from GitHub's network.

## Rollback

- Automatic: a deploy that fails its health checks rolls back to the
  previous commit by itself.
- Manual: run the Deploy workflow (`workflow_dispatch`) with an older SHA
  that passed CI, or on the host: `./deploy/deploy.sh <sha>`.
- Migrations only move forward. A rollback restarts older code on the
  already-migrated schema, so every migration must stay compatible with the
  previous release (add first; drop in a later release). If a migration is
  itself the problem, restore the pre-deploy backup.

## Backups and restore

`deploy/backup.sh [label]` writes `backups/<label>-<UTC time>/` with
`postgres.sql.gz` (pg_dump, verified complete) and `storage.tar.gz`
(SeaweedFS data, verified readable), keeping the newest 14. Every deploy
takes one first (`pre-deploy-<sha>`). Verified 2026-10-21: a failed dump
aborts with an error and no partial backup; a real dump restored into a
fresh database with all data present.

Restore (on the host, from `/opt/jpdf`):
```sh
compose() { docker compose -f docker-compose.prod.yml --env-file .env.production "$@"; }
compose stop app pdf-worker office-worker ocr-worker html-worker cleanup-worker
# Database
compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c backups/<dir>/postgres.sql.gz | compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
compose run --rm migrate          # re-applies role grants
# Object storage
compose stop storage
docker run --rm -v jpdf_storage_data:/data -v "$PWD/backups/<dir>:/b:ro" alpine:3.22 \
  sh -c 'rm -rf /data/* && tar xzf /b/storage.tar.gz -C /data'
compose up -d --wait
```

## Local development and CI

`docker-compose.yml` is for development and CI only: fixed public dev
credentials, every port bound to 127.0.0.1, MinIO for storage (fine for a
local disposable stack), and Mailpit capturing all email
(http://localhost:8025). `docker-compose.test.yml` runs an isolated copy
next to it (see README).
