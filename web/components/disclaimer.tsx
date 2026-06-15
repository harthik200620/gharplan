import { DISCLAIMERS } from "@gharplan/shared";
import { Info } from "lucide-react";

type Kind = keyof typeof DISCLAIMERS;

/** Renders one of the mandated legal-framing strings (vastu | code | export). */
export function Disclaimer({ kind, className = "" }: { kind: Kind; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-xs text-muted-foreground ${className}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{DISCLAIMERS[kind]}</span>
    </p>
  );
}
