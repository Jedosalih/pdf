"use client";

import type { ComponentPropsWithoutRef } from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export const RadioGroup = RadioGroupPrimitive.Root;

export interface RadioGroupItemProps
  extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  label: string;
  description?: string;
}

export function RadioGroupItem({
  className,
  id,
  label,
  description,
  ...props
}: RadioGroupItemProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2.5 text-small text-foreground"
    >
      <RadioGroupPrimitive.Item
        id={id}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-colors",
          "data-[state=checked]:border-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="h-2.5 w-2.5 rounded-full bg-primary" />
      </RadioGroupPrimitive.Item>
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {description ? (
          <span className="text-caption text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
