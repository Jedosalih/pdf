import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, type PDFPage } from "pdf-lib";
import { ComputeFailure } from "./computeFailure.js";

interface RedactAssembleOptions {
  /** 0-based page index of each redacted raster, aligned with
   * `inputs[1..]` (inputs[0] is the flattened source PDF). */
  redactedPages: number[];
  dpi: number;
}

/**
 * Page-level keys removed from every *untouched* page that is carried
 * over. None of them affect how the page's own content renders; each can
 * carry data the user never sees on screen (comments, hidden
 * annotations, per-page XMP, private application data, actions,
 * thumbnails).
 */
const STRIPPED_PAGE_KEYS = ["Annots", "AA", "Metadata", "PieceInfo", "Thumb", "B", "StructParents", "Tabs"];

/**
 * The page's size as displayed: its CropBox clipped to the MediaBox (what
 * pdftoppm `-cropbox` rasterizes), turned sideways for /Rotate 90/270.
 * The redacted page is sized from this rather than from the raster's
 * pixel count, which rounds (800pt at 150dpi came back as 800.16pt).
 */
function visibleSize(page: PDFPage): { width: number; height: number } {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const x0 = Math.max(media.x, crop.x);
  const y0 = Math.max(media.y, crop.y);
  const x1 = Math.min(media.x + media.width, crop.x + crop.width);
  const y1 = Math.min(media.y + media.height, crop.y + crop.height);
  let width = x1 - x0;
  let height = y1 - y0;
  if (width <= 0 || height <= 0) {
    width = media.width;
    height = media.height;
  }
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  return angle === 90 || angle === 270 ? { width: height, height: width } : { width, height };
}

/**
 * Builds the redacted output as a brand-new document instead of editing
 * the source in place. That is the core of the guarantee: removing a page
 * from a pdf-lib document only unlinks it from the page tree -- `save()`
 * still serializes every object in the context, so the original content
 * stream survived as an unreferenced object (confirmed, see
 * docs/DECISIONS.md). Here nothing from a redacted page is ever copied:
 * that page is replaced by a fresh page containing only its burned-in
 * raster, sized from the raster itself so rotated and cropped pages keep
 * the geometry the user saw. Untouched pages are copied with `copyPages`,
 * and the new document gets no Info dictionary, XMP, AcroForm, outline,
 * names tree (attachments, named destinations, JavaScript), OpenAction,
 * structure tree or page labels -- none of the source catalog is carried
 * over. The caller rewrites the result with qpdf afterwards so objects
 * that `copyPages` pulled in but nothing references are not written.
 */
export async function compute(
  inputs: { path: string; mimeType: string }[],
  rawOptions: unknown,
): Promise<Buffer> {
  const options = rawOptions as RedactAssembleOptions;
  const [sourceInput, ...rasterInputs] = inputs;
  if (!sourceInput || rasterInputs.length !== options.redactedPages.length) {
    throw new ComputeFailure("PROCESSING_FAILED");
  }

  let source: PDFDocument;
  try {
    source = await PDFDocument.load(await readFile(sourceInput.path), { updateMetadata: false });
  } catch {
    throw new ComputeFailure("UNSUPPORTED_FILE");
  }

  const pageCount = source.getPageCount();
  const rasterByPage = new Map<number, string>();
  options.redactedPages.forEach((pageIndex, i) => rasterByPage.set(pageIndex, rasterInputs[i]!.path));

  const output = await PDFDocument.create({ updateMetadata: false });

  const untouchedIndices = [...Array(pageCount).keys()].filter((index) => !rasterByPage.has(index));
  const copiedPages = await output.copyPages(source, untouchedIndices);
  const copiedByIndex = new Map(untouchedIndices.map((index, i) => [index, copiedPages[i]!]));

  for (let index = 0; index < pageCount; index++) {
    const rasterPath = rasterByPage.get(index);
    if (rasterPath) {
      const image = await output.embedPng(await readFile(rasterPath));
      const { width, height } = visibleSize(source.getPage(index));
      const page = output.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
      continue;
    }

    const page = output.addPage(copiedByIndex.get(index)!);
    for (const key of STRIPPED_PAGE_KEYS) {
      page.node.delete(PDFName.of(key));
    }
  }

  return Buffer.from(await output.save({ useObjectStreams: false, updateFieldAppearances: false }));
}
