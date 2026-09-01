"use client";

import type { ComponentPropsWithoutRef } from "react";
import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps
  extends ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  label?: string;
}

export function Checkbox({ className, id, label, ...props }: CheckboxProps) {
  const checkbox = (
    <CheckboxPrimitive.Root
      id={id}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border bg-background transition-colors",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return checkbox;

  return (
    <label className="inline-flex items-center gap-2 text-small text-foreground">
      {checkbox}
      {label}
    </label>
  );
}
