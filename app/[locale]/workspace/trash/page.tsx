import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { DocumentList } from "@/components/workspace/DocumentList";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "workspace" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/workspace/trash",
    title: t("trash.title"),
    description: t("trash.title"),
  });
}

export default async function TrashPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("workspace");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 font-bold text-foreground">{t("trash.title")}</h1>
      <DocumentList view="trash" />
    </div>
  );
}
