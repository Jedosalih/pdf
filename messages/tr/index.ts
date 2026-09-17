import common from "./common.json";
import auth from "./auth.json";
import workspace from "./workspace.json";
import toolsDirectory from "./tools-directory.json";
import home from "./home.json";
import tools from "./tools.json";
import batch from "./batch.json";
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
import wordToPdf from "./tool.word-to-pdf.json";
import pdfToWord from "./tool.pdf-to-word.json";
import excelToPdf from "./tool.excel-to-pdf.json";
import pdfToExcel from "./tool.pdf-to-excel.json";
import powerpointToPdf from "./tool.powerpoint-to-pdf.json";
import pdfToPowerpoint from "./tool.pdf-to-powerpoint.json";
import ocrPdf from "./tool.ocr-pdf.json";
import htmlToPdf from "./tool.html-to-pdf.json";
import markdownToPdf from "./tool.markdown-to-pdf.json";
import editPdf from "./tool.edit-pdf.json";
import fillSignPdf from "./tool.fill-sign-pdf.json";
import redactPdf from "./tool.redact-pdf.json";
import comparePdf from "./tool.compare-pdf.json";
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
  batch,
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
    "word-to-pdf": wordToPdf,
    "pdf-to-word": pdfToWord,
    "excel-to-pdf": excelToPdf,
    "pdf-to-excel": pdfToExcel,
    "powerpoint-to-pdf": powerpointToPdf,
    "pdf-to-powerpoint": pdfToPowerpoint,
    "ocr-pdf": ocrPdf,
    "html-to-pdf": htmlToPdf,
    "markdown-to-pdf": markdownToPdf,
    "edit-pdf": editPdf,
    "fill-sign-pdf": fillSignPdf,
    "redact-pdf": redactPdf,
    "compare-pdf": comparePdf,
  },
};

export default messages;
