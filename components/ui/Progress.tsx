import { cn } from "@/lib/utils/cn";

interface ProgressProps {
  /** Omit to render a truthful indeterminate state — never fake a percentage. */
  value?: number;
  label?: string;
  className?: string;
}

export function Progress({ value, label, className }: ProgressProps) {
  const determinate = typeof value === "number";

  return (
    <div
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-sm bg-border",
        className,
      )}
      role="progressbar"
      aria-valuenow={determinate ? Math.round(value) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {determinate ? (
        <div
          className="h-full rounded-sm bg-primary transition-[width] duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      ) : (
        <div className="absolute inset-y-0 start-0 h-full w-1/3 animate-[progress-indeterminate_1.2s_ease-in-out_infinite] rounded-sm bg-primary" />
      )}
    </div>
  );
}
