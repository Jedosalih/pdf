"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { DropdownMenu as DropdownPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export const Dropdown = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export function DropdownContent({
  children,
  align = "end",
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-40 rounded-md border border-border bg-background p-1 shadow-md data-[state=open]:animate-[content-in_120ms_ease-out]"
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-2 text-small text-foreground outline-none transition-colors",
        "data-[highlighted]:bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownSeparator = () => (
  <DropdownPrimitive.Separator className="my-1 h-px bg-border" />
);
