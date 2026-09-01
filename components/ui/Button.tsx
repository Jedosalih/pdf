import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
}

/** Color/state classes only — shared by Button, IconButton, and any
 * non-<button> element styled to look like one. No sizing here so square
 * icon buttons and text buttons can each apply their own. */
export const buttonColorClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "bg-transparent text-foreground hover:bg-surface",
  destructive: "bg-error text-white hover:bg-error/90",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-small gap-1.5",
  md: "h-10 px-4 text-button gap-2",
  lg: "h-12 px-6 text-button gap-2",
};

/** Shared with any non-<button> element that needs to look like a button
 * (e.g. a real `<a>` download link, so browser "save as"/open-in-new-tab
 * keeps working — see components/tools/merge-pdf/MergePdfTool.tsx). */
export function buttonVariants(
  options: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {},
): string {
  const { variant = "primary", size = "md", className } = options;
  return cn(
    "inline-flex items-center justify-center rounded-md font-semibold transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    buttonColorClasses[variant],
    sizeClasses[size],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      leadingIcon,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={buttonVariants({ variant, size, className })}
        {...props}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          leadingIcon
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
