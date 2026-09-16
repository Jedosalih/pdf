import common from "./common.json";
import auth from "./auth.json";
import workspace from "./workspace.json";
import toolsDirectory from "./tools-directory.json";
import home from "./home.json";
import tools from "./tools.json";
import mergePdf from "./tool.merge-pdf.json";
import splitPdf from "./tool.split-pdf.json";
import compressPdf from "./tool.compress-pdf.json";
import rotatePdf from "./tool.rotate-pdf.json";
import deletePages from "./tool.delete-pages.json";
import extractPages from "./tool.extract-pages.json";
import reorderPages from "./tool.reorder-pages.json";
import jpgToPdf from "./tool.jpg-to-pdf.json";
import pngToPdf from "./tool.png-to-pdf.json";
import pdfToJpg from "./tool.pdf-to-jpg.json";
import pdfToPng from "./tool.pdf-to-png.json";
import watermarkPdf from "./tool.watermark-pdf.json";
import pageNumbers from "./tool.page-numbers.json";
import protectPdf from "./tool.protect-pdf.json";
import unlockPdf from "./tool.unlock-pdf.json";
import pdfMetadata from "./tool.pdf-metadata.json";
import pdfToText from "./tool.pdf-to-text.json";
import pdfToPdfa from "./tool.pdf-to-pdfa.json";
import flattenPdf from "./tool.flatten-pdf.json";
import repairPdf from "./tool.repair-pdf.json";

const messages = {
  common,
  auth,
  workspace,
  toolsDirectory,
  home,
  tools,
  tool: {
    "merge-pdf": mergePdf,
    "split-pdf": splitPdf,
    "compress-pdf": compressPdf,
    "rotate-pdf": rotatePdf,
    "delete-pages": deletePages,
    "extract-pages": extractPages,
    "reorder-pages": reorderPages,
    "jpg-to-pdf": jpgToPdf,
    "png-to-pdf": pngToPdf,
    "pdf-to-jpg": pdfToJpg,
    "pdf-to-png": pdfToPng,
    "watermark-pdf": watermarkPdf,
    "page-numbers": pageNumbers,
    "protect-pdf": protectPdf,
    "unlock-pdf": unlockPdf,
    "pdf-metadata": pdfMetadata,
    "pdf-to-text": pdfToText,
    "pdf-to-pdfa": pdfToPdfa,
    "flatten-pdf": flattenPdf,
    "repair-pdf": repairPdf,
  },
};

export default messages;
