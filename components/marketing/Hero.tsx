import { Link } from "@/lib/i18n/navigation";
import { buttonVariants } from "@/components/ui/Button";

interface HeroProps {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
}

export function Hero({ title, subtitle, ctaLabel, ctaHref }: HeroProps) {
  return (
    <div className="flex flex-col items-center gap-5 py-16 text-center sm:py-24">
      <h1 className="max-w-3xl text-h1 font-bold tracking-tight text-foreground sm:text-display">
        {title}
      </h1>
      <p className="max-w-xl text-body text-muted-foreground">{subtitle}</p>
      <Link href={ctaHref} className={buttonVariants({ size: "lg" })}>
        {ctaLabel}
      </Link>
    </div>
  );
}
