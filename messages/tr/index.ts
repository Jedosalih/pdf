import common from "./common.json";
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

const messages = {
  common,
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
  },
};

export default messages;
