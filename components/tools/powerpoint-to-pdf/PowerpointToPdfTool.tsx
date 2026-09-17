import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface PowerpointToPdfToolProps {
  maxFiles: number;
}

export function PowerpointToPdfTool({ maxFiles }: PowerpointToPdfToolProps) {
  return (
    <MultiFileTool
      toolId="powerpoint-to-pdf"
      accept="application/vnd.openxmlformats-officedocument.presentationml.presentation"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
