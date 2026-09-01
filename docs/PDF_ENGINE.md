# PDF Engine — tool-to-engine mapping

## Engine choices and why

| Engine | License | Used for |
|---|---|---|
| **qpdf** | Apache-2.0 | Merge, split, rotate, page delete/extract/reorder, password protect/decrypt (with user-supplied password), linearization |
| **Ghostscript** | AGPL-3.0 (also available under Artifex commercial license) | Compression/optimization presets, some rasterization |
| **Poppler** (`pdftoppm`, `pdftotext`, `pdfinfo`) | GPL-2.0 | PDF → image, PDF → text, page count/inspection |
| **OCRmyPDF** (wraps Ghostscript + Tesseract + qpdf) | MPL-2.0 | OCR / searchable PDF layer |
| **Tesseract** | Apache-2.0 | OCR text recognition (used via OCRmyPDF) |
| **LibreOffice** (headless) | MPL-2.0 | DOC/DOCX/XLS/XLSX/PPT/PPTX → PDF |
| **Sharp** | Apache-2.0 | Image resizing/format conversion for JPG/PNG ↔ PDF page rasters |

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

`/screen` (basic/strong), `/ebook` (balanced), `/printer` (light/high
quality) map to the "Basic / Balanced / Strong" levels in the blueprint.
Report actual before/after size — never a fabricated estimate.

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

### OCR PDF (`ocr-pdf`) — OCRmyPDF

```
ocrmypdf --language <eng+ara+tur subset> --output-type pdfa <in.pdf> <out.pdf>
```

Language pack selection depends on a rough language hint (default to the
UI locale, allow override) — installing all three Tesseract language packs
(`eng`, `ara`, `tur`) in the worker image.

### PDF → Text (`pdf-to-text`) — Poppler (`pdftotext`)

```
pdftotext -layout <in.pdf> <out.txt>
```

### PDF Metadata (`pdf-metadata`) — qpdf / `pdf-lib`

Read via `qpdf --json` or `pdf-lib`; write updates via `pdf-lib` (avoids a
subprocess round-trip for a simple field edit).

### Office → PDF (`doc-to-pdf`, `xls-to-pdf`, `ppt-to-pdf`) — LibreOffice headless

```
soffice --headless --convert-to pdf --outdir <dir> <in.docx>
```

LibreOffice conversions are the slowest and most resource-heavy path in the
MVP — they get their own queue (`office-conversion`) with a longer timeout
and lower concurrency than the `pdf-processing` queue, so a stuck LibreOffice
instance can't starve fast qpdf jobs.

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
