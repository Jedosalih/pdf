interface HeroProps {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export function Hero({ eyebrow, title, subtitle }: HeroProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center sm:py-20">
      <p className="text-small font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
      <h1 className="max-w-3xl text-h1 font-bold tracking-tight text-foreground sm:text-display">
        {title}
      </h1>
      <p className="max-w-xl text-body text-muted-foreground">{subtitle}</p>
    </div>
  );
}
