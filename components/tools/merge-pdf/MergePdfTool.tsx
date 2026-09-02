import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface MergePdfToolProps {
  maxFiles: number;
}

export function MergePdfTool({ maxFiles }: MergePdfToolProps) {
  return (
    <MultiFileTool
      toolId="merge-pdf"
      accept="application/pdf"
      maxFiles={maxFiles}
      minFiles={2}
    />
  );
}
