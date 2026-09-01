import { Progress } from "@/components/ui/Progress";
import { ProcessingProgress, type ProcessingStep } from "./ProcessingProgress";

interface ProcessingStateProps {
  title: string;
  steps: ProcessingStep[];
}

export function ProcessingState({ title, steps }: ProcessingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-5 rounded-lg border border-border bg-background px-6 py-12 text-center"
    >
      <ProcessingProgress steps={steps} />
      <p className="text-h3 font-semibold text-foreground">{title}</p>
      <Progress className="max-w-xs" label={title} />
    </div>
  );
}
