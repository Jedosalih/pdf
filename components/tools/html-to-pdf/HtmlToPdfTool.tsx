import { MultiFileTool } from "@/components/tools/MultiFileTool";

interface HtmlToPdfToolProps {
  maxFiles: number;
}

export function HtmlToPdfTool({ maxFiles }: HtmlToPdfToolProps) {
  return (
    <MultiFileTool
      toolId="html-to-pdf"
      accept="text/html,.html,.htm"
      maxFiles={maxFiles}
      minFiles={1}
      multiple={false}
      reorderable={false}
    />
  );
}
