# JPdf — Final Completion Mission

## Objective

Complete the remaining JPdf product work in one coordinated pass, then publish the project to GitHub, add GitHub Actions CI/CD, and deploy the application through the existing production infrastructure so the public can visit JPdf and use it for document/PDF conversion and processing.

Do not rebuild working features unnecessarily. Inspect the existing repository and infrastructure first, reuse the current architecture, and verify every completed item.

---

# 1. Current State

JPdf already includes:

- Real PDF editor: text, images, rectangles, highlights, freehand drawing, undo/redo, zoom, page navigation.
- Fill & Sign: AcroForm field filling plus visual signatures.
- Real PDF redaction using rasterization so redacted source content is discarded.
- PDF comparison: separate text diff and visual/pixel diff.
- Batch processing.
- Workspace chaining: reuse a previous job's output as another tool's input.
- PDF → Text.
- PDF → PDF/A.
- Flatten PDF.
- Repair PDF.
- Word ↔ PDF.
- Excel ↔ PDF.
- PowerPoint ↔ PDF.
- OCR.
- HTML → PDF.
- Markdown → PDF.
- maxPages enforcement.
- JPdf branding rename.
- Security hardening, including non-root workers and chaining/batch validation fixes.

Latest known local security-audit commit:

```text
4065ce6 Security audit pass: non-root workers, close chaining/batch gaps, fix SECURITY.md
```

All existing commits are local until the GitHub publishing stage below.

---

# 2. New Conversion Tools

## 2.1 PDF → HTML

Implement a real `pdf-to-html` tool using the existing JPdf tool/worker architecture.

Requirements:

- Accept PDF input.
- Produce a valid `.html` output.
- Preserve useful document structure where the source PDF allows it.
- Handle text-based PDFs.
- Preserve/extract images where reasonably supported by the selected engine.
- Do not claim pixel-perfect reconstruction when the PDF does not contain enough semantic information.
- Inspect `docs/PDF_ENGINE.md` and existing conversion workers before choosing an engine.
- Reuse existing dependencies and infrastructure where practical.
- Apply normal JPdf validation and limits:
  - MIME/type validation
  - extension validation
  - file-size limits
  - maxPages
  - usage limits
  - job authorization
- Integrate the output with the normal JPdf job/result/download flow.
- Add the tool to the public tool registry and UI.
- Add all required locale translations.
- Add unit/integration/smoke coverage appropriate to the project.

## 2.2 PDF → Markdown

Implement a real `pdf-to-md` tool.

Requirements:

- Accept PDF input.
- Produce a `.md` Markdown file.
- Preserve meaningful structure where possible:
  - headings
  - paragraphs
  - lists
  - tables where reliably detectable
- Do not invent structure that cannot reasonably be inferred.
- Support scanned/image-only PDFs through the existing OCR capabilities where appropriate.
- Reuse existing PDF/OCR infrastructure instead of duplicating it.
- Apply the normal JPdf type, size, page, usage, authorization, job, and output controls.
- Add the tool to the public registry/UI.
- Add all required translations.
- Add tests and conversion smoke tests.

The output should be useful Markdown, not simply a renamed raw text extraction.

---

# 3. Existing HTML/Markdown → PDF

`html-to-pdf` and `markdown-to-pdf` already exist.

Do not rebuild them unless verification finds a real defect.

Verify that both still work after the new additions, including:

- UI registration
- limits
- security controls
- translations
- worker behavior
- output/download flow
- representative conversion tests

Fix only real defects discovered during verification.

---

# 4. Remaining Production Hardening

Use the previous final report as the baseline and close the following gaps where practical.

## 4.1 Malware / Antivirus Scanning

Investigate and implement upload malware scanning, preferably with a maintained engine such as ClamAV if compatible with the current deployment.

Requirements:

- Scan uploads before processing where practical.
- Fail safely on detected malware.
- Do not expose scanner internals to users.
- Do not log file contents, secrets, or unnecessary PII.
- Add test/mocking coverage suitable for CI.

If full implementation is impractical without a major architecture change, document the exact limitation instead of claiming completion.

## 4.2 Worker CPU/Memory Limits

Add practical CPU and memory limits to the four worker containers where supported:

- pdf
- office
- ocr
- html

Choose limits compatible with legitimate workloads such as OCR, Office conversion, and Chromium rendering. Document the chosen limits.

## 4.3 Worker Network Egress

Implement container/infrastructure-level network egress restrictions where practical.

The existing `html-to-pdf` application-level SSRF protection (`context.route()` blocking and JavaScript restrictions) must remain.

The goal is to add the documented infrastructure backstop without breaking required internal communication.

## 4.4 Timeouts for Pure pdf-lib Handlers

Previously uncovered handlers:

```text
edit-pdf
fill-sign-pdf
page-numbers
watermark-pdf
pdf-metadata
image-to-pdf
```

Add appropriate application-level execution/time-budget protection.

Do not create a fake timeout that leaves runaway processing running indefinitely.

Verify normal, large/complex, timeout, failure, and cleanup paths.

## 4.5 Cleanup Worker

Implement the missing:

```text
workers/cleanup
```

It should safely handle:

- expired guest files
- orphaned temporary directories
- stale processing artifacts
- storage growth prevention

Requirements:

- Never delete active jobs.
- Define clear retention rules.
- Log safely without PII/secrets.
- Run on a schedule using the existing deployment conventions.
- Make cleanup logic testable.
- Document behavior.

## 4.6 Atomic dailyOperations Limit

The previous batch-specific race was fixed, but the general check-then-write race remains.

Replace it with an atomic DB operation/transaction/row-lock approach, or Redis `INCR` only if Redis is already appropriate.

Prefer the simplest reliable DB solution if Redis is not already part of the architecture.

Add a concurrency test proving that simultaneous requests cannot bypass the intended limit.

## 4.7 PRO Tool Limits

Add explicit `ToolLimit` seed/configuration rows for the PRO tier.

Do not invent billing/pricing behavior. Billing is not required to become live here.

## 4.8 Prisma Cleanup

Inspect these previously identified vestigial columns:

```text
File.checksum
File.pageCount
UsageRecord.count
UsageRecord.windowStart
```

If genuinely unused:

- remove them from Prisma
- create the correct migration
- update code/tests
- verify migration safety

If still required, leave them and document why.

---

# 5. Final Repository / Secrets Audit

Before publishing to GitHub:

- Inspect `.gitignore`.
- Inspect `.dockerignore`.
- Inspect all environment/config files.
- Inspect Docker configuration.
- Search the entire repository for secrets and sensitive files.

Specifically search for:

- API keys
- passwords
- tokens
- private certificates/keys
- SMTP credentials
- database credentials
- production secrets
- `.env` files
- private uploaded documents
- database dumps
- logs containing sensitive information

Never commit production secrets.

If a secret was committed historically, identify it and recommend/perform rotation rather than assuming removing it from the latest commit is sufficient.

---

# 6. GitHub Repository

Determine the intended GitHub repository from the current local Git configuration.

Do not invent a repository URL.

If a remote already exists:

- inspect it
- verify it is the intended repository
- do not overwrite an unrelated remote

If there is no suitable remote and authenticated GitHub tooling is available, prepare/create/configure the repository according to the available authorized workflow. Otherwise report the exact one-time manual step required.

The repository should contain the application, workers, Docker/deployment configuration, migrations, documentation, tests, and GitHub Actions workflows.

---

# 7. GitHub Actions CI

Create a proper GitHub Actions CI workflow.

At minimum it should:

1. Install dependencies.
2. Run formatting/lint checks where applicable.
3. Run TypeScript checks.
4. Run relevant unit/integration tests.
5. Build the application.
6. Test/build all worker packages as appropriate.
7. Build Docker images where practical.
8. Fail on real errors.

Avoid requiring production secrets for normal CI unless strictly necessary.

Use service containers, test databases, or mocks where practical.

---

# 8. GitHub Actions Deployment / CD

Target architecture:

```text
Push to GitHub
      ↓
GitHub Actions
      ↓
Build + Test
      ↓
Deploy
      ↓
Migrations / service update
      ↓
Health check
      ↓
Public JPdf instance
```

Inspect the existing production infrastructure before designing deployment.

If the project already uses Docker Compose, systemd, Nginx/Caddy, SSH, or another deployment mechanism, preserve it where reasonable.

Deployment must:

- deploy only after successful CI
- use GitHub Actions Secrets for credentials
- never print secrets in logs
- run migrations safely
- restart/update services safely
- perform a health check
- fail clearly when deployment fails
- leave the previous deployment usable when a safe rollback strategy is available

Never place credentials directly in workflow YAML or source files.

---

# 9. Make JPdf Public

The final goal is a real public production deployment.

A normal visitor must be able to:

1. Open the public JPdf URL.
2. Select a tool.
3. Upload a supported file.
4. Process it.
5. Download the result.

Verify the public deployment, not only localhost.

Verify at least:

```text
Homepage
Tool pages
Upload
Job creation
Processing
Result retrieval
Download
Guest limits
Authentication behavior
Batch processing
Workspace chaining
PDF → HTML
PDF → Markdown
HTML → PDF
Markdown → PDF
OCR
Office conversion
Editor
Redaction
Compare
Fill & Sign
```

Do not claim the project is live until the public endpoint has been verified from outside the local machine.

---

# 10. Domain and HTTPS

Inspect the current production configuration.

If an existing domain is available:

- configure the JPdf service behind the existing reverse proxy
- enable HTTPS
- verify certificates
- verify HTTP/HTTPS behavior

If no domain exists, do not invent one. Document the exact DNS/domain step required.

GitHub Pages is NOT a substitute for the actual JPdf backend/runtime. GitHub Actions must deploy to a real application runtime capable of running the Next.js application and workers.

---

# 11. Final Security Review

After all code changes, perform another security review.

### Upload security

Verify:

- MIME/type validation
- extension validation
- file-size limits
- page limits
- malformed-file handling
- path traversal protection
- safe temporary paths
- safe output paths
- malware scanning if implemented

### Job isolation

Verify:

- cross-user job access is blocked
- cross-user output access is blocked
- workspace chaining cannot bypass destination limits
- batch processing cannot bypass usage limits

### Worker security

Verify:

- non-root execution
- CPU/memory limits where implemented
- network restrictions where implemented
- timeouts where applicable
- temporary-file cleanup

### HTML/URL security

Verify:

- SSRF protection
- JavaScript restrictions
- network egress restrictions where implemented
- safe local file handling
- no arbitrary URL fetching outside the intended policy

### Application security

Verify:

- authentication/authorization
- secure cookies
- usage/rate controls
- secret handling
- safe error responses
- no sensitive information in logs

---

# 12. Documentation

Update documentation so it describes the actual implementation, not the original plan.

Update as appropriate:

```text
docs/PDF_ENGINE.md
docs/SECURITY.md
docs/DECISIONS.md
README.md
deployment documentation
environment-variable documentation
```

README should cover:

- what JPdf is
- supported capabilities
- conversion matrix
- architecture overview
- local development
- Docker setup
- environment variables
- testing
- deployment
- GitHub Actions
- security model
- known limitations

Explicitly document:

```text
PDF → HTML
PDF → Markdown
HTML → PDF
Markdown → PDF
```

---

# 13. Testing

Do not finish merely because the project compiles.

Run:

## Static checks

```text
TypeScript
ESLint
```

## Full application tests

Run the complete existing Playwright/application suite.

## Worker tests

Run tests for all worker packages.

## Conversion smoke tests

Test representative files for:

```text
PDF → Text
PDF → HTML
PDF → Markdown
PDF → PDF/A
PDF → Word
PDF → Excel
PDF → PowerPoint

Word → PDF
Excel → PDF
PowerPoint → PDF

HTML → PDF
Markdown → PDF

OCR
Repair
Flatten
Redaction
Compare
Fill & Sign
Editor
Batch
Workspace chaining
```

Where practical use:

- text PDF
- scanned/image-only PDF
- multi-page PDF
- PDF with images
- problematic/malformed PDF

For PDF → HTML and PDF → Markdown specifically, inspect the actual generated files, not only the exit code.

---

# 14. Git Commit Strategy

Keep the history logical and reviewable. Do not squash the entire mission into one giant commit.

Suggested commit grouping:

```text
Add PDF to HTML conversion
Add PDF to Markdown conversion
Harden production worker execution
Add cleanup worker
Make usage limits atomic
Add PRO tool limits
Clean unused Prisma fields
Add GitHub CI workflow
Add production deployment workflow
Update deployment/security documentation
Final production verification
```

Adapt commit boundaries to the actual implementation.

---

# 15. Push to GitHub

Only push after the implementation and verification stages are complete.

Before pushing:

```bash
git status
git log --oneline
git remote -v
```

Then push the intended branch to the verified GitHub remote.

Do not force-push unless explicitly required and authorized.

After pushing verify:

- repository contains expected commits
- GitHub Actions starts
- CI passes
- deployment workflow runs correctly
- production is reachable

---

# 16. Production Smoke Test

After deployment, test the actual public URL as an external user.

Verify:

```text
GET /
GET tool pages
upload
job creation
processing
result retrieval
download
```

Then explicitly test:

```text
PDF → HTML
PDF → Markdown
HTML → PDF
Markdown → PDF
```

Also verify the major existing tools still work.

Check for:

- application/server errors
- worker crash loops
- failed migrations
- permission errors
- broken translations
- broken navigation
- exposed secrets
- meaningful browser console errors

---

# 17. Definition of Done

The mission is complete only when all applicable items are true:

- [ ] PDF → HTML implemented and tested
- [ ] PDF → Markdown implemented and tested
- [ ] HTML → PDF verified
- [ ] Markdown → PDF verified
- [ ] Malware scanning implemented or explicitly documented as a remaining limitation
- [ ] Worker CPU/memory limits implemented or explicitly documented
- [ ] Worker network egress restrictions implemented or explicitly documented
- [ ] Timeouts added for pure pdf-lib handlers
- [ ] Cleanup worker implemented
- [ ] General dailyOperations race fixed atomically
- [ ] PRO ToolLimits configured
- [ ] Unused Prisma fields reviewed and safely removed where appropriate
- [ ] Repository secrets audit completed
- [ ] GitHub repository verified
- [ ] GitHub Actions CI implemented
- [ ] GitHub Actions deployment implemented
- [ ] Production deployment completed
- [ ] HTTPS verified
- [ ] Public JPdf URL verified
- [ ] Public upload → processing → download flow verified
- [ ] PDF → HTML publicly verified
- [ ] PDF → Markdown publicly verified
- [ ] HTML → PDF publicly verified
- [ ] Markdown → PDF publicly verified
- [ ] Existing core tools smoke-tested
- [ ] Full relevant test suite run
- [ ] Documentation updated
- [ ] Git history clean and understandable
- [ ] Final push completed
- [ ] Final production verification completed
- [ ] Final report produced with honest limitations

---

# 18. Final Report Required From Claude Code

At the end, report:

## Implemented

Every feature actually completed.

## Remaining Limitations

Anything that remains incomplete or best-effort.

## Security

Security controls added and verified.

## Tests

Include:

- TypeScript status
- ESLint status
- Playwright/application test count and result
- worker test result
- conversion smoke-test result
- production smoke-test result

## Git

Include:

- final commit hash
- branch
- GitHub remote/repository
- push result

## GitHub Actions

Include:

- workflow names
- CI result
- deployment result

## Deployment

Include:

- deployment method
- public URL
- health-check result
- worker status
- migration status

## Conversion Matrix

Explicitly report:

```text
PDF → HTML       implemented / limitation
PDF → Markdown   implemented / limitation
HTML → PDF       verified / limitation
Markdown → PDF   verified / limitation
```

## Known Limitations

Be completely honest. Never mark a feature complete if it only works partially.

---

# Engineering Rules

1. Inspect before modifying.
2. Reuse the existing JPdf architecture.
3. Do not replace working implementations without a concrete reason.
4. Do not add unnecessary dependencies.
5. Do not introduce a new hosting provider if the current production infrastructure is usable.
6. Never commit secrets.
7. Never expose secrets in CI/deployment logs.
8. Never bypass existing authorization, usage, type, size, or page-limit controls.
9. Preserve the existing non-root worker model.
10. Workspace chaining must always validate against the destination tool's limits.
11. Batch processing must not bypass usage limits.
12. New Server Actions must follow the project's existing instrumentation pattern.
13. New API routes must follow the project's existing route-timing pattern.
14. Meaningful mutations must use the existing audit logging pattern.
15. Keep security events separate from ordinary audit events.
16. Do not place PII or secrets in audit metadata.
17. Do not weaken security merely to make tests pass.
18. Investigate flaky tests rather than masking them.
19. If something cannot be fully implemented reliably, document the limitation precisely.
20. Documentation must describe the actual running system.
21. Do not leave fake TODO implementations behind.
22. Do not claim the application is publicly live until an external production smoke test succeeds.

---

# Final Objective

When this mission is finished, JPdf should be a publicly accessible, GitHub-hosted, continuously tested and deployable document-processing platform.

A normal user should be able to visit the public JPdf website, upload a supported document, choose a tool, process it, and download the resulting file.

The GitHub repository should be the source of truth. GitHub Actions should verify changes and deploy through the existing production infrastructure. Documentation should accurately describe what the system actually does.

**Complete the project in one coordinated mission and finish with a verified public deployment.**
