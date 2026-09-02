import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToJpgToolProps {
  maxFiles: number;
}

export function PdfToJpgTool({ maxFiles }: PdfToJpgToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-jpg"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      reorderable={false}
      multiple={false}
    />
  );
}
