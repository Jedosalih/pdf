import { Link } from "@/lib/i18n/navigation";
import { buttonVariants } from "@/components/ui/Button";

interface CTASectionProps {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  ctaHref: string;
}

export function CTASection({ title, subtitle, ctaLabel, ctaHref }: CTASectionProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg bg-foreground px-6 py-14 text-center">
      <h2 className="text-h2 font-bold text-background">{title}</h2>
      {subtitle ? <p className="max-w-lg text-body text-background/80">{subtitle}</p> : null}
      <Link href={ctaHref} className={buttonVariants({ size: "lg" })}>
        {ctaLabel}
      </Link>
    </div>
  );
}
