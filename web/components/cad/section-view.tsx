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
            <pattern id="concrete" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 0 10 L 10 0 M -2 2 L 2 -2 M 8 12 L 12 8" stroke="#cbd5e1" strokeWidth="1" />
              <circle cx="3" cy="7" r="0.8" fill="#cbd5e1" />
              <circle cx="7" cy="3" r="1.2" fill="#cbd5e1" />
            </pattern>
          </defs>

          {/* foundation footings under the two ends */}
          {[x0, x1].map((cx, i) => (
            <g key={i}>
              <rect x={cx - wallPx * 1.6} y={Y(-LEVELS.PLINTH)} width={wallPx * 3.2} height={Y(bottom) - Y(-LEVELS.PLINTH)} fill="url(#earth)" stroke={WALL} strokeWidth={1.2} />
              <text x={cx} y={Y(bottom) + 12} textAnchor="middle" fontSize={6} fill={INK} fontFamily="var(--font-mono), monospace">1.2M FOUNDATION</text>
              {/* column section marker at ground */}
              <rect x={cx - wallPx / 2} y={groundY - wallPx} width={wallPx} height={wallPx} fill="url(#concrete)" stroke={WALL} strokeWidth={1.5} />
              <line x1={cx - wallPx / 2} y1={groundY - wallPx} x2={cx + wallPx / 2} y2={groundY} stroke={WALL} strokeWidth={0.8} />
              <line x1={cx + wallPx / 2} y1={groundY - wallPx} x2={cx - wallPx / 2} y2={groundY} stroke={WALL} strokeWidth={0.8} />
            </g>
          ))}
          {/* earth ground line */}
          <line x1={x0 - 28} y1={groundY} x2={x1 + 18} y2={groundY} stroke={INK} strokeWidth={2.6} />

          {/* plinth (FFL down to ground) */}
          <rect x={x0 - 2} y={Y(LEVELS.FFL)} width={x1 - x0 + 4} height={groundY - Y(LEVELS.FFL)} fill="#e7e0d4" stroke={WALL} strokeWidth={1.2} />

          {/* floor + roof slabs spanning the building */}
          {m.floors.map((f) => {
            const ffl = f * LEVELS.FLOOR_TO_FLOOR;
            return (
              <g key={`s${f}`}>
                <rect x={x0 - 2} y={Y(ffl)} width={x1 - x0 + 4} height={LEVELS.SLAB_STRUCT * S} fill="url(#concrete)" stroke={WALL} strokeWidth={1.5} />
                <rect x={x0 - 2} y={Y(ffl) - 2} width={x1 - x0 + 4} height={2} fill="#e2e8f0" stroke={WALL} strokeWidth={0.5} /> {/* floor finish */}
              </g>
            );
          })}
          <rect x={x0 - 2} y={Y(roof)} width={x1 - x0 + 4} height={LEVELS.SLAB_STRUCT * S} fill="url(#concrete)" stroke={WALL} strokeWidth={1.5} />

          {/* perimeter walls full height (poché) */}
          <rect x={x0 - wallPx} y={Y(top)} width={wallPx} height={groundY - Y(top)} fill={WALL} />
          <rect x={x1} y={Y(top)} width={wallPx} height={groundY - Y(top)} fill={WALL} />
          {/* parapet caps */}
          <rect x={x0 - wallPx} y={Y(top)} width={wallPx} height={(top - roof) * S} fill={WALL} />
          <rect x={x1} y={Y(top)} width={wallPx} height={(top - roof) * S} fill={WALL} />

          {/* interior partitions per floor (FFL..ceiling) */}
          {m.cells.length > 0 && (() => {
             const c = m.cells[Math.floor(m.cells.length / 2)];
             const sx = X(c.u0) + 10;
             const sy_base = Y(0) - 2;
             const risers = 16;
             const rH = (Y(0) - Y(LEVELS.FLOOR_TO_FLOOR)) / risers;
             const rW = (X(c.u1) - X(c.u0) - 20) / risers;
             if(rW > 0) {
               const pts = [`${sx},${sy_base}`];
               for(let i=1; i<=risers; i++) {
                 pts.push(`${sx + (i-1)*rW},${sy_base - i*rH}`);
                 pts.push(`${sx + i*rW},${sy_base - i*rH}`);
               }
               pts.push(`${sx + risers*rW},${sy_base}`);
               return (
                 <g>
                   <polyline points={pts.join(" ")} fill="#f1f5f9" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
                   <text x={sx + 10} y={sy_base - 8} fontSize={6} fill={INK} transform={`rotate(-30 ${sx + 10} ${sy_base - 8})`}>UP {risers}R</text>
                 </g>
               );
             }
             return null;
          })()}
          
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
              <g key={i}>
                <text x={cx} y={cy - 4} textAnchor="middle" fontSize={9} fontWeight="700" fill="#1f2937" fontFamily="ui-sans-serif, system-ui">
                  {c.label}
                </text>
                <text x={cx} y={cy + 8} textAnchor="middle" fontSize={7} fill="#64748b" fontFamily="var(--font-mono), monospace">
                  CH: 2.75m
                </text>
              </g>
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
