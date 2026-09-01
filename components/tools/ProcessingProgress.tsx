import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ProcessingStep {
  label: string;
  state: "done" | "active" | "pending";
}

interface ProcessingProgressProps {
  steps: ProcessingStep[];
}

/** A truthful step indicator — every step shown here reflects a real,
 * observed state transition, never a fabricated percentage (blueprint
 * §18: "Do not fake percentages"). */
export function ProcessingProgress({ steps }: ProcessingProgressProps) {
  return (
    <ol className="flex items-center justify-center gap-2">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-caption font-semibold",
                step.state === "done" && "bg-success text-white",
                step.state === "active" && "bg-primary text-white",
                step.state === "pending" && "bg-border text-muted-foreground",
              )}
            >
              {step.state === "done" ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                "text-small font-medium",
                step.state === "pending" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 ? (
            <span aria-hidden="true" className="h-px w-6 bg-border sm:w-10" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
