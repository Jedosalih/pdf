import common from "./common.json";
import home from "./home.json";
import tools from "./tools.json";
import mergePdf from "./tool.merge-pdf.json";
import splitPdf from "./tool.split-pdf.json";
import compressPdf from "./tool.compress-pdf.json";
import rotatePdf from "./tool.rotate-pdf.json";

const messages = {
  common,
  home,
  tools,
  tool: {
    "merge-pdf": mergePdf,
    "split-pdf": splitPdf,
    "compress-pdf": compressPdf,
    "rotate-pdf": rotatePdf,
  },
};

export default messages;
