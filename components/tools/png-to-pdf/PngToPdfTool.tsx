import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PngToPdfToolProps {
  maxFiles: number;
}

export function PngToPdfTool({ maxFiles }: PngToPdfToolProps) {
  return (
    <MultiFileTool
      toolId="png-to-pdf"
      accept="image/png"
      maxFiles={maxFiles}
      minFiles={1}
    />
  );
}
