import { getToolById } from "./registry";
import type { ToolDefinition } from "./types";

/**
 * A small hand-picked, ordered list for the homepage's "Popular tools"
 * row — presentation-only curation, so it lives here rather than as a
 * `featured` field on `ToolDefinition` (the registry is shared with
 * workers/API/limits; no second use case yet justifies promoting this
 * into it, see AGENTS.md §5 no-premature-abstraction).
 */
const POPULAR_TOOL_SLUGS = [
  "merge-pdf",
  "compress-pdf",
  "split-pdf",
  "jpg-to-pdf",
  "pdf-to-jpg",
  "watermark-pdf",
  "protect-pdf",
  "rotate-pdf",
] as const;

export function getPopularTools(): ToolDefinition[] {
  return POPULAR_TOOL_SLUGS.map((id) => getToolById(id)).filter(
    (tool): tool is ToolDefinition => Boolean(tool?.enabled),
  );
}
