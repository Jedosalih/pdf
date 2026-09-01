import type { MetadataRoute } from "next";
import { locales } from "@/lib/i18n/routing";
import { getEnabledTools } from "@/lib/tools/registry";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

/**
 * Reads from the tool registry so a newly enabled tool is included
 * automatically — no manual sitemap maintenance (blueprint §27).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticPaths = ["", ...getEnabledTools().map((tool) => `/${tool.slug}`)];

  return staticPaths.flatMap((path) =>
    locales.map((locale) => ({
      url: `${siteUrl}/${locale}${path}`,
      lastModified: new Date(),
    })),
  );
}
