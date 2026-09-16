import { CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface HeroIllustrationCategory {
  icon: LucideIcon;
  label: string;
}

interface HeroIllustrationProps {
  categories: HeroIllustrationCategory[];
  readyLabel: string;
}

/**
 * Purely decorative — a small composition built entirely out of existing
 * design tokens (border/shadow-sm/shadow-md/rounded-lg, no image assets, no
 * illustration library, no gradients/glassmorphism/animation) suggesting
 * "stacked documents + an action menu," so the hero communicates the
 * product visually instead of through text alone. Desktop-only companion
 * to the hero text column — see app/[locale]/page.tsx.
 */
export function HeroIllustration({ categories, readyLabel }: HeroIllustrationProps) {
  return (
    <div className="relative hidden h-80 lg:block" aria-hidden="true">
      <div className="absolute inset-x-10 top-8 h-56 rotate-3 rounded-lg border border-border bg-surface shadow-sm" />
      <div className="absolute inset-x-4 top-2 h-60 -rotate-1 rounded-lg border border-border bg-background p-5 shadow-md">
        <div className="h-2.5 w-28 rounded-full bg-secondary" />
        <div className="mt-5 flex flex-col gap-2.5">
          <div className="h-2 w-full rounded-full bg-border" />
          <div className="h-2 w-5/6 rounded-full bg-border" />
          <div className="h-2 w-4/6 rounded-full bg-border" />
        </div>
      </div>
      <div className="absolute bottom-2 start-0 w-48 rounded-lg border border-border bg-background p-3 shadow-md">
        <ul className="flex flex-col gap-2">
          {categories.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-small text-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-secondary text-primary">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute bottom-6 end-2 flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1.5 text-caption font-medium text-success shadow-sm">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {readyLabel}
      </div>
    </div>
  );
}
