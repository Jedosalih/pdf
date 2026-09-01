import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck, Zap, Globe2 } from "lucide-react";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { getEnabledTools } from "@/lib/tools/registry";
import type { ToolCategory } from "@/lib/tools/types";
import { Section } from "@/components/layout/Section";
import { PageContainer } from "@/components/layout/PageContainer";
import { Hero } from "@/components/marketing/Hero";
import { CategorySection } from "@/components/marketing/CategorySection";
import { ToolGrid, type ToolGridItem } from "@/components/marketing/ToolGrid";
import { FeatureSection } from "@/components/marketing/FeatureSection";
import { HowItWorks } from "@/components/marketing/HowItWorks";
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

const categoryOrder: ToolCategory[] = ["organize", "convert", "optimize", "edit", "security"];

const featureIcons = [Zap, ShieldCheck, Globe2];

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const tCommon = await getTranslations("common");

  const tools = getEnabledTools();
  const toolCards = await Promise.all(
    tools.map(async (tool) => {
      const toolT = await getTranslations({
        locale,
        namespace: tool.translationNamespace,
      });
      const item: ToolGridItem & { category: typeof tool.category } = {
        slug: tool.slug,
        icon: <tool.icon className="h-5 w-5" aria-hidden="true" />,
        title: toolT("h1"),
        description: toolT("subtitle"),
        category: tool.category,
      };
      return item;
    }),
  );

  const categories = categoryOrder
    .map((category) => ({
      category,
      label: tCommon(`categories.${category}`),
      items: toolCards.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.items.length > 0);

  const whyUsItems = t.raw("whyUs.items") as { title: string; description: string }[];
  const steps = t.raw("howItWorks.steps") as string[];

  return (
    <div>
      <div className="border-b border-border bg-surface">
        <PageContainer>
          <Hero
            title={t("hero.title")}
            subtitle={t("hero.subtitle")}
            ctaLabel={t("hero.cta")}
            ctaHref="/#tools"
          />
        </PageContainer>
      </div>

      <Section id="tools">
        <div className="flex flex-col gap-10">
          <h2 className="text-h2 font-semibold text-foreground">{t("popularTools.title")}</h2>
          {categories.map((group) => (
            <CategorySection key={group.category} title={group.label}>
              <ToolGrid tools={group.items} />
            </CategorySection>
          ))}
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
    </div>
  );
}
