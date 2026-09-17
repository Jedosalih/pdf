import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface ExcelToPdfToolProps {
  maxFiles: number;
}

export function ExcelToPdfTool({ maxFiles }: ExcelToPdfToolProps) {
  return (
    <MultiFileTool
      toolId="excel-to-pdf"
      accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
