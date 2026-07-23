"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import type { Plan } from "@gharplan/shared";
import {
  buildingFootprint,
  deriveWalls,
  fmtDim,
  placeOpenings,
  wallSegmentRect,
  wallThicknessAt,
  type PlacedOpening,
  type WallSegment,
} from "@/lib/cad";
import { LEVELS, floorsOf } from "@/lib/drawings";
import { buildOpeningSchedule, toMm } from "@/lib/schedules";
import { DimLine } from "@/components/cad/floor-plan-cad";
import { engine } from "@/lib/engine";
import { cn } from "@/lib/utils";

/* ---- Wire types for POST /plan/structural (only the fields this sheet uses) ---- */
interface GridLineT {
  axis: "x" | "y";
  label: string;
  offsetM: number;
}
interface MemberT {
  kind: string;
  floor: number;
  rebar: string;
}
interface StructuralDesignT {
  grid: GridLineT[];
  members: MemberT[];
}

const GENERIC_LINTEL_NOTE =
  "RCC lintel over every opening, min. 150mm bearing each side, min. 2-10mm dia bottom + 2-8mm dia top bars (IS 456:2000 Cl.26.5.1) — final sizing per structural design.";

export function MasonrySettingOutPlan({ plan }: { plan: Plan }) {
  const floors = React.useMemo(() => floorsOf(plan), [plan]);
  const [floor, setFloor] = React.useState(floors[0] ?? 0);

  // Optional structural enrichment (grid overlay + real lintel rebar) — the core
  // sheet (walls + dimensions + opening sizes) never depends on this landing.
  const [structural, setStructural] = React.useState<StructuralDesignT | null>(null);
  React.useEffect(() => {
    const ac = new AbortController();
    setStructural(null);
    engine
      .structural(plan, ac.signal)
      .then((d) => setStructural(d as StructuralDesignT))
      .catch(() => {
        /* best-effort enhancement only — the setting-out plan still renders without it */
      });
    return () => ac.abort();
  }, [plan]);

  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const sy = (y: number) => D - y;
  const fp = React.useMemo(() => buildingFootprint(plan, floor), [plan, floor]);
  const walls = React.useMemo(() => deriveWalls(plan, floor), [plan, floor]);
  const openings = React.useMemo(() => {
    const shownIds = new Set(plan.rooms.filter((r) => (r.floor ?? 0) === floor).map((r) => r.id));
    return placeOpenings(plan).filter((o) => shownIds.has(o.roomId));
  }, [plan, floor]);
  // Best-effort (kind, width-mm) -> mark lookup from the real joinery schedule.
  const markByWidth = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const g of buildOpeningSchedule(plan)) {
      const key = `${g.kind}|${toMm(g.widthM)}`;
      if (!m.has(key)) m.set(key, g.mark);
    }
    return m;
  }, [plan]);

  const margin = 1.6;
  const vbX = fp.x - margin;
  const vbY = sy(fp.y + fp.h) - margin;
  const vbW = fp.w + margin * 2;
  const vbH = fp.h + margin * 2;

  const lintelLevel = floor * LEVELS.FLOOR_TO_FLOOR + LEVELS.LINTEL;
  const lintelMember =
    structural?.members.find((m) => m.kind === "lintel" && m.floor === floor) ??
    structural?.members.find((m) => m.kind === "lintel") ??
    null;
  const gridLines = (structural?.grid ?? []).filter((g) => {
    const at = g.offsetM;
    return g.axis === "x" ? at >= fp.x - 0.2 && at <= fp.x + fp.w + 0.2 : at >= fp.y - 0.2 && at <= fp.y + fp.h + 0.2;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Chip label="Lintel level" value={`+${lintelLevel.toFixed(2)} m`} tone="amber" />
          <Chip label="Exterior wall" value="230mm" tone="slate" />
          <Chip label="Interior wall" value="115mm" tone="slate" />
        </div>
        {floors.length > 1 && (
          <div className="flex gap-1">
            {floors.map((f) => (
              <button
                key={f}
                onClick={() => setFloor(f)}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  f === floor ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300" : "text-muted-foreground",
                )}
              >
                {f === 0 ? "Ground" : f === 1 ? "1st floor" : `${f}th floor`}
              </button>
            ))}
          </div>
        )}
      </div>

      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="h-72 w-full rounded-lg border bg-white">
        {/* optional structural grid, when the design service has responded */}
        {gridLines.map((g, i) =>
          g.axis === "x" ? (
            <line
              key={`g-${i}`}
              x1={g.offsetM} y1={sy(fp.y - 0.6)} x2={g.offsetM} y2={sy(fp.y + fp.h + 0.6)}
              stroke="#94a3b8" strokeWidth={0.02} strokeDasharray="0.15 0.1" vectorEffect="non-scaling-stroke"
            />
          ) : (
            <line
              key={`g-${i}`}
              x1={fp.x - 0.6} y1={sy(g.offsetM)} x2={fp.x + fp.w + 0.6} y2={sy(g.offsetM)}
              stroke="#94a3b8" strokeWidth={0.02} strokeDasharray="0.15 0.1" vectorEffect="non-scaling-stroke"
            />
          ),
        )}

        {/* wall poché — true double-line masonry */}
        {walls.map((seg, i) => {
          const wr = wallSegmentRect(seg);
          return (
            <rect
              key={`w-${i}`}
              x={wr.x} y={sy(wr.y + wr.h)} width={wr.w} height={wr.h}
              fill={seg.kind === "ext" ? "#1f2a44" : "#64748b"}
            />
          );
        })}

        {/* openings — real gap + masonry size + mark, when found */}
        {openings.map((o, i) => (
          <OpeningGap key={`o-${i}`} o={o} sy={sy} walls={walls} mark={markByWidth.get(`${o.kind}|${toMm(o.len)}`)} />
        ))}

        {/* dimension chains — exterior perimeter + overall footprint */}
        <g pointerEvents="none">
          <DimLine x1={fp.x} y1={sy(fp.y) + 0.9} x2={fp.x + fp.w} y2={sy(fp.y) + 0.9} label={fmtDim(fp.w)} />
          <DimLine x1={fp.x - 0.9} y1={sy(fp.y)} x2={fp.x - 0.9} y2={sy(fp.y + fp.h)} label={fmtDim(fp.h)} vertical />
        </g>

        {/* legend */}
        <g transform={`translate(${fp.x}, ${sy(fp.y + fp.h) - 0.5})`} fontSize={0.22} fontFamily="var(--font-mono), monospace">
          <rect x={0} y={0} width={0.3} height={0.15} fill="#1f2a44" />
          <text x={0.4} y={0.14} fill="#334155">Exterior 230mm</text>
          <rect x={2.6} y={0} width={0.3} height={0.15} fill="#64748b" />
          <text x={3.0} y={0.14} fill="#334155">Interior 115mm</text>
        </g>
      </svg>

      <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">Lintel note ({lintelLevel.toFixed(2)} m level)</p>
        <p className="mt-0.5">
          {lintelMember ? lintelMember.rebar : GENERIC_LINTEL_NOTE}
          {!structural && (
            <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground/70">
              <Loader2 className="h-3 w-3 animate-spin" /> checking structural design…
            </span>
          )}
        </p>
        <p className="mt-2 text-[11px]">
          Wall centerlines and thicknesses (230mm external / 115mm internal half-brick) are derived from the room layout
          for masonry setting-out guidance — verify against the structural drawing and site conditions before marking
          the plinth.
        </p>
      </div>
    </div>
  );
}

function Chip({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "amber" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-800 ring-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-500/30",
    amber: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30",
  };
  return (
    <div className={cn("rounded-full px-2.5 py-1 font-semibold shadow-sm ring-1", tones[tone])}>
      <span className="opacity-70">{label}</span> {value}
    </div>
  );
}

function OpeningGap({
  o,
  sy,
  walls,
  mark,
}: {
  o: PlacedOpening;
  sy: (y: number) => number;
  walls: WallSegment[];
  mark?: string;
}) {
  const horiz = o.edge === "N" || o.edge === "S";
  const half = o.len / 2;
  const wt = wallThicknessAt(walls, o.edge, o.cx, o.cy);
  const erase = horiz
    ? { x: o.cx - half, y: o.cy - wt / 2, w: o.len, h: wt }
    : { x: o.cx - wt / 2, y: o.cy - half, w: wt, h: o.len };
  const outward: [number, number] =
    o.edge === "N" ? [0, 1] : o.edge === "S" ? [0, -1] : o.edge === "E" ? [1, 0] : [-1, 0];
  const labelPos: [number, number] = [o.cx + outward[0] * (wt / 2 + 0.35), o.cy + outward[1] * (wt / 2 + 0.35)];
  const widthMm = toMm(o.len);
  const label = mark ? `${mark} · ${widthMm}` : `${widthMm}`;

  return (
    <g>
      <rect x={erase.x} y={sy(erase.y + erase.h)} width={erase.w} height={erase.h} fill="#ffffff" />
      <line
        x1={o.cx - (horiz ? half : 0)} y1={sy(o.cy - (horiz ? 0 : half))}
        x2={o.cx + (horiz ? half : 0)} y2={sy(o.cy + (horiz ? 0 : half))}
        stroke={o.kind === "window" ? "#1d4ed8" : "#0f172a"} strokeWidth={0.02} vectorEffect="non-scaling-stroke"
      />
      <text
        x={labelPos[0]} y={sy(labelPos[1])} textAnchor="middle" dominantBaseline="middle"
        fontSize={0.2} fontFamily="var(--font-mono), monospace" fill="#334155"
      >
        {label}
      </text>
    </g>
  );
}
