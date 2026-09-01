import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type AlertVariant = "success" | "warning" | "error" | "info";

const variantClasses: Record<AlertVariant, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  error: "border-error/30 bg-error/10 text-error",
  info: "border-info/30 bg-info/10 text-info",
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export function Alert({ className, variant = "info", role, ...props }: AlertProps) {
  return (
    <div
      role={role ?? (variant === "error" ? "alert" : "status")}
      className={cn(
        "rounded-md border px-4 py-3 text-small",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
