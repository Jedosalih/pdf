import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToMdToolProps {
  maxFiles: number;
}

export function PdfToMdTool({ maxFiles }: PdfToMdToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-md"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
