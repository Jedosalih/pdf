import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm bg-secondary px-2 py-0.5 text-caption font-medium text-secondary-foreground",
        className,
      )}
      {...props}
    />
  );
}
