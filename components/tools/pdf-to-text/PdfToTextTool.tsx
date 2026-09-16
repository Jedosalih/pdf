import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToTextToolProps {
  maxFiles: number;
}

export function PdfToTextTool({ maxFiles }: PdfToTextToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-text"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
