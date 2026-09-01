import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FAQ } from "@/components/marketing/FAQ";

interface FaqItem {
  q: string;
  a: string;
}

interface ToolDescriptionProps {
  howItWorksTitle: string;
  steps: string[];
  faqTitle: string;
  faqItems: FaqItem[];
}

export function ToolDescription({
  howItWorksTitle,
  steps,
  faqTitle,
  faqItems,
}: ToolDescriptionProps) {
  return (
    <>
      <section className="mt-16">
        <HowItWorks title={howItWorksTitle} steps={steps} />
      </section>
      <section className="mt-16">
        <FAQ title={faqTitle} items={faqItems} />
      </section>
    </>
  );
}
