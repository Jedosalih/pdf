import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface JpgToPdfToolProps {
  maxFiles: number;
}

export function JpgToPdfTool({ maxFiles }: JpgToPdfToolProps) {
  return (
    <MultiFileTool
      toolId="jpg-to-pdf"
      accept="image/jpeg"
      maxFiles={maxFiles}
      minFiles={1}
    />
  );
}
