interface HowItWorksProps {
  title: string;
  steps: string[];
}

/** Shared by the homepage and every tool page (via ToolDescription) — one
 * numbered-step visual treatment, not a different one per context. */
export function HowItWorks({ title, steps }: HowItWorksProps) {
  return (
    <div className="flex flex-col gap-10">
      <h2 className="text-center text-h2 font-semibold text-foreground">{title}</h2>
      <ol className="grid grid-cols-1 gap-8 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step} className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-button font-bold text-white">
              {index + 1}
            </span>
            <span className="text-body text-foreground">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
