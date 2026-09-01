import type { ReactNode } from "react";
import { FeatureCard } from "./FeatureCard";

interface Feature {
  icon: ReactNode;
  title: string;
  description: string;
}

interface FeatureSectionProps {
  title: string;
  features: Feature[];
}

export function FeatureSection({ title, features }: FeatureSectionProps) {
  return (
    <div className="flex flex-col gap-10">
      <h2 className="text-center text-h2 font-semibold text-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </div>
  );
}
