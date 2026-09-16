import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck, Zap, Globe2, Trash2, Lock } from "lucide-react";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { getPopularTools } from "@/lib/tools/popular";
import { Section } from "@/components/layout/Section";
import { PageContainer } from "@/components/layout/PageContainer";
import { Hero } from "@/components/marketing/Hero";
import { HeroDropzoneCard } from "@/components/marketing/HeroDropzoneCard";
import { PopularToolsRow } from "@/components/marketing/PopularToolsRow";
import { FeatureSection } from "@/components/marketing/FeatureSection";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FAQ } from "@/components/marketing/FAQ";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "",
    title: t("hero.title"),
    description: t("hero.subtitle"),
  });
}

const featureIcons = [Zap, ShieldCheck, Globe2];
const securityIcons = [ShieldCheck, Trash2, Lock];

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  const popularTools = await Promise.all(
    getPopularTools().map(async (tool) => {
      const toolT = await getTranslations({ locale, namespace: tool.translationNamespace });
      const Icon = tool.icon;
      return {
        slug: tool.slug,
        // Rendered here (a Server Component), not passed as a bare
        // component reference, since it crosses into PopularToolsRow (a
        // Client Component) below.
        icon: <Icon className="h-5 w-5" aria-hidden="true" />,
        title: toolT("h1"),
        description: toolT("subtitle"),
      };
    }),
  );

  const whyUsItems = t.raw("whyUs.items") as { title: string; description: string }[];
  const steps = t.raw("howItWorks.steps") as string[];
  const securityItems = t.raw("security.items") as { title: string; description: string }[];
  const faqItems = t.raw("faq.items") as { q: string; a: string }[];

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
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <div className="border-b border-border bg-surface">
        <PageContainer className="flex flex-col items-center gap-8">
          <Hero eyebrow={t("hero.eyebrow")} title={t("hero.title")} subtitle={t("hero.subtitle")} />
          <div className="w-full max-w-xl pb-16 sm:pb-20">
            <HeroDropzoneCard />
          </div>
        </PageContainer>
      </div>

      <Section>
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-h2 font-semibold text-foreground">{t("popularTools.title")}</h2>
            <Link href="/tools" className="text-small font-medium text-primary hover:underline">
              {t("popularTools.browseAll")}
            </Link>
          </div>
          <PopularToolsRow
            tools={popularTools}
            scrollLeftLabel={t("popularTools.scrollLeft")}
            scrollRightLabel={t("popularTools.scrollRight")}
          />
        </div>
      </Section>

      <Section>
        <FeatureSection
          title={t("whyUs.title")}
          features={whyUsItems.map((item, index) => {
            const Icon = featureIcons[index % featureIcons.length]!;
            return {
              icon: <Icon className="h-5 w-5" aria-hidden="true" />,
              title: item.title,
              description: item.description,
            };
          })}
        />
      </Section>

      <Section>
        <HowItWorks title={t("howItWorks.title")} steps={steps} />
      </Section>

      <Section>
        <FeatureSection
          title={t("security.title")}
          features={securityItems.map((item, index) => {
            const Icon = securityIcons[index % securityIcons.length]!;
            return {
              icon: <Icon className="h-5 w-5" aria-hidden="true" />,
              title: item.title,
              description: item.description,
            };
          })}
        />
      </Section>

      <Section>
        <FAQ title={t("faq.title")} items={faqItems} />
      </Section>
    </div>
  );
}
