import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface WordToPdfToolProps {
  maxFiles: number;
}

export function WordToPdfTool({ maxFiles }: WordToPdfToolProps) {
  return (
    <MultiFileTool
      toolId="word-to-pdf"
      accept="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
