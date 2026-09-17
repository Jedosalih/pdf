import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import type { BreadcrumbItem } from "@/components/layout/Breadcrumbs";
import { ToolGrid, type ToolGridItem } from "@/components/marketing/ToolGrid";
import { ToolHero } from "./ToolHero";
import { ToolDescription } from "./ToolDescription";

interface FaqItem {
  q: string;
  a: string;
}

interface ToolPageProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  breadcrumbs: BreadcrumbItem[];
  /** The upload/options/action workspace — differs per tool. */
  workspace: ReactNode;
  howItWorksTitle: string;
  steps: string[];
  faqTitle: string;
  faqItems: FaqItem[];
  /** Rendered as a <script type="application/ld+json"> for FAQPage schema. */
  faqStructuredData: object;
  relatedToolsTitle?: string;
  relatedTools?: ToolGridItem[];
  /** Widens the container for workspaces that need real horizontal room
   * (e.g. the PDF editor's canvas + side panels) instead of the narrow
   * single-column form every other tool uses. */
  wide?: boolean;
}

/**
 * The one page shell every tool uses (blueprint §26): hero, workspace,
 * how-it-works, FAQ with structured data, related tools. Tool pages only
 * supply content and their own workspace — never rebuild this structure
 * from scratch.
 */
export function ToolPage({
  icon,
  title,
  subtitle,
  breadcrumbs,
  workspace,
  howItWorksTitle,
  steps,
  faqTitle,
  faqItems,
  faqStructuredData,
  relatedToolsTitle,
  relatedTools,
  wide = false,
}: ToolPageProps) {
  return (
    <PageContainer className={wide ? "max-w-[1440px] py-8" : "max-w-3xl py-12"}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <ToolHero icon={icon} title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} />

      <div className="mt-8">{workspace}</div>

      <ToolDescription
        howItWorksTitle={howItWorksTitle}
        steps={steps}
        faqTitle={faqTitle}
        faqItems={faqItems}
      />

      {relatedTools && relatedTools.length > 0 ? (
        <section className="mt-16">
          <h2 className="text-h2 font-semibold text-foreground">{relatedToolsTitle}</h2>
          <div className="mt-4">
            <ToolGrid tools={relatedTools} />
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
}
