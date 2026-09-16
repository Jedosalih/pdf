import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

async function makePdf(label, pageCount, color) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 300]);
    page.drawRectangle({ x: 0, y: 0, width: 400, height: 300, color });
    page.drawText(`${label} - page ${i + 1}`, {
      x: 40,
      y: 150,
      size: 24,
      font,
      color: rgb(1, 1, 1),
    });
  }
  return doc.save();
}

const a = await makePdf("Fixture-A", 2, rgb(0.1, 0.3, 0.8));
const b = await makePdf("Fixture-B", 3, rgb(0.8, 0.2, 0.2));
const c = await makePdf("Fixture-C", 6, rgb(0.1, 0.6, 0.3));

await writeFile("docs/fixtures/sample-a-2page.pdf", a);
await writeFile("docs/fixtures/sample-b-3page.pdf", b);
await writeFile("docs/fixtures/sample-c-6page.pdf", c);

// Real raster images (not just PDF-wrapped vectors) for the image<->PDF
// tools — a magic-byte/embedJpg/embedPng check needs an actually valid
// file, not just a renamed extension.
const jpg = await sharp({
  create: { width: 300, height: 200, channels: 3, background: { r: 40, g: 80, b: 200 } },
})
  .jpeg()
  .toBuffer();
await writeFile("docs/fixtures/sample-photo.jpg", jpg);

const png = await sharp({
  create: { width: 300, height: 200, channels: 4, background: { r: 200, g: 60, b: 40, alpha: 1 } },
})
  .png()
  .toBuffer();
await writeFile("docs/fixtures/sample-graphic.png", png);

// Flatten PDF fixture: a real interactive form field (AcroForm text field),
// not just a page of text — qpdf's --flatten-annotations only has
// something real to do if there's an actual annotation to bake in.
const flattenDoc = await PDFDocument.create();
const flattenFont = await flattenDoc.embedFont(StandardFonts.Helvetica);
const flattenPage = flattenDoc.addPage([400, 300]);
flattenPage.drawText("Flatten fixture", { x: 40, y: 220, size: 20, font: flattenFont, color: rgb(0, 0, 0) });
const flattenForm = flattenDoc.getForm();
const flattenField = flattenForm.createTextField("note");
flattenField.setText("annotation content");
flattenField.addToPage(flattenPage, { x: 40, y: 140, width: 200, height: 30 });
const flattenBytes = await flattenDoc.save();
await writeFile("docs/fixtures/sample-with-form-field.pdf", flattenBytes);

// Repair PDF fixtures: pdf-lib's default `save()` writes a modern
// cross-reference *stream* (no classic "trailer" keyword at all), which
// qpdf's damaged-file recovery heuristic cannot reconstruct if the
// startxref pointer is lost — verified empirically against the real qpdf
// binary before choosing this approach (see docs/DECISIONS.md). Saving
// with `useObjectStreams: false` produces a classic xref-table + trailer
// PDF instead, which is what qpdf's recovery is actually built to handle.
const repairDoc = await PDFDocument.create();
const repairFont = await repairDoc.embedFont(StandardFonts.Helvetica);
for (let i = 0; i < 3; i++) {
  const page = repairDoc.addPage([400, 300]);
  page.drawText(`Repair-Fixture - page ${i + 1}`, { x: 40, y: 150, size: 24, font: repairFont, color: rgb(0, 0, 0) });
}
const repairBytes = Buffer.from(await repairDoc.save({ useObjectStreams: false }));
const repairText = repairBytes.toString("latin1");

// Mild corruption: mangle the startxref offset so it points nowhere. qpdf
// can reconstruct the xref table from the intact "trailer" keyword and
// object markers still present in the rest of the file (verified: this
// recovers successfully, exiting 3 "succeeded with warnings").
const startxrefIdx = repairText.lastIndexOf("startxref");
const mildCorruptText = repairText.slice(0, startxrefIdx)
  + repairText.slice(startxrefIdx).replace(/startxref\s*\r?\n\d+/, "startxref\n999999");
await writeFile("docs/fixtures/sample-mild-corrupt.pdf", Buffer.from(mildCorruptText, "latin1"));

// Severe corruption: truncate to 40% of the file, destroying the xref
// table, trailer, and much of the page content — verified: neither qpdf
// nor Ghostscript can produce a genuinely usable document from this, which
// is exactly the UNRECOVERABLE_FILE case repair-pdf must detect rather
// than silently returning a broken "success".
const severeCut = Math.floor(repairBytes.length * 0.4);
await writeFile("docs/fixtures/sample-severe-corrupt.pdf", repairBytes.subarray(0, severeCut));

console.log(
  "done",
  a.byteLength,
  b.byteLength,
  c.byteLength,
  jpg.byteLength,
  png.byteLength,
  flattenBytes.byteLength,
  repairBytes.byteLength,
);
