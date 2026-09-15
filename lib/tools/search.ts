export interface SearchableTool {
  slug: string;
  title: string;
  description: string;
  category?: string;
}

/**
 * Case-insensitive substring match across title/description/category —
 * shared by the command palette and the `/tools` directory search so the
 * matching logic exists in exactly one place (blueprint §59).
 */
export function searchTools<T extends SearchableTool>(tools: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;

  return tools.filter((tool) =>
    [tool.title, tool.description, tool.category ?? ""].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}
