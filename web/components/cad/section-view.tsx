"use client";

import * as React from "react";
import type { Plan } from "@gharplan/shared";
import { INK } from "@/lib/cad";
import { LEVELS, sectionModel, roofLevel } from "@/lib/drawings";

const S = 32; // px per metre
const PAD_L = 70;
const PAD_R = 24;
const PAD_T = 24;
const PAD_B = 42;
const WALL = "#3b3b3b";
const SLAB = "#9aa3ad";

export function SectionView({ plan, className }: { plan: Plan; className?: string }) {
  const m = sectionModel(plan);
  const roof = roofLevel(plan);
  const top = roof + LEVELS.PARAPET;
  const bottom = -LEVELS.FOOTING;
  const worldH = top - bottom;
  const W = m.span * S + PAD_L + PAD_R;
  const H = worldH * S + PAD_T + PAD_B;

  const X = (u: number) => PAD_L + u * S;
  const Y = (lvl: number) => PAD_T + (top - lvl) * S;
  const x0 = X(0);
  const x1 = X(m.span);
  const wallPx = 0.23 * S;

  const groundY = Y(LEVELS.GROUND);

  // interior partitions: shared boundaries between adjacent cells on a floor
  const partitions: { u: number; floor: number }[] = [];
  const byFloor = new Map<number, typeof m.cells>();
  for (const c of m.cells) {
    const arr = byFloor.get(c.floor) ?? [];
    arr.push(c);
    byFloor.set(c.floor, arr);
  }
  for (const [floor, cells] of byFloor) {
    cells.sort((a, b) => a.u0 - b.u0);
    for (let i = 1; i < cells.length; i++) {
      const u = (cells[i].u0 + cells[i - 1].u1) / 2;
      partitions.push({ u, floor });
    }
  }

  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-xl border bg-white shadow-soft">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", background: "#fff" }} role="img">
          <defs>
            <pattern id="earth" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke="#9b8d77" strokeWidth="0.6" />
            </pattern>
          </defs>

          {/* foundation footings under the two ends */}
          {[x0, x1].map((cx, i) => (
            <rect key={i} x={cx - wallPx * 1.6} y={Y(-LEVELS.PLINTH)} width={wallPx * 3.2} height={Y(bottom) - Y(-LEVELS.PLINTH)} fill="url(#earth)" stroke={WALL} strokeWidth={1.2} />
          ))}
          {/* earth ground line */}
          <line x1={x0 - 28} y1={groundY} x2={x1 + 18} y2={groundY} stroke={INK} strokeWidth={2.6} />

          {/* plinth (FFL down to ground) */}
          <rect x={x0 - 2} y={Y(LEVELS.FFL)} width={x1 - x0 + 4} height={groundY - Y(LEVELS.FFL)} fill="#e7e0d4" stroke={WALL} strokeWidth={1.2} />

          {/* floor + roof slabs spanning the building */}
          {m.floors.map((f) => {
            const ffl = f * LEVELS.FLOOR_TO_FLOOR;
            return (
              <rect key={`s${f}`} x={x0 - 2} y={Y(ffl)} width={x1 - x0 + 4} height={LEVELS.SLAB_STRUCT * S} fill={SLAB} stroke={WALL} strokeWidth={1} />
            );
          })}
          <rect x={x0 - 2} y={Y(roof)} width={x1 - x0 + 4} height={LEVELS.SLAB_STRUCT * S} fill={SLAB} stroke={WALL} strokeWidth={1.2} />

          {/* perimeter walls full height (poché) */}
          <rect x={x0 - wallPx} y={Y(top)} width={wallPx} height={groundY - Y(top)} fill={WALL} />
          <rect x={x1} y={Y(top)} width={wallPx} height={groundY - Y(top)} fill={WALL} />
          {/* parapet caps */}
          <rect x={x0 - wallPx} y={Y(top)} width={wallPx} height={(top - roof) * S} fill={WALL} />
          <rect x={x1} y={Y(top)} width={wallPx} height={(top - roof) * S} fill={WALL} />

          {/* interior partitions per floor (FFL..ceiling) */}
          {partitions.map((p, i) => {
            const ffl = p.floor * LEVELS.FLOOR_TO_FLOOR;
            return <rect key={i} x={X(p.u) - wallPx / 2} y={Y(ffl + LEVELS.CEIL)} width={wallPx} height={LEVELS.CEIL * S} fill={WALL} opacity={0.92} />;
          })}

          {/* room labels + floor-to-floor dim on the left */}
          {m.cells.map((c, i) => {
            const ffl = c.floor * LEVELS.FLOOR_TO_FLOOR;
            const cx = (X(c.u0) + X(c.u1)) / 2;
            const cy = Y(ffl + LEVELS.CEIL / 2);
            return (
              <text key={i} x={cx} y={cy} textAnchor="middle" fontSize={9} fill="#1f2937" fontFamily="ui-sans-serif, system-ui">
                {c.label}
              </text>
            );
          })}

          {/* sill + lintel level dashes (ground floor reference) */}
          {[
            { lvl: LEVELS.SILL, t: "Sill +0.90" },
            { lvl: LEVELS.LINTEL, t: "Lintel +2.10" },
          ].map((l, i) => (
            <g key={i}>
              <line x1={x0} y1={Y(l.lvl)} x2={x1} y2={Y(l.lvl)} stroke="#64748b" strokeWidth={0.7} strokeDasharray="4 3" />
            </g>
          ))}

          {/* level/dimension chain on the left */}
          {[
            { lvl: LEVELS.FFL, t: "+0.000" },
            ...m.floors.filter((f) => f > 0).map((f) => ({ lvl: f * LEVELS.FLOOR_TO_FLOOR, t: `+${(f * 3).toFixed(3)}` })),
            { lvl: roof, t: `+${roof.toFixed(2)}` },
          ].map((l, i) => {
            const y = Y(l.lvl);
            return (
              <g key={i}>
                <line x1={PAD_L - 12} y1={y} x2={x0} y2={y} stroke={INK} strokeWidth={0.6} opacity={0.55} />
                <path d={`M ${PAD_L - 12} ${y} l -5 -3 l 0 6 z`} fill={INK} />
                <text x={PAD_L - 20} y={y - 2} textAnchor="end" fontSize={8.5} fill={INK} fontFamily="ui-monospace, monospace">
                  {l.t}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
        <span>Section through the staircase · floor-to-floor 3.0 m, clear height 2.75 m, plinth 0.45 m</span>
        <span>1:100 · indicative</span>
      </figcaption>
    </figure>
  );
}
