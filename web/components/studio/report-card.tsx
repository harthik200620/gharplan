"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Printer,
  XCircle,
} from "lucide-react";
import type { CodeCheck, CodeReport, Status } from "@gharplan/shared";
import { STATE_LABELS } from "@gharplan/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Plot-level rules render first, in bylaw-reading order; per-room rules follow,
// grouped by ruleId with an expandable count row.
const PLOT_RULE_ORDER = [
  "ground_coverage",
  "far",
  "setbacks",
  "parking",
  "height_vs_road",
  "rwh_mandate",
  "instant_approval",
];

const STATUS_STYLE: Record<Status, { label: string; pill: string; icon: React.ReactNode }> = {
  pass: {
    label: "Pass",
    pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  warn: {
    label: "Warn",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  fail: {
    label: "Fail",
    pill: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300",
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
};

function worst(statuses: Status[]): Status {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

function StatusPill({ status, className }: { status: Status; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        s.pill,
        className,
      )}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: CodeCheck["confidence"] }) {
  if (!confidence) return null;
  return confidence === "verified" ? (
    <span
      title="Citation verified against the authoritative source"
      className="shrink-0 rounded border border-emerald-300/60 bg-emerald-50 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
    >
      verified
    </span>
  ) : (
    <span
      title="Rule cited from research notes — verify against the authoritative source before submission"
      className="shrink-0 rounded border border-amber-300/60 bg-amber-50 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
    >
      verify
    </span>
  );
}

function SourceCell({ check }: { check: CodeCheck }) {
  if (!check.citation) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <span title={check.citation} className="max-w-[200px] truncate text-[11px] text-muted-foreground">
        {check.citation}
      </span>
      <ConfidenceBadge confidence={check.confidence} />
    </span>
  );
}

const CELL = "py-2 pr-3 align-top";

/** One plot-level (or expanded room-level) rule row. */
function CheckRow({ check, indent }: { check: CodeCheck; indent?: boolean }) {
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className={cn(CELL, indent && "pl-7")}>
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {indent ? check.roomLabel ?? check.label : check.label}
          <span title={check.message} className="cursor-help text-muted-foreground/70">
            <Info className="h-3.5 w-3.5" />
          </span>
        </span>
        {!indent && <p className="mt-0.5 max-w-md text-[11px] leading-4 text-muted-foreground">{check.message}</p>}
      </td>
      <td className={cn(CELL, "whitespace-nowrap font-mono text-xs text-muted-foreground")}>
        {check.required ?? "—"}
      </td>
      <td className={cn(CELL, "whitespace-nowrap font-mono text-xs text-foreground")}>
        {check.actual ?? "—"}
      </td>
      <td className={CELL}>
        <StatusPill status={check.status} />
      </td>
      <td className="py-2 align-top">
        <SourceCell check={check} />
      </td>
    </tr>
  );
}

/** Per-room rule group: a count summary row that expands to the individual room rows. */
function RoomGroupRows({ ruleId, checks }: { ruleId: string; checks: CodeCheck[] }) {
  const [open, setOpen] = React.useState(false);
  const status = worst(checks.map((c) => c.status));
  const pass = checks.filter((c) => c.status === "pass").length;
  const warnN = checks.filter((c) => c.status === "warn").length;
  const failN = checks.filter((c) => c.status === "fail").length;
  const first = checks[0];
  return (
    <>
      <tr
        className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
        onClick={() => setOpen((o) => !o)}
        title={open ? "Collapse room rows" : "Expand room rows"}
      >
        <td className={CELL}>
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
            {first.label}
            <span className="rounded bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
              {checks.length} room{checks.length === 1 ? "" : "s"}
            </span>
          </span>
        </td>
        <td className={cn(CELL, "whitespace-nowrap font-mono text-xs text-muted-foreground")}>
          {first.required ?? "—"}
        </td>
        <td className={cn(CELL, "whitespace-nowrap text-xs text-muted-foreground")}>
          {pass}✓{warnN > 0 ? ` ${warnN}!` : ""}{failN > 0 ? ` ${failN}✗` : ""}
        </td>
        <td className={CELL}>
          <StatusPill status={status} />
        </td>
        <td className="py-2 align-top">
          <SourceCell check={first} />
        </td>
      </tr>
      {open &&
        checks.map((c, i) => <CheckRow key={`${ruleId}-${c.roomId ?? i}`} check={c} indent />)}
    </>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <tr className="border-b border-border/60 bg-muted/30">
      <td colSpan={5} className="py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </td>
    </tr>
  );
}

/**
 * Compliance report card — the `code` tab's authoritative rule-by-rule table
 * (Rule | Required | Achieved | Status | Source) with jurisdiction provenance,
 * confidence badges, and a clean print path.
 */
export function ReportCard({
  code,
  jurisdictionLabel,
}: {
  code: CodeReport;
  jurisdictionLabel?: string;
}) {
  const stateLabel = (STATE_LABELS as Record<string, string>)[code.state] ?? code.state;
  const hasPack = code.checks.some((c) => !!c.citation);

  const plotChecks = React.useMemo(() => {
    const plot = code.checks.filter((c) => !c.roomId && !c.roomLabel);
    const rank = (c: CodeCheck) => {
      const i = PLOT_RULE_ORDER.indexOf(c.ruleId);
      return i === -1 ? PLOT_RULE_ORDER.length : i;
    };
    return [...plot].sort((a, b) => rank(a) - rank(b));
  }, [code.checks]);

  const roomGroups = React.useMemo(() => {
    const groups = new Map<string, CodeCheck[]>();
    for (const c of code.checks) {
      if (!c.roomId && !c.roomLabel) continue;
      const list = groups.get(c.ruleId) ?? [];
      list.push(c);
      groups.set(c.ruleId, list);
    }
    return [...groups.entries()];
  }, [code.checks]);

  return (
    <div className="report-card-print rounded-xl border bg-card shadow-soft print:rounded-none print:border-0 print:shadow-none">
      {/* Print isolation: only the report card is visible on paper. */}
      <style>{`@media print {
        body * { visibility: hidden; }
        .report-card-print, .report-card-print * { visibility: visible; }
        .report-card-print { position: absolute; left: 0; top: 0; width: 100%; }
      }`}</style>

      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="font-display text-sm font-bold tracking-tight">Compliance report card</h3>
        <StatusPill status={code.status} />
        <span className="text-xs text-muted-foreground">
          {code.summary.passCount} pass · {code.summary.warnCount} warn · {code.summary.failCount} fail
        </span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Rules: {stateLabel} {hasPack ? "jurisdiction pack" : "state baseline"}
        </span>
        {jurisdictionLabel && (
          <span className="rounded-md border border-primary/25 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
            {jurisdictionLabel}
          </span>
        )}
        <span className="flex-1" />
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      {/* ── Rule table ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto px-4">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              <th className="py-2 pr-3 font-semibold">Rule</th>
              <th className="py-2 pr-3 font-semibold">Required</th>
              <th className="py-2 pr-3 font-semibold">Achieved</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            <SectionRow label="Plot-level rules" />
            {plotChecks.map((c, i) => (
              <CheckRow key={`${c.ruleId}-${i}`} check={c} />
            ))}
            {roomGroups.length > 0 && <SectionRow label="Room-by-room rules" />}
            {roomGroups.map(([ruleId, checks]) => (
              <RoomGroupRows key={ruleId} ruleId={ruleId} checks={checks} />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">{code.disclaimer}</p>
    </div>
  );
}
