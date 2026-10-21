# JPdf maintenance report

Two passes on 2026-10-21. The newest is first. Reasoning for every change
is in `docs/DECISIONS.md`.

# Pass 2: productization (auth, tool UX, CI/CD, production stack)

## A. Status

**Code, CI and the production template are done and verified; JPdf is not
publicly deployed.** No hosting account, domain or SMTP credentials exist
in this environment, so there is no public URL (none was invented). CD is
complete but disabled until a host is configured.

- Repository: https://github.com/Jedosalih/pdf (pushed `main`, fast-forward
  from `49f7d02`; no remote work overwritten).
- CI on GitHub Actions: **PASS**, run 39689372434 on `159a9f8`
  (https://github.com/Jedosalih/pdf/actions/runs/39689372434): static,
  dependency audit, build + images, and full-stack E2E (183 Playwright
  tests passed). The Deploy workflow ran and was skipped, as designed,
  because `DEPLOY_ENABLED` is not set.

## B. What changed

| Area | Change | Proof |
|---|---|---|
| Auth | Email verification + password reset on the existing system (`AuthToken`, one migration): single-use HMAC'd tokens, 24h / 30min, atomic consume, verify via button POST. Registration/forgot/resend never reveal whether an account exists; login timing-equalized; `EMAIL_NOT_VERIFIED` only after the right password; new session per login; reset revokes all sessions, password change revokes the others. Same-origin check, JSON-only, 8KB cap, strict schemas, per-IP + per-email limits on every auth POST; password policy (>=10 chars, <=72 bytes, not common, not the email) | `tests/e2e/auth-flows.spec.ts` (11), plus every sign-up in the suite via the real email link |
| Email | Plain SMTP via nodemailer (STARTTLS/TLS required in production, certs verified, timeouts); localized HTML/text templates (en/ar/tr, RTL), values escaped, links only from `NEXT_PUBLIC_SITE_URL`; Mailpit captures mail in dev/CI | Real SMTP delivery to Mailpit in E2E. **Real mailbox delivery: NOT TESTED** (no credentials) |
| Cleanup | Removed 7 verified-unused components and `@types/bcryptjs`; dead env vars dropped from `.env.example` (knip candidates each checked by hand; false positives kept) | typecheck/lint/build |
| Tools | Audited all 35. Fixed: compress returning bigger files as "success"; no page navigation on phones in edit/redact/fill-sign (+ fit-to-width zoom); un-cancelled pdf.js renders on zoom/page change; compare original couldn't be replaced; "How it works" naming buttons that don't exist (en/ar/tr) | `tool-pages.spec.ts` (94: every tool/page, en/ar, phone width, no console errors/overflow/raw keys/wrong `accept`), real-compression test, phone page-2 redaction, compare replacement |
| CI | 4 jobs: static (lint, all typechecks, prisma, prod compose), security (audit gate with reviewed allowlist), build (next build, workers, app image), e2e (full stack, migration drift check, worker-image security tests, full Playwright suite) | See A |
| CD | `deploy.yml`: deploys only the CI-tested SHA from `main` via the `production` environment over SSH (pinned host key); skipped until `DEPLOY_ENABLED=true`. `deploy/deploy.sh`: backup, checkout, `--wait` rollout, health check, automatic rollback | Input validation exercised; full deploy run blocked locally (see D) |
| Production stack | Caddy (only public service, auto HTTPS, HSTS/security headers); SeaweedFS replaces unmaintained MinIO images (verified signed URLs, scoped keys, unsigned/tampered refused); public storage host GET/HEAD only; storage and workers with no outbound network; per-service Postgres roles | Local HTTPS smoke test: health, headers, redirect, real job + signed download, spoofed X-Forwarded-For ignored, only 80/443 published, 21 privilege/network checks |
| Backups | `deploy/backup.sh` (pg_dump verified complete + storage archive, retention); restore runbook | Failure path fails loudly (fixed a pg_dump-pipe bug that produced empty "successful" dumps); dump restored into a fresh DB with all data |
| MinIO removed everywhere | The first real CI run failed: `minio/minio` and `minio/mc` are no longer pullable from Docker Hub (anonymous 401); local runs had worked only from cached images. Dev/CI now use SeaweedFS as well (host port 9000, existing `.env` unchanged; region `auto` verified on a native SeaweedFS binary). CI uses an explicit readiness check instead of `compose up --wait` | Registry check of every pinned image; green CI (see A, D2) |
| Lockfile | npm on Windows drops optional `@emnapi/*` entries, breaking Linux `npm ci` (already broken at HEAD). Re-resolved on Linux; rule in AGENTS.md | Linux `npm ci --dry-run` OK; CI install |

## C. Verification (PASS / FAIL / BLOCKED / NOT RUN)

| Check | Result |
|---|---|
| App typecheck, 5 worker typechecks, ESLint | PASS (local and GitHub) |
| Prisma validate; migrate deploy on disposable DB; migration drift check | PASS |
| Production build (`next build`) | PASS (local and GitHub) |
| Worker images + app image | PASS (GitHub build/e2e jobs; locally before the disk incident) |
| Dependency gate | PASS (GitHub): app prod deps 0; 2 allowlisted, reviewed office-worker advisories |
| Auth suite (11) + all sign-up specs | PASS (local, 22/22) |
| Tool page checks (94), changed tool specs | PASS (local) |
| Worker-image security tests (redaction 14, passwords 13, cleanup 13) | PASS (local; also in CI e2e job) |
| Full E2E suite | PASS on GitHub Actions: 183/183 (run 39689372434), after five failing runs, each traced to a real cause (D2) |
| Production stack HTTPS smoke test + privilege checks | PASS (local, `*.localhost`) |
| Backup / restore | PASS (DB restore into fresh DB); full in-place restore runbook NOT RUN |
| `deploy.sh` full run | BLOCKED: local Docker became unusable during the test (disk full, see D) |
| GitHub Actions CD | NOT RUN: disabled, no host |
| Public HTTPS smoke test | NOT RUN: no deployment |
| SMTP to a real mailbox | NOT RUN: no credentials |

## D. Incident during this pass: D: drive filled, Docker data disk stuck

Building the full production image set for the deploy test filled D: (0.02
GB free); Docker Desktop's data disk lives there. I stopped all builds,
freed 1.6 GB by deleting only the regenerable `.next/dev` cache, and
restarted Docker Desktop (WSL distro `docker-desktop` only). The new Docker
session then could not attach its data disk (it was still attached to the
WSL VM) and **tried to format a device** -- the attempt failed. I stopped
Docker Desktop immediately so it cannot retry.

Current state, verified read-only: `docker_data.vhdx` (58 GB) last written
20:33, before any restart; the disk still carries its ext4 filesystem (not
formatted). Your dev volumes are inside it; your dev stack had been stopped
before the incident. Docker Desktop is **stopped** and must stay stopped
until you choose how to recover (it could otherwise retry the format).

Safe recovery (owner decision -- it also stops your Ubuntu WSL distro):
1. Make free space on D: first (ideally a copy of
   `D:\DockerData\wsl\disk\docker_data.vhdx` somewhere safe -- 58 GB).
2. `wsl --shutdown` (detaches the disk cleanly).
3. Optional check before Docker touches it: `wsl --mount --vhd
   D:\DockerData\wsl\disk\docker_data.vhdx --bare`, then in Ubuntu
   `sudo e2fsck -n /dev/sdX` (read-only), then `wsl --unmount`.
4. Start Docker Desktop and watch `docker ps`.
5. Reclaim space inside Docker: `docker builder prune` (17.9 GB of build
   cache, no data) and the throwaway images from this session
   (`jpdf-prodtest-*`, `jpdf-test-*`); then compact the VHDX to return
   space to D:.

## D2. Getting CI green: real failures found on GitHub

Each failing run's cause was read from run annotations, which are public.
Downloading job logs needs repo-admin rights. No assertion was weakened.

1. MinIO images not pullable: switched dev/CI to SeaweedFS.
2. Building all five worker images in parallel thrashed the runner for
   over an hour. Images are now built one at a time, with runner disk
   freed first.
3. `compose up` hung behind the one-shot bucket-init container. Bucket
   creation moved into the storage entrypoint (dev and prod).
4. Cleanup sweep test raced the running cleanup worker. The worker is now
   paused for that test.
5. All uploads failed (61 E2E tests). A new host-side storage probe showed
   ECONNRESET. SeaweedFS was listening on only one of the container's two
   networks; now `-ip.bind=0.0.0.0`. **This affected local dev on
   SeaweedFS too**, not just CI.

## E. Remaining blockers (owner actions)

1. **Docker recovery** (D above) before using Docker locally again.
2. **Revoke the old GitHub PAT** (it was in `.git/config`; removed from the
   URL, not revoked). Pushing now works over SSH with your key.
3. **Hosting**: a Linux VM with Docker, DNS for two hostnames, SMTP
   credentials, `.env.production`, then GitHub `production` environment
   secrets and `DEPLOY_ENABLED=true` (docs/DEPLOYMENT.md). No URL exists
   until then.
4. **SMTP**: real mailbox delivery has not been tested, because no
   credentials were available. Mail was tested end to end only against
   Mailpit. Send one verification email from the server once SMTP is set.
5. Optional: local dev files stored before this pass are in the old
   `pdf_minio_data` volume (untouched); dev now uses a new SeaweedFS
   volume. They are dev data only; delete or migrate them as you prefer.

## F. Git

`main` = `origin/main` (pushed over SSH). Working tree clean apart from
your untracked recovery note.


---

# Pass 1: post-interruption audit and maintenance

> Historical record of the first pass. Where Pass 2 above differs (CI has
> since run on GitHub, MinIO was replaced, the code was pushed), Pass 2 is
> current.

Post-interruption audit and maintenance pass. No push, no deployment.
Detailed reasoning for every change is in `docs/DECISIONS.md` (three
2026-10-21 entries plus the retroactive `a49626c` entry).

### A. Overall status

**Maintenance mostly completed, with explicit blockers.** All
13 audit findings plus 6 found during the work are fixed and verified
locally. Remaining blockers are owner actions (revoke the leaked GitHub
token, choose hosting) and things only a real GitHub/production run can
prove (CI on GitHub, deployment).

### B. Fixes

| ID | Finding | Status | What changed | Proof |
|---|---|---|---|---|
| F1 | Redaction left original page content, form values and metadata recoverable | **Fixed** | Output rebuilt as a new document: encrypted/unparseable input refused, annotations flattened, redacted pages rasterized (`-cropbox`), no source catalog structures, `qpdf --empty --pages` rebuild drops unreachable objects and unused shared resources. `workers/pdf/src/redaction.ts`, `pureCompute/redactAssemble.ts` | `workers/pdf/src/redaction.test.ts` 14/14 (fully decoded bytes searched for 13 markers in raw/hex/UTF-16); `tests/e2e/redact-pdf.spec.ts` byte-level UI test |
| F2 | Next.js 16.3.4 advisories (incl. critical) | **Fixed** | next 16.3.8, sharp 0.35.5, Prisma 7.10.1, markdown-it 14.3.3, sanitize-html 2.18.1, in-range transitive fixes. No majors | `npm audit --omit=dev`: app 0; pdf/ocr/html/cleanup 0. Remaining: dev-only tooling + 2 unreachable office-worker chains (below) |
| F3 | No upload/job rate limits; unbounded request bodies; cookie-only guest quota | **Fixed** | Per-IP + per-actor rate limits, per-IP guest daily job cap, streaming body caps, `toolId` in query so the real limit is known first, atomic `INCR`+`EXPIRE NX`, client IP = rightmost trusted `X-Forwarded-For` hop. `lib/security/{abuseLimits,rateLimit,requestBody,clientIp}.ts` | `abuse-controls.spec.ts` (6), `security-helpers.spec.ts` (7) |
| F4 | Page limit failed open | **Fixed** (and worse than reported, see F14) | Fail closed via pdf-lib count; `unlock-pdf`/`repair-pdf` defer to a server-stamped worker check. `lib/security/pageCount.ts`, `workers/pdf/src/pageLimit.ts` | `page-limit-fail-closed.spec.ts` (5) |
| F5 | GitHub PAT in plaintext in `.git/config` | **Partially fixed** | Removed from the `origin` URL; Git Credential Manager already configured. The token itself is still valid | Owner must revoke it (section E) |
| F6 | `a49626c` undocumented; DEPLOYMENT.md contradictions | **Fixed** | DECISIONS entry; DEPLOYMENT.md rewritten; README and SECURITY.md corrected | Doc review |
| F7 | CI never run; missing Prisma generate | **Fixed locally, not run on GitHub** | Prisma generate steps (with a scoped placeholder `DATABASE_URL`), worker-image security tests, prod compose validation. Also fixed 2 latent CI failures found while testing (F17, F18) | Every step exercised locally; GitHub run pending a push |
| F8 | Polling/queue reliability | **Fixed** | Client polling: retries, 4xx terminal, 15-min deadline, cleanup on unmount (tool pages + batch). Enqueue failure fails the job and refunds usage; cleanup fails jobs lost from BullMQ (never a real backlog) | `job-polling.spec.ts` (3), cleanup `sweep.test.ts` 13/13 |
| F9 | Redaction geometry on rotated/cropped pages | **Fixed (confirmed real)** | pdftoppm rendered the MediaBox while boxes are CropBox-relative; now `-cropbox`, page sized from the visible box | Pixel checks in `redaction.test.ts` |
| F10 | qpdf password parsing | **Fixed** | qpdf 11.3 can't take `-`-prefixed passwords on argv at all; passwords now go through `--job-json-file`; no trimming; protect refuses >127 bytes (AES-256 truncation) | `workers/pdf/src/qpdfJob.test.ts` 13/13 |
| F11 | Compose unsafe as production config | **Fixed (template)** | Dev compose: ports on 127.0.0.1, images pinned by digest. New `docker-compose.prod.yml` + `Dockerfile` + `deploy/`: secrets from env, Redis password, per-service Postgres roles and MinIO keys, workers on an internal network. `npm ci` in all Dockerfiles; `.dockerignore` | Prod template started locally: 21/21 least-privilege checks + a real job end to end |
| F12 | Arabic/Turkish download filenames | **Fixed** | RFC 6266/5987 `Content-Disposition`. `lib/storage/contentDisposition.ts` | `download-filename.spec.ts` (real signed-URL header), helper unit test |
| F13 | Stale comments / low-priority items | **Fixed** | Worker-network comment, batch race comment, AGENTS.md git section | — |

Found during the work:

| ID | Finding | Status |
|---|---|---|
| F14 | **`maxPages` was never enforced at runtime**: pdf.js can't load its worker in the Next server bundle, and the error was swallowed as "0 pages" | Fixed (pdf-lib), test proves 301 refused / 300 accepted |
| F15 | Edit/Fill & Sign/Redact FAQs claimed files are "only uploaded when you click Export"; they upload on selection (all 3 locales) | Copy corrected |
| F16 | `/workspace` and `/workspace/settings` returned a 500 on an expired session (page assumed the layout's redirect had run) | Fixed; `auth-session-expiry.spec.ts` |
| F17 | App `package-lock.json` (already at HEAD) failed `npm ci` on Linux: 8 optional entries missing | Re-resolved on Linux, verified |
| F18 | Root `tsconfig.json` type-checked `workers/**`, so app typecheck/build failed without worker `node_modules` (CI's first job, any Docker build) | Workers excluded |
| F19 | Login rate limit used the client-controlled leftmost `X-Forwarded-For` entry | Fixed with F3 |

### C. Verification (all run on 2026-10-21, local machine)

| Check | Command | Result |
|---|---|---|
| App typecheck | `npx tsc --noEmit` | PASS |
| Worker typechecks (5) | `npx tsc --noEmit` per worker | PASS |
| ESLint | `npx eslint .` | PASS |
| Prisma | `npx prisma validate`; `migrate deploy` + seed on a fresh DB | PASS (35 tools, 105 limits) |
| Production build | `npm run build` | PASS |
| Worker images (5) | `docker compose build` (`npm ci`) | PASS |
| App image + prod template | `docker compose -f docker-compose.prod.yml up` (throwaway secrets) | PASS: migrate/seed/grants, scoped keys, health ok, real job COMPLETED |
| Least privilege | 21 DB/storage/network checks against the prod template | 21/21 PASS (one first reported as a fail was the checking tool; re-verified with the SDK call the worker makes) |
| Redaction regression | `node dist/redaction.test.js` in pdf-worker image | 14/14 PASS |
| qpdf passwords | `node dist/qpdfJob.test.js` | 13/13 PASS |
| Cleanup sweeps | `node dist/sweep.test.js` on the isolated DB | 13/13 PASS |
| Full E2E | `npx playwright test --workers=1` (isolated stack) | **75/75 PASS** (final run). The previous run had 1 failure, a test race (file picked before hydration), fixed in the test and re-verified |
| Dependency audit | `npm audit` (app + 5 workers) | app prod deps 0; see D for the rest |
| CI workflow | YAML parse + every step run locally | **NOT RUN on GitHub** (no push allowed) |
| CD / public deployment | — | **NOT APPLICABLE**: none exists |

All tests ran against an isolated `jpdf-test` Compose project with its
own volumes. Your dev volumes (`pdf_*`) were never used or modified.

### D. Remaining risks

| Severity | Risk | Action |
|---|---|---|
| High | The leaked GitHub PAT is still valid until revoked | Owner: revoke now (E1) |
| Medium | MinIO community images are no longer published (last: Sept 2025); the pinned digest gets no security fixes | Before production: managed S3-compatible storage or a maintained MinIO distribution (docs/DEPLOYMENT.md) |
| Medium | Per-IP limits trust `X-Forwarded-For`; reachable directly without a proxy, they can be spoofed | Production must run behind a reverse proxy that appends the header (template binds the app to 127.0.0.1) |
| Medium | CI has never run on GitHub; first run may expose environment-specific issues | Push to a branch and watch the first run |
| Low | Ghostscript in the worker images is Debian bookworm 10.0.0 (security patches backported by Debian, only picked up on image rebuild) | Rebuild images regularly |
| Low | Unreachable advisories left: pptxgenjs → image-size (only our own PNGs), exceljs → uuid (v3/v5/v6 buffer API unused), eslint tooling (dev only). Only fixable by major downgrades | Re-check on the next dependency pass |
| Low | Usage isn't refunded for a job the cleanup sweep fails as `QUEUE_LOST` (no job link on `UsageRecord`) | Needs a schema change; decide later |
| Low | Guests behind one NAT share per-IP limits | Tune via env if needed |
| Info | D: drive has 7.5 GB free (was 18.2 GB); the new test/prod-template images live in Docker's VHDX. Nothing was deleted (standing rule) | Owner decision: e.g. `docker image rm jpdf-prodtest-app jpdf-prodtest-pdf-worker jpdf-prodtest-cleanup-worker` |

### E. Owner actions

1. **Revoke the GitHub fine-grained PAT** that was embedded in the
   `origin` URL (GitHub → Settings → Developer settings → Personal access
   tokens). It was stored in plaintext and appeared in a tool output.
2. **Set up safe GitHub auth** before pushing: sign Git Credential Manager
   in as `Jedosalih` (it previously cached a different account that 403s)
   or use `gh auth login`. Don't put a token back in the remote URL.
3. **Then push** (see F) and check the first CI run.
4. **Hosting, domain, HTTPS, object storage choice, backups**:
   prerequisites in `docs/DEPLOYMENT.md`. Nothing was deployed or created
   in any external account.

### F. Git status

- Branch `main`. Local maintenance commits were created on top of
  `a49626c` (listed with hashes in the final hand-off message).
- `origin` is `https://github.com/Jedosalih/pdf.git` (no credential).
  Divergence from GitHub is **unverified**: nothing was fetched or
  pushed (the last-known tracking ref said 29 ahead before this work).
- `JPdf_Project_Memory_and_Recovery.md` (your recovery note) is left
  untracked, untouched.
- **Pushing is safe to consider only after E1–E2.** Fetch first to
  confirm nobody else pushed to `main`.

### G. Readiness for new feature work

**Ready, with conditions.** The codebase builds, typechecks and lints
clean; the full E2E suite and all worker-level security tests pass; no
known Critical/High code defects remain. Before building on it:

1. Revoke the token (E1).
2. Get one green CI run on GitHub, so regressions are caught
   automatically from the first new feature.
3. Treat the production template as unproven until it runs on a real host
   behind a real proxy.

### H. Documentation updated

`docs/DECISIONS.md`, `docs/SECURITY.md` (§1, §2, §6, §7, §11),
`docs/DEPLOYMENT.md` (rewritten), `README.md`, `AGENTS.md` (git rules),
`.env.production.example`, tool FAQ copy (en/ar/tr), and this report.
