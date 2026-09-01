import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";
import { buttonColorClasses, type ButtonVariant, type ButtonSize } from "./Button";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Required — an icon-only button has no visible text for a11y. */
  label: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = "ghost", size = "md", label, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-md transition-colors",
          "disabled:pointer-events-none disabled:opacity-50",
          buttonColorClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);

IconButton.displayName = "IconButton";
