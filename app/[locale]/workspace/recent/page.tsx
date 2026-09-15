import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { HistoryList } from "@/components/workspace/HistoryList";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workspace" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/workspace/recent",
    title: t("nav.recent"),
    description: t("recent.title"),
  });
}

export default async function RecentPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("workspace");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 font-bold text-foreground">{t("recent.title")}</h1>
      <HistoryList />
    </div>
  );
}
