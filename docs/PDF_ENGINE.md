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
