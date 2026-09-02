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

console.log("done", a.byteLength, b.byteLength, c.byteLength, jpg.byteLength, png.byteLength);
