import { Combine } from "lucide-react";
import type { ToolDefinition } from "./types";

const MB = 1024 * 1024;

/**
 * Tools are only added here once their full pipeline (worker handler, page,
 * translations, E2E test) actually works end to end — an entry in this
 * registry is a promise the homepage/nav will link to something real, not
 * a placeholder (blueprint: "never ship a fake implementation").
 */
export const tools: ToolDefinition[] = [
  {
    id: "merge-pdf",
    slug: "merge-pdf",
    category: "organize",
    icon: Combine,
    inputTypes: ["application/pdf"],
    outputType: "application/pdf",
    processor: "qpdf",
    queue: "pdf-processing",
    enabled: true,
    guestEnabled: true,
    multipleFiles: true,
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

export function getToolsByCategory(category: ToolDefinition["category"]): ToolDefinition[] {
  return getEnabledTools().filter((tool) => tool.category === category);
}

export function getToolBySlug(slug: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.slug === slug && tool.enabled);
}

export function getToolById(id: string): ToolDefinition | undefined {
  return tools.find((tool) => tool.id === id);
}
