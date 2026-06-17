"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  full,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  full?: boolean;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-muted p-1", full && "flex w-full", className)}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150",
              full && "flex-1",
              active
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
