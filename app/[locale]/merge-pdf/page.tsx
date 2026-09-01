import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { getToolLimits } from "@/lib/entitlements";
import { resolveActor } from "@/lib/security/actor";
import { MergePdfTool } from "@/components/tools/merge-pdf/MergePdfTool";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tool.merge-pdf" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/merge-pdf",
    title: t("seo.title"),
    description: t("seo.description"),
  });
}

export default async function MergePdfPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tool.merge-pdf");

  const actor = await resolveActor();
  const limits = await getToolLimits(actor, "merge-pdf");

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
    <div className="mx-auto max-w-3xl px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <h1 className="text-h1 font-bold text-foreground">{t("h1")}</h1>
      <p className="mt-2 text-body text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-8">
        <MergePdfTool maxFiles={limits.maxFiles} />
      </div>

      <section className="mt-16">
        <h2 className="text-h2 font-semibold text-foreground">
          {t("howItWorks.title")}
        </h2>
        <ol className="mt-4 flex list-decimal flex-col gap-2 ps-5 text-body text-foreground">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="mt-16">
        <h2 className="text-h2 font-semibold text-foreground">{t("faq.title")}</h2>
        <div className="mt-4 flex flex-col gap-4">
          {faqItems.map((item) => (
            <div key={item.q}>
              <h3 className="text-h3 font-medium text-foreground">{item.q}</h3>
              <p className="mt-1 text-body text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
