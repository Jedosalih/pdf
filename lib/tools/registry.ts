import type { ToolDefinition } from "./types";

const MB = 1024 * 1024;

export const tools: ToolDefinition[] = [
  {
    id: "merge-pdf",
    slug: "merge-pdf",
    category: "pdf",
    inputTypes: ["application/pdf"],
    outputType: "application/pdf",
    processor: "qpdf",
    queue: "pdf-processing",
    enabled: true,
    guestEnabled: true,
    translationNamespace: "tool.merge-pdf",
    relatedTools: [],
    limits: {
      guest: {
        maxFileSizeBytes: 20 * MB,
        maxFiles: 10,
        maxPages: 300,
        dailyOperations: 8,
      },
      free: {
        maxFileSizeBytes: 50 * MB,
        maxFiles: 20,
        maxPages: 1000,
        dailyOperations: 30,
      },
    },
  },
];

export function getEnabledTools(): ToolDefinition[] {
  return tools.filter((tool) => tool.enabled);
}

export function getToolBySlug(slug: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.slug === slug && tool.enabled);
}

export function getToolById(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.id === id);
}
