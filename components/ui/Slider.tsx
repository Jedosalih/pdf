"use client";

import { Slider as SliderPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  valueLabel?: string;
  disabled?: boolean;
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueLabel,
  disabled,
}: SliderProps) {
  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <div className="flex items-center justify-between text-small font-medium text-foreground">
          <span>{label}</span>
          {valueLabel ? <span className="text-muted-foreground">{valueLabel}</span> : null}
        </div>
      ) : null}
      <SliderPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={cn(
          "relative flex h-5 w-full touch-none items-center",
          disabled && "opacity-50",
        )}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-border">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cn(
            "block h-4 w-4 rounded-full border-2 border-primary bg-background shadow-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          )}
        />
      </SliderPrimitive.Root>
    </div>
  );
}
