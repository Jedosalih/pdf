# JPdf maintenance report (2026-10-21)

Post-interruption audit and maintenance pass. No push, no deployment.
Detailed reasoning for every change is in `docs/DECISIONS.md` (three
2026-10-21 entries plus the retroactive `a49626c` entry).

## A. Overall status

**Maintenance mostly completed, with explicit blockers.** All
13 audit findings plus 6 found during the work are fixed and verified
locally. Remaining blockers are owner actions (revoke the leaked GitHub
token, choose hosting) and things only a real GitHub/production run can
prove (CI on GitHub, deployment).

## B. Fixes

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

## C. Verification (all run on 2026-10-21, local machine)

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

## D. Remaining risks

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

## E. Owner actions

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

## F. Git status

- Branch `main`. Local maintenance commits were created on top of
  `a49626c` (listed with hashes in the final hand-off message).
- `origin` is `https://github.com/Jedosalih/pdf.git` (no credential).
  Divergence from GitHub is **unverified**: nothing was fetched or
  pushed (the last-known tracking ref said 29 ahead before this work).
- `JPdf_Project_Memory_and_Recovery.md` (your recovery note) is left
  untracked, untouched.
- **Pushing is safe to consider only after E1–E2.** Fetch first to
  confirm nobody else pushed to `main`.

## G. Readiness for new feature work

**Ready, with conditions.** The codebase builds, typechecks and lints
clean; the full E2E suite and all worker-level security tests pass; no
known Critical/High code defects remain. Before building on it:

1. Revoke the token (E1).
2. Get one green CI run on GitHub, so regressions are caught
   automatically from the first new feature.
3. Treat the production template as unproven until it runs on a real host
   behind a real proxy.

## H. Documentation updated

`docs/DECISIONS.md`, `docs/SECURITY.md` (§1, §2, §6, §7, §11),
`docs/DEPLOYMENT.md` (rewritten), `README.md`, `AGENTS.md` (git rules),
`.env.production.example`, tool FAQ copy (en/ar/tr), and this report.
