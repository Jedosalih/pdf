import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import type { BreadcrumbItem } from "@/components/layout/Breadcrumbs";
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
}

/**
 * The one page shell every tool uses (blueprint §26): hero, workspace,
 * how-it-works, FAQ with structured data. Tool pages only supply content
 * and their own workspace — never rebuild this structure from scratch.
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
}: ToolPageProps) {
  return (
    <PageContainer className="max-w-3xl py-12">
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
    </PageContainer>
  );
}
