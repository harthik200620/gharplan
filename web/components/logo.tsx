import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  markOnly = false,
  className,
}: {
  href?: string;
  markOnly?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.2V19h14v-8.8" />
          <circle cx="12" cy="14" r="1.9" />
        </svg>
      </span>
      {!markOnly && (
        <span className="font-display text-lg font-bold tracking-tight text-foreground">Vastukala AI</span>
      )}
    </Link>
  );
}
