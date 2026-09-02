import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { getToolLimits } from "@/lib/entitlements";
import { resolveActorReadOnly } from "@/lib/security/actor";
import { getToolById } from "@/lib/tools/registry";
import { getRelatedToolCards } from "@/lib/tools/relatedTools";
import { WatermarkPdfTool } from "@/components/tools/watermark-pdf/WatermarkPdfTool";
import { ToolPage } from "@/components/tools/ToolPage";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tool.watermark-pdf" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/watermark-pdf",
    title: t("seo.title"),
    description: t("seo.description"),
  });
}

export default async function WatermarkPdfPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tool.watermark-pdf");
  const tCommon = await getTranslations("common");
  const tTools = await getTranslations("tools");

  const tool = getToolById("watermark-pdf")!;
  const Icon = tool.icon;

  const actor = await resolveActorReadOnly();
  const limits = await getToolLimits(actor, "watermark-pdf");

  const faqItems = t.raw("faq.items") as { q: string; a: string }[];
  const steps = t.raw("howItWorks.steps") as string[];
  const relatedTools = await getRelatedToolCards(locale, tool.relatedTools);

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <ToolPage
      icon={<Icon className="h-7 w-7" aria-hidden="true" />}
      title={t("h1")}
      subtitle={t("subtitle")}
      breadcrumbs={[
        { label: tCommon("brand"), href: "/" },
        { label: tCommon(`categories.${tool.category}`), href: "/#tools" },
        { label: t("h1") },
      ]}
      workspace={<WatermarkPdfTool maxFiles={limits.maxFiles} />}
      howItWorksTitle={t("howItWorks.title")}
      steps={steps}
      faqTitle={t("faq.title")}
      faqItems={faqItems}
      faqStructuredData={faqStructuredData}
      relatedToolsTitle={tTools("result.relatedTools")}
      relatedTools={relatedTools}
    />
  );
}
