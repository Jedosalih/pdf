import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToHtmlToolProps {
  maxFiles: number;
}

export function PdfToHtmlTool({ maxFiles }: PdfToHtmlToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-html"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
