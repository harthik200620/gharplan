"use client";

import * as React from "react";
import type { Plan } from "@gharplan/shared";
import type { Edge } from "@/lib/cad";
import { INK } from "@/lib/cad";
import {
  LEVELS,
  FACE_LABEL,
  buildingFootprint,
  elevationOpenings,
  floorsOf,
  frontFace,
  roofLevel,
} from "@/lib/drawings";

const S = 30; // px per metre (≈ 1:33 on screen)
const PAD_L = 64;
const PAD_R = 22;
const PAD_T = 26;
const PAD_B = 40;
const WALL_FILL = "#F4EFE7"; // warm plaster
const GLASS = "#cfe4f3";

/** Clockwise face order starting from the front (N→E→S→W). */
function faceOrder(front: Edge): Edge[] {
  const cw: Edge[] = ["N", "E", "S", "W"];
  const i = cw.indexOf(front);
  return [cw[i], cw[(i + 1) % 4], cw[(i + 2) % 4], cw[(i + 3) % 4]];
}

const FACE_ROLE: Record<number, string> = { 0: "Front", 1: "Right", 2: "Rear", 3: "Left" };

export function ElevationView({ plan, className }: { plan: Plan; className?: string }) {
  const front = frontFace(plan);
  const faces = faceOrder(front);
  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2">
        {faces.map((face, i) => (
          <figure key={face} className="overflow-hidden rounded-xl border bg-white shadow-soft">
            <Elevation plan={plan} face={face} />
            <figcaption className="flex items-center justify-between border-t bg-muted/30 px-3 py-1.5 text-[11px]">
              <span className="font-semibold text-foreground">
                {FACE_ROLE[i]} elevation · {FACE_LABEL[face]}
              </span>
              <span className="text-muted-foreground">1:100 · indicative</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-2 px-1 text-[11px] text-muted-foreground">
        Elevations projected from the plan at standard Indian levels — sill 0.9 m, lintel 2.1 m,
        floor-to-floor 3.0 m, parapet 1.0 m. Heights are indicative, not a stamped drawing.
      </p>
    </div>
  );
}

function Elevation({ plan, face }: { plan: Plan; face: Edge }) {
  const fp = buildingFootprint(plan);
  const horiz = face === "N" || face === "S";
  const span = horiz ? fp.w : fp.h;
  const nFloors = floorsOf(plan).length;
  const roof = roofLevel(plan);
  const top = roof + LEVELS.PARAPET;
  const worldH = top - LEVELS.GROUND;

  const W = span * S + PAD_L + PAD_R;
  const H = worldH * S + PAD_T + PAD_B;

  const X = (u: number) => PAD_L + u * S;
  const Y = (lvl: number) => PAD_T + (top - lvl) * S;

  const front = frontFace(plan);
  const ops = elevationOpenings(plan, face, front).filter((o) => o.u >= -0.2 && o.u <= span + 0.2);

  const groundY = Y(LEVELS.GROUND);
  const fflY = Y(LEVELS.FFL);
  const x0 = X(0);
  const x1 = X(span);

  // floor lines + level markers
  const levels: { lvl: number; label: string }[] = [{ lvl: 0, label: "FFL +0" }];
  for (let f = 1; f < nFloors; f++) levels.push({ lvl: f * LEVELS.FLOOR_TO_FLOOR, label: `FFL +${f * 3000}` });
  levels.push({ lvl: roof, label: `ROOF +${Math.round(roof * 1000)}` });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", background: "#fff" }} role="img">
      <defs>
        <pattern id="elev-earth" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#a8a29e" strokeWidth="1" />
        </pattern>
        <pattern id="elev-brick" width="16" height="8" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="16" height="8" fill="none" />
          <line x1="0" y1="4" x2="16" y2="4" stroke="#d6d3d1" strokeWidth="0.5" />
          <line x1="8" y1="0" x2="8" y2="4" stroke="#d6d3d1" strokeWidth="0.5" />
          <line x1="0" y1="4" x2="0" y2="8" stroke="#d6d3d1" strokeWidth="0.5" />
        </pattern>
        <pattern id="elev-concrete" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.5" fill="#a8a29e" />
          <circle cx="8" cy="6" r="0.8" fill="#a8a29e" />
          <circle cx="4" cy="10" r="0.4" fill="#a8a29e" />
        </pattern>
      </defs>
      {/* sky tint */}
      <rect x={0} y={0} width={W} height={groundY} fill="#fbfdff" />
      {/* building mass (plinth slightly wider) */}
      <rect x={x0 - 3} y={fflY} width={x1 - x0 + 6} height={groundY - fflY} fill="#ece5da" stroke={INK} strokeWidth={1.4} />
      <rect x={x0} y={Y(top)} width={x1 - x0} height={fflY - Y(top)} fill={WALL_FILL} />
      <rect x={x0} y={Y(top)} width={x1 - x0} height={fflY - Y(top)} fill="url(#elev-brick)" opacity={0.6} />
      <rect x={x0} y={Y(top)} width={x1 - x0} height={fflY - Y(top)} fill="none" stroke={INK} strokeWidth={2.2} />
      {/* water tank */}
      <rect x={x1 - Math.min(x1-x0, 2 * S)} y={Y(top + 1.2)} width={1.5 * S} height={1.2 * S} fill="#e2e8f0" stroke={INK} strokeWidth={1.5} />
      <line x1={x1 - Math.min(x1-x0, 2.1 * S)} y1={Y(top + 1.2)} x2={x1 - Math.min(x1-x0, 0.4 * S)} y2={Y(top + 1.2)} stroke={INK} strokeWidth={2} />
      <text x={x1 - Math.min(x1-x0, 1.25 * S)} y={Y(top + 0.5)} fontSize={6} textAnchor="middle" fill={INK} fontFamily="var(--font-mono), monospace">WATER TANK</text>
      
      {/* human figure (1.8m tall) */}
      <g transform={`translate(${x0 + Math.min(x1-x0, 1.5 * S)}, ${groundY - 1.8 * S})`} stroke={INK} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Head */}
        <circle cx="0" cy="3" r="3" fill={INK} />
        {/* Body */}
        <line x1="0" y1="6" x2="0" y2="25" />
        {/* Arms */}
        <line x1="0" y1="10" x2="-6" y2="20" />
        <line x1="0" y1="10" x2="6" y2="20" />
        {/* Legs */}
        <line x1="0" y1="25" x2="-5" y2="54" />
        <line x1="0" y1="25" x2="5" y2="54" />
      </g>
      
      {/* parapet coping */}
      <line x1={x0 - 2} y1={Y(top)} x2={x1 + 2} y2={Y(top)} stroke={INK} strokeWidth={2.6} />
      {/* roof slab line */}
      <line x1={x0} y1={Y(roof)} x2={x1} y2={Y(roof)} stroke={INK} strokeWidth={1.6} />
      {/* floor lines */}
      {Array.from({ length: nFloors - 1 }).map((_, f) => (
        <line key={f} x1={x0} y1={Y((f + 1) * LEVELS.FLOOR_TO_FLOOR)} x2={x1} y2={Y((f + 1) * LEVELS.FLOOR_TO_FLOOR)} stroke={INK} strokeWidth={1} strokeDasharray="1 3" opacity={0.5} />
      ))}

      {/* openings */}
      {ops.map((o, i) => {
        const off = o.floor * LEVELS.FLOOR_TO_FLOOR;
        const ax = X(o.u - o.len / 2);
        const bx = X(o.u + o.len / 2);
        const tY = Y(o.lintel + off);
        const bY = Y(o.sill + off);
        const isDoor = o.kind === "door";
        return (
          <g key={i}>
            {isDoor ? (
              <>
                <rect x={ax} y={tY} width={bx - ax} height={bY - tY} fill="#b98a52" stroke={INK} strokeWidth={1.4} />
                <line x1={(ax + bx) / 2} y1={tY} x2={(ax + bx) / 2} y2={bY} stroke={INK} strokeWidth={0.9} />
              </>
            ) : (
              <>
                <rect x={ax} y={tY} width={bx - ax} height={bY - tY} fill="#cfe4f3" fillOpacity={0.4} stroke={INK} strokeWidth={1.6} />
                {/* inner frame */}
                <rect x={ax + 2} y={tY + 2} width={bx - ax - 4} height={bY - tY - 4} fill="none" stroke={INK} strokeWidth={0.8} />
                <line x1={(ax + bx) / 2} y1={tY} x2={(ax + bx) / 2} y2={bY} stroke={INK} strokeWidth={1.2} />
                <line x1={ax} y1={(tY + bY) / 2} x2={bx} y2={(tY + bY) / 2} stroke={INK} strokeWidth={1.2} />
                {/* sill line */}
                <line x1={ax - 4} y1={bY} x2={bx + 4} y2={bY} stroke={INK} strokeWidth={2.4} />
              </>
            )}
            {/* chajja / sun-shade over the head */}
            <line x1={ax - 6} y1={tY} x2={bx + 6} y2={tY} stroke={INK} strokeWidth={2} />
          </g>
        );
      })}

      {/* ground line + earth fill */}
      <rect x={0} y={groundY} width={W} height={H - groundY} fill="url(#elev-earth)" opacity={0.3} />
      <line x1={0} y1={groundY} x2={W} y2={groundY} stroke={INK} strokeWidth={3} />

      {/* level dimension markers on the left */}
      {levels.map((l, i) => {
        const y = Y(l.lvl);
        return (
          <g key={i}>
            <line x1={PAD_L - 10} y1={y} x2={x0} y2={y} stroke={INK} strokeWidth={0.6} opacity={0.6} />
            <path d={`M ${PAD_L - 10} ${y} l -5 -3 l 0 6 z`} fill={INK} />
            <text x={PAD_L - 18} y={y - 2} textAnchor="end" fontSize={8.5} fill={INK} fontFamily="ui-monospace, monospace">
              {l.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
