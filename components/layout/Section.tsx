import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";
import { PageContainer } from "./PageContainer";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Skip the inner PageContainer when the section manages its own width
   * (e.g. a full-bleed background with a differently-sized inner block). */
  bleed?: boolean;
}

/** Consistent vertical rhythm between homepage/marketing sections — one
 * spacing scale instead of every section picking its own py-*. */
export function Section({ className, bleed, children, ...props }: SectionProps) {
  return (
    <section className={cn("py-14 sm:py-20", className)} {...props}>
      {bleed ? children : <PageContainer>{children}</PageContainer>}
    </section>
  );
}
