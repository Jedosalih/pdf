import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface RepairPdfToolProps {
  maxFiles: number;
}

export function RepairPdfTool({ maxFiles }: RepairPdfToolProps) {
  return (
    <MultiFileTool
      toolId="repair-pdf"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
