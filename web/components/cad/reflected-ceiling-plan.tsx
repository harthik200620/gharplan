"use client";

import * as React from "react";
import type { FinishTier, Plan } from "@gharplan/shared";
import { bounds, structuralRooms } from "@/lib/cad";
import { LEVELS, floorsOf } from "@/lib/drawings";
import { buildMepModel, type ElecPoint } from "@/lib/mep";
import { ceilingTreatmentFor, type CeilingTreatment } from "@/lib/schedules";
import { cn } from "@/lib/utils";

const TREATMENT_FILL: Record<CeilingTreatment["kind"], string> = {
  gypsum: "#FEF3C7",
  grid: "#DBEAFE",
  none: "#F1F5F9",
};
const TREATMENT_INK: Record<CeilingTreatment["kind"], string> = {
  gypsum: "#92400E",
  grid: "#1E3A8A",
  none: "#64748B",
};
const COVE_THRESHOLD_SQM = 12;

export function ReflectedCeilingPlan({ plan, finishTier = "standard" }: { plan: Plan; finishTier?: FinishTier }) {
  const floors = React.useMemo(() => floorsOf(plan), [plan]);
  const [floor, setFloor] = React.useState(floors[0] ?? 0);

  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const sy = (y: number) => D - y; // flip: North is up
  const mx = (x: number) => W - x; // mirror: reflected-ceiling convention

  const rooms = React.useMemo(
    () => structuralRooms(plan, floor).filter((r) => bounds(r.polygon).w >= 0.6 && bounds(r.polygon).h >= 0.6),
    [plan, floor],
  );
  const model = React.useMemo(() => buildMepModel(plan, floor), [plan, floor]);
  const points = React.useMemo(
    () => model.elec.filter((p): p is ElecPoint => p.kind === "light" || p.kind === "fan"),
    [model],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Chip color={TREATMENT_FILL.gypsum} ink={TREATMENT_INK.gypsum} label="Gypsum false ceiling" />
          <Chip color={TREATMENT_FILL.grid} ink={TREATMENT_INK.grid} label="Grid / PVC ceiling" />
          <Chip color={TREATMENT_FILL.none} ink={TREATMENT_INK.none} label="Exposed painted slab" />
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

      <svg viewBox={`-0.8 -0.8 ${W + 1.6} ${D + 1.6}`} className="h-72 w-full rounded-lg border bg-white">
        <rect x={0} y={0} width={W} height={D} fill="none" stroke="#cbd5e1" strokeWidth={0.02} strokeDasharray="0.1 0.08" />
        {rooms.map((room) => {
          const r = bounds(room.polygon);
          const t = ceilingTreatmentFor(room.type, finishTier);
          const rx = mx(r.x + r.w);
          const areaSqm = r.w * r.h;
          const showCove = t.kind === "gypsum" && areaSqm >= COVE_THRESHOLD_SQM;
          const inset = 0.3;
          return (
            <g key={room.id}>
              <rect x={rx} y={sy(r.y + r.h)} width={r.w} height={r.h} fill={TREATMENT_FILL[t.kind]} stroke="#94a3b8" strokeWidth={0.015} />
              {showCove && (
                <rect
                  x={rx + inset} y={sy(r.y + r.h) + inset} width={Math.max(r.w - inset * 2, 0.1)} height={Math.max(r.h - inset * 2, 0.1)}
                  fill="none" stroke={TREATMENT_INK.gypsum} strokeWidth={0.02} strokeDasharray="0.08 0.06"
                />
              )}
              {/* skip the label entirely (rather than let it overflow into the next
                  room) when the room is too narrow to hold it — the fill colour +
                  legend still convey the treatment, matching FloorPlanCad's own
                  small-room threshold for room labels. */}
              {r.w >= 1.8 && r.h >= 1.4 && (
                <>
                  <text x={rx + r.w / 2} y={sy(r.y + r.h / 2) - 0.12} textAnchor="middle" fontSize={0.16} fontWeight={700} fill={TREATMENT_INK[t.kind]}>
                    {t.label}
                  </text>
                  <text x={rx + r.w / 2} y={sy(r.y + r.h / 2) + 0.14} textAnchor="middle" fontSize={0.14} fill={TREATMENT_INK[t.kind]} opacity={0.8}>
                    {t.kind === "none" ? `FFL +${(floor * LEVELS.FLOOR_TO_FLOOR + room.ceilingHeightM).toFixed(2)} slab soffit` : `Drop ${t.dropMm}mm`}
                  </text>
                </>
              )}
            </g>
          );
        })}
        {points.map((p) => (
          <g key={p.id}>
            <circle cx={mx(p.x)} cy={sy(p.y)} r={0.09} fill={p.kind === "light" ? "#fbbf24" : "#38bdf8"} stroke="#1f2937" strokeWidth={0.012} />
            <text x={mx(p.x)} y={sy(p.y) + 0.045} textAnchor="middle" fontSize={0.1} fontWeight={700} fill="#1f2937">
              {p.kind === "light" ? "L" : "F"}
            </text>
          </g>
        ))}
      </svg>

      <div className="rounded-lg border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Reflected view</span> — mirrored left-right as if looking up via
          a mirror on the floor (standard RCP convention); compare against the floor plan for room orientation.
        </p>
        <p className="mt-2 text-[11px]">
          Indicative ceiling design for coordination only — false-ceiling drops, cove-lighting extents and fixture
          layout are typical assumptions, NOT an engineered interior design. Confirm drop heights against actual beam
          depths, duct/AC routing and site services before execution.
        </p>
      </div>
    </div>
  );
}

function Chip({ color, ink, label }: { color: string; ink: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium" style={{ backgroundColor: color, color: ink }}>
      {label}
    </div>
  );
}
