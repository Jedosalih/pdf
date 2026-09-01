# Test Plan — JDpdf

## Layers

### Unit tests (Vitest)

- `lib/entitlements` — `canUseTool`/`getToolLimits`/`getRemainingUsage`
  against guest and registered-user scenarios, quota boundaries.
- `lib/tools/registry` — schema validation of every registered tool entry.
- `lib/security/validateUpload` — magic-byte detection, rejection of
  mismatched extension/content, size boundary conditions.
- `lib/seo/metadata` — canonical/hreflang generation for all 3 locales.
- `lib/i18n/format` — number/date formatting per locale.

### Integration tests (Vitest + a real test Postgres/Redis via Docker)

- Upload → `File` row created with correct status/metadata.
- Job creation → BullMQ job enqueued, `Job` row `QUEUED`.
- Worker consuming a queued merge job against real fixture PDFs → `Job`
  reaches `COMPLETED`, output `File` row exists, output is a valid PDF
  (reopen with `pdf-lib`/`pdfinfo` and check page count).
- Failure path: corrupted input PDF → job reaches `FAILED` with a safe
  `errorCode`, no orphaned temp directory left behind.
- Download authorization: a second user/guest cannot fetch another user's
  `File`.

### E2E tests (Playwright)

Critical flows (blueprint §65):

```
Guest → Merge PDF → Download
Guest → Compress PDF → Download
User → Register → Login                      (Phase 4+)
User → Upload → Process                      (Phase 4+)
User → View usage                            (Phase 4+)
Admin → Login → Manage tool                  (Phase 5+)
Admin → Publish content                      (Phase 5+)
```

Run against `en`, `ar` (RTL layout assertions), and `tr`.

### Responsive & accessibility checks

- Playwright viewport matrix: 320, 375, 390, 414, 768, 1024, 1280,
  1440px — upload zone, tool controls, and navigation specifically.
- `axe-core` (via `@axe-core/playwright`) run on the homepage and every
  shipped tool page in each locale — no serious/critical violations.
- Manual keyboard-navigation pass on the upload → process → download flow
  before marking a tool "done."

### Security checks

- Attempt path traversal / null-byte filenames on upload — must be
  rejected or safely neutralized.
- Attempt to enqueue a job referencing a `fileId` the caller doesn't own —
  must be rejected server-side.
- Fuzz a few malformed/corrupted PDFs from the test corpus through each
  worker handler — must fail cleanly (`FAILED` + safe error), never crash
  the worker process or hang past its timeout.

### Performance

- Lighthouse (or `next build && next start` + WebPageTest/Lighthouse CI)
  on homepage + one tool page per locale — track Core Web Vitals, not just
  a pass/fail gate initially.
- Worker throughput sanity check: N concurrent merge jobs against the
  fixture corpus complete within the configured timeout budget.

## PDF test corpus (`docs/fixtures/`, populate incrementally)

- Single-page PDF, multi-page PDF, large PDF (~300 pages, generated)
- Scanned/image-only PDF (for OCR testing)
- Password-protected PDF
- PDF with rotated pages
- Mixed/unusual page sizes
- Image-heavy PDF, text-heavy PDF
- Deliberately corrupted/truncated PDF
- Arabic-text PDF, Turkish-text PDF, English-text PDF

Fixtures are generated/checked into `docs/fixtures/` as small files (not
scraped from the internet) so tests are deterministic and license-clean.

## Definition of done, restated (blueprint §67)

Compiling is not done. A tool is done when: it works against real fixture
files, is responsive, is accessible, is localized (incl. RTL), enforces
limits server-side, handles errors without leaking internals, has no
console errors, and has no broken loading/empty/mobile state.

## What's deferred

Full CI wiring (GitHub Actions running the above on every PR), visual
regression testing, and load testing are valuable but not required to hit
the Phase 0–2 milestone. `docs/DECISIONS.md` tracks when these get added.
