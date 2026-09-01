"use client";

import type { ComponentPropsWithoutRef } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export interface SwitchProps
  extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string;
}

export function Switch({ className, id, label, ...props }: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root
      id={id}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full bg-border transition-colors",
        "data-[state=checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-5 w-5 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform",
          "rtl:data-[state=checked]:-translate-x-[1.375rem] ltr:data-[state=checked]:translate-x-[1.375rem]",
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return control;

  return (
    <label className="inline-flex items-center gap-2 text-small text-foreground">
      {control}
      {label}
    </label>
  );
}
