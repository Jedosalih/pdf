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
| **Sharp** | Apache-2.0 | Burning opaque redaction boxes into a rasterized page's actual pixels (`redact-pdf`) |
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

### Edit PDF (`edit-pdf`) — `pdf-lib`, client-side canvas + server-side apply

**What this is, stated plainly (blueprint §19/§20's "do not falsely
advertise" requirement)**: an *annotation/overlay* editor. A user adds new
text boxes, images, highlight/rectangle shapes, and freehand drawing on top
of a page in an interactive browser canvas (`components/tools/edit-pdf/`,
built on the same `pdfjs-dist` rendering path as `usePdfPageThumbnails`).
None of this reads, reflows, or rewrites the PDF's *existing* text or
vector content — PDF has no native "paragraph" model to safely rewrite,
and no library in this stack (or realistically available at all) does
that correctly for arbitrary real-world PDFs. Every element the user
places is new content-stream drawing, added via `pdf-lib`, the same
engine `watermark-pdf`/`page-numbers` already use for the same reason
("draw on existing pages," not "parse and rewrite").

**Architecture**: the editor keeps its edit list (`EditElement[]`, one
entry per placed text/image/rect/highlight/path) entirely in client state
until the user clicks Export. At that point the *original* PDF (already
uploaded through the normal `/api/upload` path at file-selection time) and
the edit list (sent as arbitrary job `options.edits` JSON — no new API
surface needed, see `docs/SECURITY.md` §1 for how that JSON is validated)
are handed to the existing job/queue pipeline exactly like every other
tool. `workers/pdf/src/handlers/editPdf.ts` re-validates every field
independently (bounds-checked numbers, length-capped strings, a strict
`data:image/(png|jpeg);base64,...` regex for images, a 300-element cap)
since the client payload is untrusted input, not just UI state.

**Coordinate system**: elements are stored in PDF-point units with a
top-left origin (matching the on-screen canvas), converted to `pdf-lib`'s
bottom-left-origin space only at export. Freehand paths are drawn via
`page.drawSvgPath`, which internally flips the path's own y-axis and
*then* translates by the given `(x, y)` anchor (verified directly against
`pdf-lib`'s compiled source, not assumed from the JSDoc example alone) —
points must stay in their natural top-down form and only the anchor needs
the page-height flip, not the individual points a second time.

**A real focus-stealing bug found and fixed**: a newly-placed text box's
`<textarea autoFocus>` was immediately blurring itself and deleting the
just-added (still-empty) element on the very next render. Root cause: the
canvas overlay `<div>` isn't itself a focus target, and a browser's
default `mousedown` handling ("blur current focus since the mousedown
target isn't focusable") can run *after* React's `autoFocus` already
focused the new textarea, stealing it back. Fixed with `event.
preventDefault()` in the overlay's `pointerdown` handler, which suppresses
that default focus-management step for the gesture (per the Pointer
Events spec, canceling `pointerdown` suppresses its compatibility mouse
events' default actions too).

**Scope, stated in the tool's own UI copy, not just internal docs**: no
in-place text editing, no page manipulation (reuses the existing dedicated
tools), no signatures/redaction (separate, later blueprint capabilities
with their own honesty requirements).

### Fill & Sign (`fill-sign-pdf`) — `pdf-lib` form API + the edit-pdf canvas

Splits into two genuinely different mechanisms, both real:

1. **Filling real AcroForm fields.** `components/tools/fill-sign-pdf/
   useFormFields.ts` detects text fields client-side via `pdfjs-dist`'s
   `page.getAnnotations()` (`subtype: "Widget"`, `fieldType: "Tx"`) --
   verified empirically against `docs/fixtures/sample-with-form-field.pdf`
   before writing any code around an assumed shape (its `rect` is
   `[x1, y1, x2, y2]` in PDF bottom-left-origin space; converted to the
   editor's top-left-origin model the same way as everywhere else:
   `topY = pageHeight - y2`). Rendered as real `<input>` elements
   positioned over their actual field location so the user types directly
   into the document. On export, `workers/pdf/src/handlers/
   fillSignPdf.ts` fills each field through `pdf-lib`'s `PDFForm` API
   (`getFieldMaybe(name)`, `instanceof PDFTextField`, `setText(...)`) and
   calls `form.flatten()` to bake the values into static page content --
   the same "flatten" concept `flatten-pdf` already uses. Checkboxes/
   radio groups/dropdowns (`fieldType: "Btn"`/`"Ch"`) are deliberately out
   of scope for this pass; text fields cover the common case. Only applies
   when the PDF actually has an AcroForm -- most PDFs don't, and that's
   not an error, just nothing to fill.
2. **Placing a signature.** Reuses `edit-pdf`'s canvas/overlay machinery
   verbatim (`EditorCanvas`, `useEditorState`, `usePdfDocument`,
   `EditorPageSidebar`, `EditorPropertiesPanel`) with a trimmed toolset
   (select/text/draw/image -- no highlight/rect, not relevant to signing).
   A hand-drawn signature is just the existing freehand "path" element
   type; an uploaded signature is just the existing "image" element type.
   Zero new drawing code was needed for this half.

**Shared element-drawing logic was extracted, not duplicated**:
`workers/pdf/src/pdfEditElements.ts`'s `applyEditElements()` is the exact
same per-type validation/drawing switch `edit-pdf` uses, now called by
both `editPdf.ts` and `fillSignPdf.ts` -- the "duplicate the worker
boilerplate" convention (`db.ts`/`storage.ts`/etc. per package) doesn't
apply here since these two handlers live in the *same* package and share
the *same* element model, unlike the cross-package worker duplication.

**This produces a visual signature, not a cryptographic one, stated
plainly in the tool's own copy**: new ink/image content on the page, the
same as signing a printed page and scanning it. No library in this stack
signs PDFs cryptographically (PAdES/PKCS#7) -- `pdf-lib` has no signing
support at all, and doing this correctly needs a real PKI/certificate
story (a CA-issued or self-signed cert, a timestamp authority, an
incremental-update-aware signing library such as `node-signpdf`), which is
a deliberate, documented scope boundary, not an oversight. See
`docs/DECISIONS.md` for the full reasoning.

**A real UI bug found by actually filling in a field**: the field
`<input>`'s background was a translucent tint (`bg-primary/5`), so the
canvas's own rendering of the PDF's pre-existing field value showed
through underneath the input's current text, producing an illegible
double-exposure look. Fixed with an opaque background (`bg-background`)
that fully masks the canvas layer underneath.

### Redact PDF (`redact-pdf`) — `pdftoppm` + `sharp`, whole-page rasterization

**The one capability where "draw a black box" would be an outright false
claim, and the implementation is built to make that structurally
impossible, not just visually convincing.** A rectangle drawn on top of
live text (the same technique `edit-pdf`'s highlight/rect tools use) still
leaves the original text object in the content stream underneath --
select-all, `pdftotext`, or deleting the rectangle shape all recover it.
Real removal needs the underlying content gone, not covered.

**Mechanism**: every page that has at least one requested redaction box is
rasterized *whole* via `pdftoppm -png -r 150` (the same tool/DPI
`pdf-to-jpg`/`pdf-to-png` already use), the black boxes are burned
directly into that raster's pixels via `sharp`'s SVG compositing
(`sharp(png).composite([{ input: svgRectMarkup }])`), and the page's
*entire original content* -- text, vectors, every object, not just the
boxed region -- is discarded and replaced by the flattened image
(`pdfDoc.insertPage(i, [w, h])` + `drawImage` + `pdfDoc.removePage(i+1)`).
There is no separate "black rectangle object" sitting on top of anything
recoverable -- the pixels the box covers, and the pixels it doesn't, are
now the *only* content that page has. Pages with no requested box are
never rasterized at all, keeping their original text/vector fidelity.

**A real design trap avoided before it shipped**: the first instinct is
"rasterize the page, then draw a `pdf-lib` rectangle on top of the
embedded image" -- but that's two separate layers in the new page's
content stream, and removing the top rectangle object reveals the
rasterized (but not-yet-redacted) pixels underneath, which still show the
original content. The box must be burned into the raster *before* it's
ever embedded into the PDF, which is why this uses `sharp` for pixel
compositing rather than a second `pdf-lib` drawing call.

**The honest trade-off, stated in the tool's own copy**: a redacted page
becomes a static image -- its text is no longer selectable, searchable, or
copyable in the output. This is the accepted cost of a genuine guarantee,
not a side effect glossed over.

**Fails loudly, not silently, on partial failure** -- a deliberate
deviation from this codebase's usual "skip one bad element, keep going"
pattern (e.g. `editPdf.ts`'s `applyEditElements`). If a page the user
asked to redact can't actually be rasterized or composited for any reason,
the whole job fails (`PROCESSING_FAILED`) rather than shipping a file the
user could mistake for fully redacted. Verified directly: the E2E test
checks page 1 (redacted) has *zero* extractable text anywhere on the page
and an embedded raster image, while untouched pages 2-3 keep their exact
original text and are confirmed *not* rasterized (`OPS.paintImageXObject`
absent) -- proving both the removal guarantee and that non-redacted pages
keep full fidelity.

### PDF → HTML (`pdf-to-html`) — Poppler (`pdftohtml`)

```
pdftohtml -noframes -q <in.pdf> <out-base>
```

Writes `<out-base>.html` plus a sibling image file per embedded raster
(`<out-base>-N_M.png`/`.jpg`), referenced by a relative `src="..."`. Every
sibling image is read back and inlined into the HTML as a base64 data URI
before upload, so the job's single output file is genuinely self-
contained (verified: zero non-`data:` `src` attributes survive). Uses
poppler's simple/reading-order mode, not `-c` (complex, absolutely-
positioned layout) — the simple mode produces materially more readable,
editable HTML for the common case; this is a deliberate fidelity trade-
off, stated in the tool's own FAQ ("not pixel-for-pixel"), not an
oversight.

### PDF → Markdown (`pdf-to-md`) — `pdfjs-dist`, heuristic structure detection

No subprocess — pure in-process JS using `pdfjs-dist` (added as a new
`workers/pdf` dependency; previously only the main app depended on it).
Per page: `page.getTextContent()` items are grouped into lines by
Y-position clustering (plus pdf.js's own per-item `hasEOL` flag as a
secondary signal), then each line is classified as:

- **Heading** — font size ranked against the document's own modal/body
  font size, mapped to H1–H3 (capped at 3 levels).
- **List item** — bullet/numbered prefix pattern matching, normalized to
  `- ` or `N. `.
- **Table row** — ≥3 consecutive lines whose text items share the same
  horizontal-gap-derived cell count render as a real Markdown table;
  anything short of that confidence threshold is left as plain lines,
  never fabricated into a one-row table.
- **Paragraph** — consecutive lines joined when the vertical gap to the
  next line matches the page's own modal line-spacing; a larger gap
  starts a new paragraph.

A page with zero extractable text gets an inline note pointing at the OCR
PDF tool rather than silently producing nothing; a PDF with *no*
extractable text on *any* page fails the whole job with a dedicated
`NO_EXTRACTABLE_TEXT` error rather than shipping an empty file. Does not
attempt bold/italic detection (`TextItem.fontName` is an internal PDF
resource alias, not a reliable weight signal without deeper font-
descriptor inspection) or merged/spanning table cells — stated as scope
limits in the tool's own FAQ.

**Real bug found only by dumping pdf.js's raw `getTextContent()` output**
for a table-shaped test fixture: pdf.js synthesizes a pure-whitespace
*item* spanning exactly the gap between two real text runs (e.g. between
two table cells) rather than leaving a gap with no item at all. Treating
this item as pure noise and advancing the "last seen X position" tracker
to its own end point silently erased the very gap the table heuristic
measures, collapsing whole rows together with no spacing
(`"NameScore"` instead of two cells). Fixed by leaving that tracker
untouched across a skipped whitespace item.

## Shared worker safety rules (blueprint §6)

- Every job: max input file size (checked at upload), max total page count
  across all PDF inputs (checked once at job creation in
  `app/api/jobs/route.ts` via `pdfjs-dist`, not inside each worker or via
  `pdfinfo` — see `docs/SECURITY.md` §1), and for engine-subprocess-backed
  handlers, a per-call wall-clock timeout — kill the child process on
  timeout (`SIGKILL` after a grace period). Pure-`pdf-lib`/`pdfjs-dist`
  handlers with no subprocess have no timeout of their own yet — a known
  gap, see `docs/SECURITY.md` §3.
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
