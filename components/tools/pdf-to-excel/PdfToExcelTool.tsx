import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PdfToExcelToolProps {
  maxFiles: number;
}

export function PdfToExcelTool({ maxFiles }: PdfToExcelToolProps) {
  return (
    <MultiFileTool
      toolId="pdf-to-excel"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
