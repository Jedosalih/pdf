# PDF Engine — tool-to-engine mapping

## Engine choices and why

| Engine | License | Used for |
|---|---|---|
| **qpdf** | Apache-2.0 | Merge, split, rotate, page delete/extract/reorder, password protect/decrypt (with user-supplied password), linearization |
| **Ghostscript** | AGPL-3.0 (also available under Artifex commercial license) | Compression/optimization presets, some rasterization |
| **Poppler** (`pdftoppm`, `pdftotext`, `pdfinfo`) | GPL-2.0 | PDF → image, PDF → text, page count/inspection |
| **OCRmyPDF** (wraps Ghostscript + Tesseract + qpdf) | MPL-2.0 | OCR / searchable PDF layer |
| **Tesseract** | Apache-2.0 | OCR text recognition (used via OCRmyPDF) |
| **LibreOffice** (headless) | MPL-2.0 | Word/Excel/PowerPoint → PDF, PDF → Word |
| **Sharp** | Apache-2.0 | Image resizing/format conversion for JPG/PNG ↔ PDF page rasters |
| **exceljs** (Node library) | MIT | PDF → Excel (reconstructing rows/columns from extracted text — LibreOffice cannot do this direction, see below) |
| **pptxgenjs** (Node library) | MIT | PDF → PowerPoint (building image-per-slide decks — LibreOffice cannot do this direction either, see below) |
| **Playwright** (driving Chromium) | Apache-2.0 | HTML → PDF, Markdown → PDF rendering |
| **markdown-it** | MIT | Markdown → HTML parsing (before rendering) |
| **sanitize-html** | MIT | Defense-in-depth HTML sanitization before rendering |

### Licensing note (blueprint §64)

Ghostscript is **AGPL-3.0** when used under its open-source license. AGPL's
network-use clause is triggered by *distributing modified Ghostscript
source*, not by using the unmodified CLI as a subprocess from a proprietary
web app — this is the same usage pattern as ImageMagick, Scribus, and most
"PDF tool" SaaS products, which invoke `gs` as an external process rather
than linking it. We are not modifying or redistributing Ghostscript itself,
only invoking the stock binary via `execFile`. If this product's
distribution model changes (e.g. shipping Ghostscript binaries as part of a
downloadable product), revisit this decision — see `docs/DECISIONS.md`.
All other engines above (qpdf, Poppler-via-CLI, OCRmyPDF, Tesseract,
LibreOffice, Sharp) are permissively/weak-copyleft licensed for this usage
pattern (CLI subprocess, no static linking, no source redistribution).

## Tool → engine → command shape

All commands are invoked via `execFile`/`spawn` with **argument arrays**,
never a shell string. Every path passed is a server-generated path inside a
per-job temp directory — never a user-supplied filename.

### Merge PDF (`merge-pdf`) — qpdf

```
qpdf --empty --pages <in1.pdf> <in2.pdf> ... -- <out.pdf>
```

### Split PDF (`split-pdf`) — qpdf

Page ranges / every N pages / individual pages, one output file per split
unit:

```
qpdf <in.pdf> --pages . <range> -- <out.pdf>
```

### Rotate PDF (`rotate-pdf`) — qpdf

```
qpdf <in.pdf> --rotate=+90:<pages> -- <out.pdf>
```

### Delete / extract / reorder pages (`organize-pdf`, `delete-pages`, `extract-pages`) — qpdf

All share one primitive: qpdf's `--pages` page-selection syntax lets us
build any subset/order/rotation from a single input. One shared worker
handler (`workers/pdf/handlers/pages.ts`) backs all four "page management"
tools; only the option parsing differs per tool in the registry.

### Compress PDF (`compress-pdf`) — Ghostscript

```
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 \
   -dPDFSETTINGS=/screen|/ebook|/printer \
   -dNOPAUSE -dBATCH -sOutputFile=<out.pdf> <in.pdf>
```

`/printer` → Basic, `/ebook` → Balanced, `/screen` → Strong (lowest
quality, smallest size). Implemented in
`workers/pdf/src/handlers/compressPdf.ts`. Report actual before/after
size — never a fabricated estimate (done in `CompressPdfTool` via the
real `outputFiles[0].size` returned by the job).

### PDF → JPG / PNG (`pdf-to-jpg`, `pdf-to-png`) — Poppler (`pdftoppm`)

```
pdftoppm -jpeg|-png -r 150 <in.pdf> <out-prefix>
```

### JPG/PNG → PDF (`jpg-to-pdf`, `png-to-pdf`) — Sharp + a minimal PDF assembler

Normalize each image (orientation/color profile) with Sharp, then embed as
one page per image. Using qpdf's own page-from-image support is limited;
`pdf-lib` (MIT) is an acceptable small dependency here for pure image→PDF
assembly, since it doesn't shell out and has no native binary risk.
Decision recorded in `docs/DECISIONS.md`.

### Watermark / page numbers (`watermark-pdf`, `page-numbers`) — `pdf-lib`

Pure JS/TS PDF manipulation (no subprocess) is appropriate here since the
operation is "draw text/image on existing pages," which qpdf doesn't do and
Ghostscript would be overkill for.

### Protect / Unlock (`protect-pdf`, `unlock-pdf`) — qpdf

```
qpdf --encrypt <user-pw> <owner-pw> 256 -- <in.pdf> <out.pdf>   # protect
qpdf --password=<user-supplied-pw> --decrypt <in.pdf> <out.pdf> # unlock
```

Unlock only ever uses a password the user themselves supplied in the
request — never brute force, never a bypass. If the password is wrong,
qpdf fails and we surface `INVALID_PASSWORD`, nothing else.

### OCR PDF (`ocr-pdf`) — OCRmyPDF + Tesseract

```
ocrmypdf --language <eng|ara|tur|eng+ara+tur> --output-type pdf --skip-text <in.pdf> <out.pdf>
```

Implemented in `workers/ocr` (own package, own `ocr` BullMQ queue,
concurrency 2 — OCR is CPU-heavy and slow per page). `--skip-text` OCRs
only image-only pages, leaving any existing text layer untouched.
`--output-type pdf`, not `pdfa`, is deliberate — this tool doesn't reuse
the separate, already best-effort-framed `pdf-to-pdfa` tool's compliance
language. The user picks a language via a `Select` (English/Arabic/
Turkish/all three combined); all four Tesseract language packs
(`tesseract-ocr-eng`/`-ara`/`-tur`, plus the base `tesseract-ocr`) are
installed in the worker image.

**Verified for real, not assumed**: an English fixture built as a
genuinely image-only PDF (no pre-existing text layer — confirmed via
`pdfjs-dist` extracting empty text *before* writing the E2E test around
it) round-trips through OCR with the exact expected text recognized
afterward. A separate multi-script smoke fixture (Arabic + Turkish text
in one image) run manually through the real container with
`--language eng+ara+tur` correctly recognized both scripts in the same
pass (Arabic and Latin/Turkish text both present in the extracted
output) — confirming the combined language pack genuinely works, not
just that the flag is accepted.

### PDF → Text (`pdf-to-text`) — Poppler (`pdftotext`)

```
pdftotext -layout <in.pdf> <out.txt>
```

### PDF → PDF/A (`pdf-to-pdfa`) — Ghostscript, best-effort

```
gs -dPDFA=2 -dBATCH -dNOPAUSE -dNOOUTERSAVE -dSAFER \
   --permit-file-read=<icc-path> \
   -sColorConversionStrategy=RGB -sProcessColorModel=DeviceRGB \
   -dPDFACompatibilityPolicy=1 -sDEVICE=pdfwrite \
   -sOutputFile=<out.pdf> <PDFA_def.ps> <in.pdf>
```

**Best-effort only — no ISO 19005 compliance claim.** There is no validator
(e.g. veraPDF) in this pipeline; the tool's own copy says "best-effort
PDF/A-2b conversion." `PDFA_def.ps` (`workers/pdf/src/pdfaTemplate.ts`) is
adapted from Ghostscript's own shipped example
(`/usr/share/ghostscript/<version>/lib/PDFA_def.ps`), with the ICC profile
path substituted in — kept as our own repo copy rather than read from the
version-numbered system path, so a future Ghostscript version bump in the
base image can't silently break it. The ICC profile itself
(`/usr/share/color/icc/ghostscript/srgb.icc`) is verified to already exist
in the worker image, owned by `libgs-common` (a transitive dependency of
the already-installed `ghostscript` package) — no new apt package needed.
`--permit-file-read` is required because Ghostscript's `-dSAFER` sandboxing
otherwise refuses to open the ICC profile file.

### Flatten PDF (`flatten-pdf`) — qpdf

```
qpdf --flatten-annotations=all <in.pdf> <out.pdf>
```

Converts interactive form fields, comments, and other annotations into
permanent page content. Verified against a real AcroForm text-field fixture
(`docs/fixtures/sample-with-form-field.pdf`): 1 field before, 0 after.

### Repair PDF (`repair-pdf`) — qpdf, with a Ghostscript fallback and a post-verification gate

```
qpdf <in.pdf> <out.pdf>                          # attempt 1
gs -o <out.pdf> -sDEVICE=pdfwrite <in.pdf>        # fallback if attempt 1 fails
qpdf --check <out.pdf>                            # post-verification (both paths)
qpdf --show-npages <out.pdf>                      # must be > 0
```

Real, empirically-verified behavior this handler accounts for (see
`docs/DECISIONS.md`):

- qpdf's damaged-file recovery only reconstructs a **classic** trailer +
  xref table — it cannot recover a lost `startxref` pointer on a modern
  **cross-reference stream** PDF (confirmed against the real qpdf 11.3.0
  binary: "unable to find trailer dictionary while recovering damaged
  file"). Most PDF writers (including this project's own `pdf-lib` usage
  elsewhere) produce xref-stream PDFs by default.
- qpdf exits **3** ("succeeded with warnings"), not 0, when it genuinely
  repairs a damaged file — the handler must treat exit 3 as success, not
  as a failure signal.
- Ghostscript's repair path **always exits 0**, even when it completely
  fails to reconstruct a usable document (confirmed: a "repaired" 1-page
  empty shell from a 3-page input, still exit 0). The handler must scan
  Ghostscript's combined stdout+stderr text for known "gave up" phrases
  ("Couldn't initialise file", "Catalog dictionary not located",
  "couldn't repair PDF file", "No pages will be processed") rather than
  trust the exit code.
- A final `qpdf --check` + `--show-npages > 0` gate catches anything that
  slips past both of the above — an "unrecoverable" result throws the new
  `UNRECOVERABLE_FILE` error code rather than silently returning a still-
  broken file. This is a deliberate deviation from "just wrap the
  subprocess call" for the sake of not lying to the user about success.

### PDF Metadata (`pdf-metadata`) — qpdf / `pdf-lib`

Read via `qpdf --json` or `pdf-lib`; write updates via `pdf-lib` (avoids a
subprocess round-trip for a simple field edit).

### Word/Excel/PowerPoint → PDF (`word-to-pdf`, `excel-to-pdf`, `powerpoint-to-pdf`) — LibreOffice headless

```
soffice --headless --norestore -env:UserInstallation=file://<per-job-profile> \
   --convert-to pdf --outdir <dir> <in.docx|in.xlsx|in.pptx>
```

One shared handler (`workers/office/src/handlers/officeConvert.ts`) backs
all three directions — only the source/target extension differs.
`-env:UserInstallation=file://<per-job-profile>` (a subdirectory of the
job's own temp dir) is required under concurrency: without a per-job
profile, concurrent `soffice` invocations collide on the same default
profile lock file. LibreOffice conversions are the slowest and most
resource-heavy path in this product — they get their own queue
(`office-conversion`, concurrency 2) so a stuck LibreOffice instance can't
starve fast qpdf jobs.

### PDF → Word (`pdf-to-word`) — LibreOffice headless, with a required infilter override

```
soffice --headless --norestore -env:UserInstallation=file://<per-job-profile> \
   --infilter=writer_pdf_import --convert-to docx --outdir <dir> <in.pdf>
```

**Two non-obvious things verified empirically against the real binary
(LibreOffice 7.4.7.2), not assumed from documentation:**
- Without `--infilter=writer_pdf_import`, `soffice`'s default PDF import
  loads the file into **Draw** (graphics-only), which then has no export
  path to `docx` at all (`Error: no export filter for ...docx found,
  aborting.`). The infilter forces the PDF into **Writer** instead,
  reconstructing reflowable text.
- `--infilter` **must** be passed as one token
  (`--infilter=writer_pdf_import`) — passing it as two separate argv
  elements (`--infilter`, `writer_pdf_import`, the natural way to build an
  argument array) makes `soffice` reject it outright
  (`Error in option: --infilter`) and exit before doing anything. This is
  easy to get wrong when building the argument array programmatically
  rather than typing a shell command — caught by testing the real
  end-to-end job, not just the bare CLI command by hand.

Once both are correct, `soffice` auto-picks the "MS Word 2007 XML" export
filter itself — no explicit filter name needed.

### PDF → Excel (`pdf-to-excel`) — NOT LibreOffice — poppler + exceljs

**Empirically verified that PDF → Excel via LibreOffice does not work at
all**, not just "low fidelity": forcing a `writer_pdf_import`-loaded PDF to
export as `xlsx:Calc MS Excel 2007 XML` crashes the `soffice` process
outright (`Fatal exception: Signal 6`, a SIGABRT inside its OOXML Calc
export filter). Real engine instead:

```
pdftotext -layout <in.pdf> <out.txt>
```

...then reconstruct rows/columns in Node with `exceljs`: one spreadsheet
row per non-empty text line, columns split on runs of 2+ spaces. This is a
real, working, honest **best-effort** table reconstruction — it only
produces good results on PDFs with genuinely simple tabular layout, and
the tool's own copy says so plainly. Not equivalent to a commercial table
extractor (Stirling-PDF's own PDF→Excel path uses a dedicated PDFBox table
extractor rather than routing through LibreOffice either, for the same
underlying reason — see docs/DECISIONS.md).

### PDF → PowerPoint (`pdf-to-powerpoint`) — NOT LibreOffice — poppler + pptxgenjs

**Empirically verified that PDF → PowerPoint via LibreOffice silently
"succeeds"**: a `writer_pdf_import`-loaded PDF exported as
`pptx:Impress MS PowerPoint 2007 XML` returns exit 0 and writes a
technically-valid `.pptx` file — with **zero slides**. Exit code alone
cannot detect this; only inspecting the actual output structure did. Real
engine instead:

```
pdftoppm -png -r 150 <in.pdf> <page-prefix>
```

...then build one slide per rasterized page image via `pptxgenjs`
(`sizing: { type: "contain" }`, one full-bleed image per slide). This
preserves exact visual layout at the cost of the result being pictures,
not editable text — stated plainly in the tool's own copy, not presented
as equivalent to a true content-aware PDF→PowerPoint converter.

### HTML → PDF (`html-to-pdf`) and Markdown → PDF (`markdown-to-pdf`) — Playwright (headless Chromium)

Genuinely new territory in this codebase — every other tool shells out to
a CLI subprocess (`execFile`); this is the first engine driven in-process
via a persistent browser instance. New `workers/html` package, new
`html-rendering` queue, new `"playwright"` `ToolProcessor` value.

**Engine choice, checked against the alternatives** (full comparison in
`docs/DECISIONS.md`): WeasyPrint executes zero JavaScript (silently —
real-world HTML exported from Notion/Confluence would render broken with
no error) and wkhtmltopdf's upstream project was archived in 2023/2024
(abandonware). Playwright's `page.pdf()` (Apache-2.0, driving Google's
permissively-licensed "Chrome for Testing" build — not proprietary retail
Chrome) gives full modern CSS/JS-capable rendering fidelity at the cost of
a large image (~1-4GB) and its own container security posture, the same
shape of trade-off already accepted for LibreOffice.

**One Chromium process per worker, one fresh `BrowserContext` per job**
(`workers/html/src/index.ts` launches once at startup;
`workers/html/src/render.ts`'s `renderHtmlToPdf` creates/closes a context
per job) — cheap per-job isolation without paying Chromium's full startup
cost every job.

**Security, in order of importance** (see docs/DECISIONS.md for the full
SSRF threat-model writeup):
1. `context.route("**/*", ...)` blocks every network request except
   `about:blank`/`data:` — the primary control, catching every
   fetch-triggering HTML/CSS construct uniformly. A referenced external
   resource simply renders as missing rather than the job being rejected.
2. `javaScriptEnabled: false` at context creation — the primary rendering
   control. A PDF is a static snapshot; no legitimate fidelity is lost.
3. `sanitize-html` before `page.setContent()` — defense-in-depth. Uses a
   deliberately full-document-oriented allowlist (`html`/`head`/`body`/
   `style` included) rather than sanitize-html's own fragment-oriented
   defaults, which would otherwise strip a full HTML document down to
   almost nothing.
4. An application-level `Promise.race` timeout forcing `context.close()`
   in a `finally` block — Playwright is a persistent driver, not a
   one-shot subprocess, so it needs its own force-close backstop rather
   than `execFile`'s `SIGKILL`-on-timeout used everywhere else.
5. Non-root container user (Chromium's own sandbox — kept enabled, not
   disabled via `--no-sandbox` — will not fully engage running as root).

**Markdown → PDF reuses the exact same render path**, not a separate
pipeline: `markdown-it` (`html: false` — a literal `<script>` typed into a
`.md` file is escaped to visible text, not live markup) parses Markdown
to an HTML string, wrapped in a fixed server-authored template/stylesheet
(`workers/html/src/handlers/markdownToPdf.ts`), then handed to the same
`renderHtmlToPdf()` function. Raw HTML uploads do not get this template —
that tool's entire point is rendering an already-styled document as-is.

**Upload validation** for both formats reuses `lib/security/
validateUpload.ts`'s `TEXT_FORMATS` path (extension + declared-MIME
allowlist + strict UTF-8 decode + control-byte-ratio check) — neither
format has a magic-byte signature, and this was already built generically
enough to cover them without changes.

**Two real Docker/Playwright deployment issues found and fixed, not
assumed**: see docs/DECISIONS.md for the `PLAYWRIGHT_BROWSERS_PATH`
non-root install-location bug and the `/dev/shm` sizing requirement.

## Shared worker safety rules (blueprint §6)

- Every job: max input file size, max page count (checked via `pdfinfo`
  before running the real operation), and a hard wall-clock timeout — kill
  the child process on timeout (`SIGKILL` after a grace period).
- Every job runs in its own randomly-named temp directory under a worker
  temp root; deleted in a `finally` regardless of success/failure.
- No worker process needs outbound network access to do its job (all
  engines operate on local files) — restrict worker container egress to
  the object storage endpoint and nothing else at the infra layer.
- Concurrency and memory limits are set per-queue in `workers/*/config.ts`
  and enforced at the container level (`--memory`, `--cpus` in Compose /
  orchestrator resource limits in production).

## Input/output constraints (MVP defaults — overridable via `ToolLimit`)

| Limit | Guest | Registered (free) |
|---|---|---|
| Max file size | 20 MB | 50 MB |
| Max files per job (merge) | 10 | 20 |
| Max pages | 300 | 1000 |
| Daily operations | 8 | 30 |

These are seeded defaults in `lib/entitlements`, not hardcoded in UI — see
`docs/DECISIONS.md` and blueprint §11.
