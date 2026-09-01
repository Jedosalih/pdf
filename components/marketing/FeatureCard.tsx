import type { ReactNode } from "react";

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
        {icon}
      </div>
      <p className="text-body font-semibold text-foreground">{title}</p>
      <p className="text-small text-muted-foreground">{description}</p>
    </div>
  );
}
