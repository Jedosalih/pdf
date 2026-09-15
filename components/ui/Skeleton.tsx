import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

/** A loading placeholder — never used to fake real content, only to hold
 * layout space while a real fetch is in flight. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface", className)}
      {...props}
    />
  );
}
