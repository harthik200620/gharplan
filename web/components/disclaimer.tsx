import { DISCLAIMERS } from "@gharplan/shared";
import { Info } from "lucide-react";

type Kind = keyof typeof DISCLAIMERS;

/** Renders one of the mandated legal-framing strings (vastu | code | export). */
export function Disclaimer({ kind, className = "" }: { kind: Kind; className?: string }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground ${className}`}
    >
      <Info className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
      <span>{DISCLAIMERS[kind]}</span>
    </p>
  );
}
