"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 9,
  suffix,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-lg border bg-card shadow-soft", className)}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="grid h-10 w-10 place-items-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="min-w-[3.25rem] text-center text-sm font-semibold tabular-nums">
        {value}
        {suffix}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="grid h-10 w-10 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
