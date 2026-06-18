"use client";

import * as React from "react";
import { Columns, Grid3X3, HardHat, Layers, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StructuralData {
  foundationType: string;          // e.g. "Isolated Footing", "Raft Foundation"
  foundationReason: string;        // e.g. "Suitable for moderate SBC of 15 t/m²"
  columnGridX: number;             // column spacing in meters (X direction)
  columnGridY: number;             // column spacing in meters (Y direction)
  columnCount: number;             // total columns
  plotWidthM: number;
  plotDepthM: number;
  structuralNote: string;          // narrative text
  members: {
    type: string;                  // "Beam", "Slab", "Column"
    size: string;                  // e.g. "230×450 mm"
    note?: string;
  }[];
}

// ─── Foundation icons ─────────────────────────────────────────────────────────

const FOUNDATION_EMOJI: Record<string, string> = {
  "Isolated Footing":    "🧱",
  "Raft Foundation":     "🪨",
  "Strip Foundation":    "📏",
  "Pile Foundation":     "🔩",
  "Combined Footing":    "⬛",
};

function foundationEmoji(type: string) {
  for (const [k, v] of Object.entries(FOUNDATION_EMOJI)) {
    if (type.toLowerCase().includes(k.split(" ")[0].toLowerCase())) return v;
  }
  return "🏗️";
}

// ─── Column Grid SVG ─────────────────────────────────────────────────────────

function ColumnGridSvg({
  plotWidthM,
  plotDepthM,
  gridX,
  gridY,
}: {
  plotWidthM: number;
  plotDepthM: number;
  gridX: number;
  gridY: number;
}) {
  const PAD = 20;
  const W = 220;
  const H = 160;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const colsX = Math.max(2, Math.round(plotWidthM / gridX) + 1);
  const colsY = Math.max(2, Math.round(plotDepthM / gridY) + 1);

  const stepsX = Array.from({ length: colsX }, (_, i) => PAD + (i / (colsX - 1)) * innerW);
  const stepsY = Array.from({ length: colsY }, (_, j) => PAD + (j / (colsY - 1)) * innerH);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="w-full max-w-[280px] rounded-lg border bg-muted/20"
    >
      {/* Plot outline */}
      <rect
        x={PAD} y={PAD}
        width={innerW} height={innerH}
        fill="hsl(var(--primary)/0.04)"
        stroke="hsl(var(--primary)/0.4)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      {/* Grid lines */}
      {stepsX.map((x, i) => (
        <line key={`gx-${i}`} x1={x} y1={PAD} x2={x} y2={PAD + innerH}
          stroke="hsl(var(--primary)/0.12)" strokeWidth={1} />
      ))}
      {stepsY.map((y, j) => (
        <line key={`gy-${j}`} x1={PAD} y1={y} x2={PAD + innerW} y2={y}
          stroke="hsl(var(--primary)/0.12)" strokeWidth={1} />
      ))}
      {/* Column dots */}
      {stepsX.map((x, i) =>
        stepsY.map((y, j) => (
          <circle
            key={`col-${i}-${j}`}
            cx={x} cy={y} r={4.5}
            fill="hsl(var(--primary))"
            opacity={0.9}
          />
        )),
      )}
      {/* Dimension annotations */}
      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="hsl(var(--muted-foreground))">
        {plotWidthM.toFixed(1)} m
      </text>
      <text
        x={4} y={H / 2}
        textAnchor="middle"
        fontSize={9}
        fill="hsl(var(--muted-foreground))"
        transform={`rotate(-90, 4, ${H / 2})`}
      >
        {plotDepthM.toFixed(1)} m
      </text>
    </svg>
  );
}

// ─── StructurePanel ───────────────────────────────────────────────────────────

export function StructurePanel({ structure }: { structure?: StructuralData }) {
  if (!structure) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
        <Grid3X3 className="h-8 w-8 opacity-30" />
        <div className="text-sm">Structural analysis will appear here after generating a scheme.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in-fade">
      {/* Foundation recommendation */}
      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none">{foundationEmoji(structure.foundationType)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <HardHat className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Recommended Foundation
              </span>
            </div>
            <div className="mt-0.5 font-display text-lg font-bold text-foreground">
              {structure.foundationType}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{structure.foundationReason}</p>
          </div>
        </div>
      </div>

      {/* Column grid */}
      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Columns className="h-3.5 w-3.5 text-primary" /> Column Grid Recommendation
        </div>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          <ColumnGridSvg
            plotWidthM={structure.plotWidthM}
            plotDepthM={structure.plotDepthM}
            gridX={structure.columnGridX}
            gridY={structure.columnGridY}
          />
          <div className="space-y-2">
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Grid spacing</div>
              <div className="mt-0.5 font-mono text-sm font-bold text-foreground">
                {structure.columnGridX} m × {structure.columnGridY} m
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total columns</div>
              <div className="mt-0.5 font-display text-lg font-bold text-primary">
                {structure.columnCount}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Dots = column positions. Consult a licensed structural engineer before construction.
            </p>
          </div>
        </div>
      </div>

      {/* Structural note */}
      <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300">{structure.structuralNote}</p>
        </div>
      </div>

      {/* Member size table */}
      {structure.members.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden shadow-soft">
          <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Beam / Slab / Column Sizes</span>
          </div>
          <div className="divide-y">
            {structure.members.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <span className="text-sm font-medium">{m.type}</span>
                  {m.note && (
                    <p className="text-[11px] text-muted-foreground">{m.note}</p>
                  )}
                </div>
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                  {m.size}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
