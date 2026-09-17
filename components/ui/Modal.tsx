"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  closeLabel: string;
}

/** The one modal system in the app — see docs/DESIGN_RESEARCH.md ("Use one
 * consistent modal system"). Built on Radix Dialog for correct focus
 * trapping, scroll locking, and Escape/outside-click handling. */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  closeLabel,
}: ModalProps) {
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
            // Dead-center positioning is direction-independent, so this
            // intentionally uses physical left/top rather than logical
            // inset-inline-start (which would double up with the
            // translate in RTL instead of mirroring it).
            "fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col",
            "rounded-lg bg-background p-6 shadow-md",
            "data-[state=open]:animate-[content-in_150ms_ease-out]",
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-h3 font-semibold text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-small text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {/* Only the body scrolls once content grows past the modal's own
           * max-height — the title/close button stay fixed in view. This
           * matters in practice now: the tool registry has grown enough
           * that ToolPickerModal's list genuinely overflows a typical
           * viewport, which previously had no way to reach lower items. */}
          {children ? <div className="mt-4 min-h-0 overflow-y-auto">{children}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
