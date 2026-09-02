import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToPngToolProps {
  maxFiles: number;
}

export function PdfToPngTool({ maxFiles }: PdfToPngToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-png"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      reorderable={false}
      multiple={false}
    />
  );
}
