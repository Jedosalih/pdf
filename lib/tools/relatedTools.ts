import { getTranslations } from "next-intl/server";
import { getToolById } from "./registry";
import type { ToolDefinition } from "./types";

export interface RelatedToolCard {
  slug: string;
  icon: ToolDefinition["icon"];
  title: string;
  description: string;
}

/**
 * Resolves a tool's `relatedTools` ids into display-ready cards. Shared by
 * every tool page so cross-linking (blueprint §74–75) doesn't get
 * reimplemented per tool.
 */
export async function getRelatedToolCards(
  locale: string,
  toolIds: string[],
): Promise<RelatedToolCard[]> {
  const cards = await Promise.all(
    toolIds.map(async (id) => {
      const tool = getToolById(id);
      if (!tool || !tool.enabled) return null;

      const t = await getTranslations({ locale, namespace: tool.translationNamespace });
      return {
        slug: tool.slug,
        icon: tool.icon,
        title: t("h1"),
        description: t("subtitle"),
      };
    }),
  );

  return cards.filter((card): card is RelatedToolCard => card !== null);
}
