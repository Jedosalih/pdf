import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToPowerpointToolProps {
  maxFiles: number;
}

export function PdfToPowerpointTool({ maxFiles }: PdfToPowerpointToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-powerpoint"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
