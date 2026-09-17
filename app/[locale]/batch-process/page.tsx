import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { getToolLimits } from "@/lib/entitlements";
import { resolveActorReadOnly } from "@/lib/security/actor";
import { BATCHABLE_TOOL_IDS, type BatchableToolId } from "@/lib/tools/batch";
import type { ToolLimits } from "@/lib/tools/types";
import { BatchProcessTool } from "@/components/batch/BatchProcessTool";
import { ToolPage } from "@/components/tools/ToolPage";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "batch" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/batch-process",
    title: t("seo.title"),
    description: t("seo.description"),
  });
}

export default async function BatchProcessPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("batch");
  const tCommon = await getTranslations("common");

  const actor = await resolveActorReadOnly();
  const limitsEntries = await Promise.all(
    BATCHABLE_TOOL_IDS.map(
      async (toolId) => [toolId, await getToolLimits(actor, toolId)] as const,
    ),
  );
  const limitsByTool = Object.fromEntries(limitsEntries) as Record<BatchableToolId, ToolLimits>;

  const faqItems = t.raw("faq.items") as { q: string; a: string }[];
  const steps = t.raw("howItWorks.steps") as string[];

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
      icon={<ListChecks className="h-7 w-7" aria-hidden="true" />}
      title={t("h1")}
      subtitle={t("subtitle")}
      breadcrumbs={[
        { label: tCommon("brand"), href: "/" },
        { label: t("h1") },
      ]}
      workspace={<BatchProcessTool limitsByTool={limitsByTool} />}
      howItWorksTitle={t("howItWorks.title")}
      steps={steps}
      faqTitle={t("faq.title")}
      faqItems={faqItems}
      faqStructuredData={faqStructuredData}
    />
  );
}
