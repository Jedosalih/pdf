import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { writeFile } from "node:fs/promises";

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

await writeFile("docs/fixtures/sample-a-2page.pdf", a);
await writeFile("docs/fixtures/sample-b-3page.pdf", b);

console.log("done", a.byteLength, b.byteLength);
