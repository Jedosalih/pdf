import type { Metadata } from "next";
import { locales, type Locale } from "@/lib/i18n/routing";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

interface BuildMetadataParams {
  locale: Locale;
  /** Path after the locale segment, e.g. "/merge-pdf", or "" for the homepage. */
  path: string;
  title: string;
  description: string;
}

/**
 * Single source of truth for canonical + hreflang across every localized
 * page (blueprint §27–28, docs/I18N.md). Every page calls this instead of
 * hand-rolling its own metadata block.
 */
export function buildLocalizedMetadata({
  locale,
  path,
  title,
  description,
}: BuildMetadataParams): Metadata {
  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = `${siteUrl}/${loc}${path}`;
  }
  languages["x-default"] = `${siteUrl}/en${path}`;

  const canonicalUrl = `${siteUrl}/${locale}${path}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      locale,
      siteName: "JPdf",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
