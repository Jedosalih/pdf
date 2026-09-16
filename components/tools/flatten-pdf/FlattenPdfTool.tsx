import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface FlattenPdfToolProps {
  maxFiles: number;
}

export function FlattenPdfTool({ maxFiles }: FlattenPdfToolProps) {
  return (
    <MultiFileTool
      toolId="flatten-pdf"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
