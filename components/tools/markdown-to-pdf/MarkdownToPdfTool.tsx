import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface MarkdownToPdfToolProps {
  maxFiles: number;
}

export function MarkdownToPdfTool({ maxFiles }: MarkdownToPdfToolProps) {
  return (
    <MultiFileTool
      toolId="markdown-to-pdf"
      accept="text/markdown,.md,.markdown"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
