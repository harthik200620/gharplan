"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:bg-primary-emphasis",
        brand:
          "bg-brand-gradient text-white shadow-glow hover:brightness-[1.07] hover:shadow-[0_10px_36px_-8px_hsl(var(--primary)/0.6)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline: "border border-border bg-card text-foreground shadow-soft hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
        accent: "bg-accent text-accent-foreground shadow-soft hover:bg-accent/90",
        success: "bg-success text-success-foreground shadow-soft hover:bg-success/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-8 rounded-md px-2.5 text-xs",
        sm: "h-9 rounded-md px-3 text-[13px]",
        default: "h-10 px-4 py-2",
        lg: "h-11 rounded-xl px-6 text-[15px]",
        xl: "h-12 rounded-xl px-7 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { buttonVariants };
