"use client";

import * as React from "react";
import { Wind, Sun, Umbrella, Snowflake, Leaf, Thermometer, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClimateData {
  zone: string;            // e.g. "Hot & Dry", "Warm & Humid", "Composite"
  zoneCode?: string;       // e.g. "I", "II", "III"
  orientationScore: number; // 0–100
  orientationGrade: string; // "A+", "A", "B", "C"
  prevailingWindDir: string; // "N", "NE", "E", "SW" etc.
  passiveStrategies: string[];
  solarRisk: {
    N: "low" | "medium" | "high";
    S: "low" | "medium" | "high";
    E: "low" | "medium" | "high";
    W: "low" | "medium" | "high";
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ZONE_ICON: Record<string, React.ReactNode> = {
  "Hot & Dry":     <Sun className="h-5 w-5 text-orange-500" />,
  "Warm & Humid":  <Umbrella className="h-5 w-5 text-sky-500" />,
  Composite:       <Thermometer className="h-5 w-5 text-amber-500" />,
  Cold:            <Snowflake className="h-5 w-5 text-blue-400" />,
  Temperate:       <Leaf className="h-5 w-5 text-emerald-500" />,
};

function zoneIcon(zone: string) {
  for (const [k, v] of Object.entries(ZONE_ICON)) {
    if (zone.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return <Thermometer className="h-5 w-5 text-muted-foreground" />;
}

const RISK_COLOR: Record<"low" | "medium" | "high", string> = {
  low:    "bg-emerald-400",
  medium: "bg-amber-400",
  high:   "bg-rose-500",
};

const RISK_LABEL: Record<"low" | "medium" | "high", string> = {
  low:    "Low",
  medium: "Med",
  high:   "High",
};

const GRADE_COLOR: Record<string, string> = {
  "A+": "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300",
  A:    "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300",
  B:    "text-amber-600 bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300",
  C:    "text-rose-600 bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300",
};

/** Mini SVG wind rose — shows an arrow in the given compass direction */
function WindRose({ dir }: { dir: string }) {
  const angles: Record<string, number> = {
    N: 0, NE: 45, E: 90, SE: 135,
    S: 180, SW: 225, W: 270, NW: 315,
  };
  const angle = angles[dir] ?? 0;
  const cx = 40, cy = 40, r = 28;
  const rad = (angle * Math.PI) / 180;
  const tx = cx + r * Math.sin(rad);
  const ty = cy - r * Math.cos(rad);
  return (
    <svg width={80} height={80} viewBox="0 0 80 80" className="shrink-0">
      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={1.5} />
      {/* Cardinal ticks */}
      {[0, 90, 180, 270].map((a) => {
        const ri = (a * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={cx + 22 * Math.sin(ri)} y1={cy - 22 * Math.cos(ri)}
            x2={cx + 28 * Math.sin(ri)} y2={cy - 28 * Math.cos(ri)}
            stroke="hsl(var(--muted-foreground))" strokeWidth={1.5}
          />
        );
      })}
      {/* Cardinal labels */}
      {[
        { label: "N", a: 0 },
        { label: "E", a: 90 },
        { label: "S", a: 180 },
        { label: "W", a: 270 },
      ].map(({ label, a }) => {
        const ri = (a * Math.PI) / 180;
        return (
          <text
            key={label}
            x={cx + 36 * Math.sin(ri)}
            y={cy - 36 * Math.cos(ri) + 4}
            textAnchor="middle"
            fontSize={8}
            fill="hsl(var(--muted-foreground))"
            fontWeight={600}
          >
            {label}
          </text>
        );
      })}
      {/* Wind arrow */}
      <line
        x1={cx} y1={cy}
        x2={tx} y2={ty}
        stroke="hsl(var(--primary))" strokeWidth={2.5} strokeLinecap="round"
      />
      {/* Arrow head */}
      <circle cx={tx} cy={ty} r={3} fill="hsl(var(--primary))" />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2.5} fill="hsl(var(--foreground))" />
    </svg>
  );
}

/** Solar exposure bar for a wall face */
function SolarBar({ face, risk }: { face: string; risk: "low" | "medium" | "high" }) {
  const widths = { low: "w-1/3", medium: "w-2/3", high: "w-full" };
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 shrink-0 text-center text-[11px] font-bold text-muted-foreground">{face}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", RISK_COLOR[risk], widths[risk])} />
      </div>
      <span className={cn("w-8 text-right text-[10px] font-semibold", {
        "text-emerald-600": risk === "low",
        "text-amber-600": risk === "medium",
        "text-rose-600": risk === "high",
      })}>
        {RISK_LABEL[risk]}
      </span>
    </div>
  );
}

// ─── ClimatePanel ─────────────────────────────────────────────────────────────

export function ClimatePanel({ climate }: { climate?: ClimateData }) {
  if (!climate) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
        <Wind className="h-8 w-8 opacity-30" />
        <div className="text-sm">Climate analysis will appear here after generating a scheme.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in-fade">
      {/* Header row */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-1 items-center gap-3 rounded-xl border bg-card p-3 shadow-soft">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted">
            {zoneIcon(climate.zone)}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Climate Zone</div>
            <div className="font-display text-base font-bold text-foreground">{climate.zone}</div>
            {climate.zoneCode && (
              <div className="text-[11px] text-muted-foreground">Zone {climate.zoneCode} (ECBC)</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-soft">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Orientation</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-display text-2xl font-bold text-foreground">
                {climate.orientationScore}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
          </div>
          <span
            className={cn(
              "rounded-lg px-2.5 py-1 text-sm font-bold",
              GRADE_COLOR[climate.orientationGrade] ?? "text-muted-foreground bg-muted",
            )}
          >
            {climate.orientationGrade}
          </span>
        </div>
      </div>

      {/* Wind rose + solar exposure */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Wind rose */}
        <div className="rounded-xl border bg-card p-3 shadow-soft">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Wind className="h-3.5 w-3.5 text-primary" /> Prevailing Wind
          </div>
          <div className="mt-3 flex items-center gap-4">
            <WindRose dir={climate.prevailingWindDir} />
            <div>
              <div className="font-display text-2xl font-bold text-foreground">
                {climate.prevailingWindDir}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Prevailing wind direction
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-primary">
                <ArrowUp className="h-3 w-3" style={{ rotate: `${["N","NE","E","SE","S","SW","W","NW"].indexOf(climate.prevailingWindDir) * 45}deg` }} />
                Align openings to capture
              </div>
            </div>
          </div>
        </div>

        {/* Solar exposure risk */}
        <div className="rounded-xl border bg-card p-3 shadow-soft">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Sun className="h-3.5 w-3.5 text-amber-500" /> Solar Exposure Risk per Wall
          </div>
          <div className="mt-3 space-y-2">
            {(["N", "E", "S", "W"] as const).map((face) => (
              <SolarBar key={face} face={face} risk={climate.solarRisk[face]} />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" />Low heat gain</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Medium</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />High — shade required</span>
          </div>
        </div>
      </div>

      {/* Passive strategies */}
      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Leaf className="h-3.5 w-3.5 text-emerald-600" /> Passive Design Strategies Applied
        </div>
        {climate.passiveStrategies.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No passive strategies identified.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {climate.passiveStrategies.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
