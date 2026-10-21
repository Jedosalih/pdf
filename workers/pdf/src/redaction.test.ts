/**
 * Security regression test for redact-pdf (src/redaction.ts). A plain
 * script, not a Playwright test, because it has to inspect the serialized
 * output at a level the UI never exposes: run it inside the real pdf-worker
 * image, where qpdf/poppler are the same binaries production uses:
 *
 *   docker compose run --rm --no-deps pdf-worker node dist/redaction.test.js
 *
 * Every fixture is built in memory with unique MARKER-* strings (no real
 * data). "Absent" is checked against the fully decoded file
 * (`qpdf --qdf --decode-level=all --object-streams=disable`, so every
 * compressed stream and object stream is expanded) in every encoding a
 * PDF writer could use for the string: raw, hex (both cases), UTF-16BE.
 * A plain text-extraction check is NOT enough -- the original bug passed
 * one while the redacted text was still sitting in an unreferenced object.
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFRef,
} from "pdf-lib";
import sharp from "sharp";
import { runCommand, runCommandCaptureAll } from "./exec.js";
import { JobFailure } from "./errors.js";
import { encryptWithPassword } from "./qpdfJob.js";
import { REDACTION_DPI, parseRedactionBoxes, redactPdfFile, type RedactionBox } from "./redaction.js";
import { withTempDir } from "./tempDir.js";

const SECRETS = [
  "MARKER-INFO-TITLE",
  "MARKER-INFO-AUTHOR",
  "MARKER-XMP-SECRET",
  "MARKER-P1-SECRET",
  "MARKER-FIELD-VALUE",
  "MARKER-ANNOT-COMMENT",
  "MARKER-HIDDEN-ANNOT",
  "MARKER-ATTACHMENT-BYTES",
  "MARKER-BOOKMARK",
  "MARKER-JAVASCRIPT",
  "MARKER-SHARED-XOBJ",
  "MARKER-ROT-SECRET",
  "MARKER-CROP-SECRET",
];
const KEPT = "MARKER-P2-KEEP";

let failures = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : String(error)}`);
  }
}

function encodings(marker: string): string[] {
  const ascii = Buffer.from(marker, "latin1");
  const utf16 = Buffer.concat([...marker].map((c) => Buffer.from([0, c.charCodeAt(0)])));
  return [
    marker,
    ascii.toString("hex").toUpperCase(),
    ascii.toString("hex"),
    utf16.toString("latin1"),
    utf16.toString("hex").toUpperCase(),
    utf16.toString("hex"),
  ];
}

async function decodedText(pdf: Buffer, dir: string, label: string): Promise<string> {
  const inPath = join(dir, `${label}-in.pdf`);
  const outPath = join(dir, `${label}-qdf.pdf`);
  await writeFile(inPath, pdf);
  const result = await runCommandCaptureAll("qpdf", ["--qdf", "--decode-level=all", "--object-streams=disable", inPath, outPath]);
  assert.ok(result.exitCode === 0 || result.exitCode === 3, `qpdf could not decode ${label} (exit ${result.exitCode})`);
  // Raw bytes too, in case anything failed to decode.
  return (await readFile(outPath)).toString("latin1") + pdf.toString("latin1");
}

function containsMarker(haystack: string, marker: string): boolean {
  return encodings(marker).some((form) => haystack.includes(form));
}

/** Page 1 (redacted): secret text, form field, comment. Page 2 (kept):
 * kept text + a hidden annotation. Page 3 (kept): its resource dict lists
 * a Form XObject holding MARKER-SHARED-XOBJ that only page 1 draws.
 * Page 4: /Rotate 90 with a red square at the media origin. Page 5:
 * CropBox offset into the MediaBox. Plus Info, XMP, an attachment, a
 * bookmark and document-level JavaScript. */
async function buildMarkerFixture(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle("MARKER-INFO-TITLE");
  doc.setAuthor("MARKER-INFO-AUTHOR");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const context = doc.context;

  const donor = await PDFDocument.create();
  const donorFont = await donor.embedFont(StandardFonts.Helvetica);
  donor.addPage([300, 60]).drawText("MARKER-SHARED-XOBJ", { x: 10, y: 20, size: 18, font: donorFont });
  const [sharedForm] = await doc.embedPdf(await donor.save());

  const page1 = doc.addPage([600, 800]);
  page1.drawText("MARKER-P1-SECRET", { x: 50, y: 700, size: 20, font });
  page1.drawPage(sharedForm!, { x: 50, y: 500 });
  const field = doc.getForm().createTextField("secret");
  field.setText("MARKER-FIELD-VALUE");
  field.addToPage(page1, { x: 50, y: 600, width: 250, height: 24 });
  const comment = context.register(
    context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [400, 700, 420, 720],
      Contents: PDFString.of("MARKER-ANNOT-COMMENT"),
    }),
  );
  page1.node.addAnnot(comment);

  const page2 = doc.addPage([600, 800]);
  page2.drawText(KEPT, { x: 50, y: 700, size: 20, font });
  const hidden = context.register(
    context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [400, 700, 420, 720],
      F: 2,
      Contents: PDFString.of("MARKER-HIDDEN-ANNOT"),
    }),
  );
  page2.node.addAnnot(hidden);

  const page3 = doc.addPage([600, 800]);
  page3.drawText("Page three", { x: 50, y: 700, size: 20, font });
  const page1XObjects = page1.node.Resources()!.lookup(PDFName.of("XObject"));
  page3.node.Resources()!.set(PDFName.of("XObject"), page1XObjects!);

  const page4 = doc.addPage([600, 400]);
  page4.setRotation(degrees(90));
  page4.drawRectangle({ x: 0, y: 0, width: 100, height: 100, color: rgb(1, 0, 0) });
  page4.drawText("MARKER-ROT-SECRET", { x: 200, y: 200, size: 20, font });

  const page5 = doc.addPage([600, 800]);
  page5.setCropBox(100, 100, 400, 500);
  page5.drawText("MARKER-CROP-SECRET", { x: 150, y: 450, size: 20, font });
  page5.drawRectangle({ x: 100, y: 100, width: 400, height: 500, borderColor: rgb(0, 0, 1), borderWidth: 4 });

  await doc.attach(Buffer.from("MARKER-ATTACHMENT-BYTES"), "secret.txt", { mimeType: "text/plain" });

  const xmp = context.flateStream(
    `<?xpacket begin=""?><x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:title>MARKER-XMP-SECRET</dc:title></x:xmpmeta><?xpacket end="w"?>`,
    { Type: "Metadata", Subtype: "XML" },
  );
  doc.catalog.set(PDFName.of("Metadata"), context.register(xmp));

  const outlinesRef = context.nextRef();
  const itemRef: PDFRef = context.register(
    context.obj({
      Title: PDFHexString.fromText("MARKER-BOOKMARK"),
      Parent: outlinesRef,
      Dest: [page1.ref, "Fit"],
    }),
  );
  context.assign(outlinesRef, context.obj({ Type: "Outlines", First: itemRef, Last: itemRef, Count: 1 }));
  doc.catalog.set(PDFName.of("Outlines"), outlinesRef);

  doc.catalog.set(
    PDFName.of("OpenAction"),
    context.register(context.obj({ S: "JavaScript", JS: PDFString.of("app.alert('MARKER-JAVASCRIPT')") })),
  );

  return Buffer.from(await doc.save());
}

const MARKER_BOXES: RedactionBox[] = [
  { page: 0, x: 0, y: 0, width: 600, height: 800 },
  // Page 4 is shown rotated: 400 wide x 600 tall; the red square drawn at
  // the media origin appears at the visible top-left.
  { page: 3, x: 0, y: 0, width: 100, height: 100 },
  { page: 3, x: 100, y: 0, width: 300, height: 600 },
  // Page 5's visible area is its 400x500 CropBox; the secret baseline sits
  // at media (150, 450) = crop-relative top-left (50, 150).
  { page: 4, x: 40, y: 125, width: 300, height: 35 },
];

async function pixel(pdf: Buffer, pageNumber: number, x: number, y: number, dir: string, label: string) {
  const pdfPath = join(dir, `${label}.pdf`);
  await writeFile(pdfPath, pdf);
  const prefix = join(dir, `${label}-p${pageNumber}`);
  await runCommand("pdftoppm", ["-png", "-r", String(REDACTION_DPI), "-cropbox", "-f", String(pageNumber), "-l", String(pageNumber), "-singlefile", pdfPath, prefix]);
  const { data, info } = await sharp(`${prefix}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const scale = REDACTION_DPI / 72;
  const px = Math.min(info.width - 1, Math.round(x * scale));
  const py = Math.min(info.height - 1, Math.round(y * scale));
  const offset = (py * info.width + px) * info.channels;
  return { r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]!, width: info.width, height: info.height };
}

async function expectFailure(code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof JobFailure, `expected JobFailure(${code}), got ${String(error)}`);
    assert.equal(error.code, code);
    return;
  }
  assert.fail(`expected JobFailure(${code}), but redaction succeeded`);
}

async function main() {
  await withTempDir(async (dir) => {
    const source = await buildMarkerFixture();
    const sourcePath = join(dir, "source.pdf");
    await writeFile(sourcePath, source);
    const sourceText = await decodedText(source, dir, "source");

    await check("fixture really contains every marker (test is meaningful)", async () => {
      for (const marker of [...SECRETS, KEPT]) {
        assert.ok(containsMarker(sourceText, marker), `fixture is missing ${marker}`);
      }
    });

    const output = await redactPdfFile(sourcePath, MARKER_BOXES, dir);
    const outputText = await decodedText(output, dir, "output");

    await check("no sensitive marker survives anywhere in the decoded output", async () => {
      const leaked = SECRETS.filter((marker) => containsMarker(outputText, marker));
      assert.deepEqual(leaked, []);
    });

    await check("untouched page content is preserved", async () => {
      assert.ok(containsMarker(outputText, KEPT), "page 2 text is gone");
      const outPath = join(dir, "out-text.pdf");
      await writeFile(outPath, output);
      await runCommand("pdftotext", ["-f", "2", "-l", "2", outPath, join(dir, "p2.txt")]);
      assert.match(await readFile(join(dir, "p2.txt"), "utf-8"), /MARKER-P2-KEEP/);
    });

    await check("document-level structures are not carried over", async () => {
      for (const key of ["/AcroForm", "/Outlines", "/Names", "/OpenAction", "/EmbeddedFile", "/Metadata", "/JavaScript", "/Widget", "/Subtype /Text"]) {
        assert.ok(!outputText.includes(key), `output still contains ${key}`);
      }
      const out = await PDFDocument.load(output, { updateMetadata: false });
      assert.equal(out.getTitle(), undefined);
      assert.equal(out.getAuthor(), undefined);
      for (const [index, page] of out.getPages().entries()) {
        const annots = page.node.Annots();
        assert.ok(!annots || annots.size() === 0, `page ${index + 1} still has annotations`);
      }
    });

    await check("page count and order are preserved", async () => {
      const out = await PDFDocument.load(output, { updateMetadata: false });
      assert.equal(out.getPageCount(), 5);
    });

    await check("rotated page keeps its visible geometry and the box lands where drawn", async () => {
      const before = await pixel(source, 4, 50, 50, dir, "src-rot");
      assert.ok(before.r > 200 && before.g < 80, "fixture assumption: red square at visible top-left");
      const after = await pixel(output, 4, 50, 50, dir, "out-rot");
      assert.ok(after.r < 40 && after.g < 40 && after.b < 40, "box area is not black");
      const out = await PDFDocument.load(output, { updateMetadata: false });
      const size = out.getPage(3).getSize();
      assert.ok(Math.abs(size.width - 400) < 1 && Math.abs(size.height - 600) < 1, `rotated page is ${size.width}x${size.height}`);
      assert.equal(out.getPage(3).getRotation().angle, 0);
    });

    await check("cropped page keeps its visible geometry and the box lands where drawn", async () => {
      const out = await PDFDocument.load(output, { updateMetadata: false });
      const size = out.getPage(4).getSize();
      assert.ok(Math.abs(size.width - 400) < 1 && Math.abs(size.height - 500) < 1, `cropped page is ${size.width}x${size.height}`);
      const boxCenter = await pixel(output, 5, 190, 142, dir, "out-crop-box");
      assert.ok(boxCenter.r < 40 && boxCenter.g < 40 && boxCenter.b < 40, "box area is not black");
      const outside = await pixel(output, 5, 200, 300, dir, "out-crop-outside");
      assert.ok(outside.r > 200 && outside.g > 200 && outside.b > 200, "area outside the box was altered");
    });

    await check("output is a structurally valid PDF", async () => {
      const outPath = join(dir, "check.pdf");
      await writeFile(outPath, output);
      const result = await runCommandCaptureAll("qpdf", ["--check", outPath]);
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
    });

    await check("password-protected input is refused", async () => {
      const encPath = join(dir, "enc.pdf");
      await encryptWithPassword(sourcePath, encPath, "user-pw", dir);
      await expectFailure("ENCRYPTED_PDF", () => redactPdfFile(encPath, MARKER_BOXES, dir));
    });

    await check("owner-password-only (opens without a password) input is refused", async () => {
      const encPath = join(dir, "enc-owner.pdf");
      await runCommand("qpdf", ["--encrypt", "", "owner-pw", "256", "--", sourcePath, encPath]);
      await expectFailure("ENCRYPTED_PDF", () => redactPdfFile(encPath, MARKER_BOXES, dir));
    });

    await check("unparseable input is refused", async () => {
      const badPath = join(dir, "bad.pdf");
      await writeFile(badPath, Buffer.from("%PDF-1.7\n" + "garbage ".repeat(500)));
      await expectFailure("UNSUPPORTED_FILE", () => redactPdfFile(badPath, MARKER_BOXES, dir));
    });

    await check("boxes outside the page range are refused, not silently ignored", async () => {
      await expectFailure("VALIDATION_ERROR", () => redactPdfFile(sourcePath, [{ page: 9, x: 0, y: 0, width: 10, height: 10 }], dir));
    });

    await check("a box entirely outside the visible area is refused", async () => {
      await expectFailure("VALIDATION_ERROR", () => redactPdfFile(sourcePath, [{ page: 0, x: 5000, y: 5000, width: 10, height: 10 }], dir));
    });

    await check("malformed box options are dropped by the parser", async () => {
      const parsed = parseRedactionBoxes([
        { page: 0, x: 1, y: 1, width: 5, height: 5 },
        { page: 0.5, x: 1, y: 1, width: 5, height: 5 },
        { page: 0, x: "1", y: 1, width: 5, height: 5 },
        { page: 0, x: 1, y: 1, width: -5, height: 5 },
        null,
      ]);
      assert.equal(parsed.length, 1);
    });
  });

  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall redaction checks passed");
}

void main();
