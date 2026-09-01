import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, id, label, error, hint, trailing, disabled, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-small font-medium text-foreground">
            {label}
          </label>
        ) : null}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={cn(hintId, errorId) || undefined}
            className={cn(
              "h-10 w-full rounded-sm border border-border bg-background px-3 text-body text-foreground",
              "placeholder:text-muted-foreground",
              "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              "disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-60",
              error && "border-error focus-visible:border-error focus-visible:ring-error/30",
              trailing && "pe-10",
              className,
            )}
            {...props}
          />
          {trailing ? (
            <div className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground">
              {trailing}
            </div>
          ) : null}
        </div>
        {error ? (
          <p id={errorId} role="alert" className="text-caption text-error">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-caption text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";
