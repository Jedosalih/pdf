import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Layers, RefreshCw, Gauge, PenSquare, ShieldCheck, ListChecks } from "lucide-react";
import { buildLocalizedMetadata } from "@/lib/seo/metadata";
import { getEnabledTools } from "@/lib/tools/registry";
import type { ToolCategory } from "@/lib/tools/types";
import { Section } from "@/components/layout/Section";
import { PageContainer } from "@/components/layout/PageContainer";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { CategoryCard } from "@/components/marketing/CategoryCard";
import { ToolsDirectorySearch } from "@/components/marketing/ToolsDirectorySearch";
import type {
  ToolsDirectoryGroup,
  ToolsDirectoryToolItem,
} from "@/components/marketing/ToolsDirectorySearch";
import type { Locale } from "@/lib/i18n/routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "toolsDirectory" });
  return buildLocalizedMetadata({
    locale: locale as Locale,
    path: "/tools",
    title: t("title"),
    description: t("subtitle"),
  });
}

const categoryOrder: ToolCategory[] = ["organize", "convert", "optimize", "edit", "security"];

const categoryIcons: Record<ToolCategory, typeof Layers> = {
  organize: Layers,
  convert: RefreshCw,
  optimize: Gauge,
  edit: PenSquare,
  security: ShieldCheck,
};

export default async function ToolsDirectoryPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("toolsDirectory");
  const tCommon = await getTranslations("common");
  const tBatch = await getTranslations("batch");

  const tools = getEnabledTools();
  const toolCards: (ToolsDirectoryToolItem & { category: ToolCategory })[] = await Promise.all(
    tools.map(async (tool) => {
      const toolT = await getTranslations({ locale, namespace: tool.translationNamespace });
      const Icon = tool.icon;
      return {
        slug: tool.slug,
        // Rendered here (a Server Component), not passed as a bare
        // component reference, since it crosses into ToolsDirectorySearch
        // (a Client Component) below.
        icon: <Icon className="h-5 w-5" aria-hidden="true" />,
        title: toolT("h1"),
        description: toolT("subtitle"),
        category: tool.category,
      };
    }),
  );

  const groups: (ToolsDirectoryGroup & { category: ToolCategory })[] = categoryOrder
    .map((category) => ({
      category,
      label: tCommon(`categories.${category}`),
      tools: toolCards.filter((tool) => tool.category === category),
    }))
    .filter((group) => group.tools.length > 0);

  return (
    <PageContainer>
      <Section>
        <Breadcrumbs
          items={[{ label: tCommon("brand"), href: "/" }, { label: t("title") }]}
        />
        <div className="mt-4 flex flex-col gap-2">
          <h1 className="text-h1 font-bold text-foreground">{t("title")}</h1>
          <p className="text-body text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <CategoryCard
              key={group.category}
              href={`#${group.category}`}
              icon={categoryIcons[group.category]}
              label={group.label}
              count={t("categoryCount", { count: group.tools.length })}
            />
          ))}
          {/* Not a category -- batch-process runs an existing single-file
           * tool across many files at once, so it has no registry entry of
           * its own and wouldn't otherwise appear in this directory. */}
          <CategoryCard
            href="/batch-process"
            icon={ListChecks}
            label={tBatch("h1")}
            count={tBatch("subtitle")}
          />
        </div>

        <div className="mt-10">
          <ToolsDirectorySearch
            groups={groups}
            searchPlaceholder={t("searchPlaceholder")}
            searchEmptyState={t("searchEmptyState")}
          />
        </div>
      </Section>
    </PageContainer>
  );
}
