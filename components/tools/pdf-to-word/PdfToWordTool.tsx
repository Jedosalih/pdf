import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToWordToolProps {
  maxFiles: number;
}

export function PdfToWordTool({ maxFiles }: PdfToWordToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-word"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
