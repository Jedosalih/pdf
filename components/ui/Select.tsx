"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  id?: string;
  disabled?: boolean;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  label,
  id,
  disabled,
}: SelectProps) {
  const trigger = (
    <SelectPrimitive.Trigger
      id={id}
      disabled={disabled}
      className={cn(
        "flex h-10 w-full items-center justify-between gap-2 rounded-sm border border-border bg-background px-3 text-body text-foreground",
        "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        "disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-60",
        "data-[placeholder]:text-muted-foreground",
      )}
    >
      <SelectPrimitive.Value placeholder={placeholder} />
      <SelectPrimitive.Icon>
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );

  const content = (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border bg-background shadow-md data-[state=open]:animate-[content-in_120ms_ease-out]"
      >
        <SelectPrimitive.Viewport className="p-1">
          {options.map((option) => (
            <SelectPrimitive.Item
              key={option.value}
              value={option.value}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-small text-foreground outline-none",
                "data-[highlighted]:bg-surface",
              )}
            >
              <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              <SelectPrimitive.ItemIndicator>
                <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              </SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>
          ))}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );

  const control = (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      {trigger}
      {content}
    </SelectPrimitive.Root>
  );

  if (!label) return control;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-foreground">
        {label}
      </label>
      {control}
    </div>
  );
}

export function SelectGroupLabel({ children }: { children: ReactNode }) {
  return <p className="px-2.5 py-1.5 text-caption text-muted-foreground">{children}</p>;
}
