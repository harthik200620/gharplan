import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        brand: "border-transparent bg-primary/12 text-primary ring-1 ring-inset ring-primary/25",
        accent:
          "border-transparent bg-accent/15 text-amber-700 ring-1 ring-inset ring-accent/30 dark:text-amber-300",
        // status — legible in both themes via the tailwind palette
        pass: "border-transparent bg-emerald-500/12 text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300",
        success:
          "border-transparent bg-emerald-500/12 text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300",
        warn: "border-transparent bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25 dark:text-amber-300",
        warning:
          "border-transparent bg-amber-500/15 text-amber-700 ring-1 ring-inset ring-amber-500/25 dark:text-amber-300",
        fail: "border-transparent bg-rose-500/12 text-rose-700 ring-1 ring-inset ring-rose-500/25 dark:text-rose-300",
        destructive:
          "border-transparent bg-rose-500/12 text-rose-700 ring-1 ring-inset ring-rose-500/25 dark:text-rose-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
