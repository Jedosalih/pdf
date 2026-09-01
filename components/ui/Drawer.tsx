"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: ReactNode;
  closeLabel: string;
  /** Which logical edge the drawer slides from — respects RTL automatically
   * since it's expressed as inline-start/end, not left/right. */
  side?: "start" | "end";
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  closeLabel,
  side = "end",
}: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-overlay",
            "data-[state=open]:animate-[overlay-in_150ms_ease-out]",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 z-50 flex w-[calc(100%-3rem)] max-w-sm flex-col bg-background p-6 shadow-md",
            // The slide direction is physical (translateX), but which edge
            // "end"/"start" resolves to flips in RTL, so the animation pick
            // has to flip with it too — not just the rest position.
            side === "end"
              ? "end-0 ltr:data-[state=open]:animate-[drawer-in-end_200ms_ease-out] rtl:data-[state=open]:animate-[drawer-in-start_200ms_ease-out]"
              : "start-0 ltr:data-[state=open]:animate-[drawer-in-start_200ms_ease-out] rtl:data-[state=open]:animate-[drawer-in-end_200ms_ease-out]",
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <DialogPrimitive.Title className="text-h3 font-semibold text-foreground">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-4 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
