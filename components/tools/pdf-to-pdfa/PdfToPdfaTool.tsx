import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToPdfaToolProps {
  maxFiles: number;
}

export function PdfToPdfaTool({ maxFiles }: PdfToPdfaToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-pdfa"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
