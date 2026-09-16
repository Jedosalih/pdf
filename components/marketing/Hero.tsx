interface HeroProps {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export function Hero({ eyebrow, title, subtitle }: HeroProps) {
  return (
    <div className="flex flex-col items-start gap-4 text-start">
      <p className="text-small font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
      <h1 className="text-h1 font-bold tracking-tight text-foreground sm:text-display">
        {title}
      </h1>
      <p className="max-w-lg text-body text-muted-foreground">{subtitle}</p>
    </div>
  );
}
