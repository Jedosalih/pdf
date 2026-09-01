import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/** The single max-width + horizontal padding wrapper used across the app —
 * avoids every page picking its own arbitrary max-width/padding combination. */
export function PageContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props} />
  );
}
