"use client";

import * as React from "react";
import type { Plan, Room } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";
import { bounds, placeOpenings, type Edge, type PlacedOpening } from "@/lib/cad";

// Axonometric (planometric) 3D from the same plan geometry — pure SVG, no WebGL.
// Reliable everywhere; reads like an architectural presentation drawing.

const A = Math.PI / 6; // 30°
const COS = Math.cos(A);
const SIN = Math.sin(A);
const WALL_H = 2.7;
const WALL_T = 0.11;

const VIRTUAL = new Set(["overhead_tank", "borewell", "brahmasthan"]);
const SITE_TYPES = new Set(["parking", "sitout", "courtyard", "garden", "service_shaft", "future_expansion", "balcony"]);

function proj(px: number, pz: number, h = 0): [number, number] {
  return [(px - pz) * COS, (px + pz) * SIN - h];
}
const pt = (px: number, pz: number, h = 0) => proj(px, pz, h).join(",");

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function floorColor(type: string): string {
  if (type === "parking") return "#cbd5e1";
  if (type === "sitout" || type === "balcony") return "#f5d8a6";
  if (type === "courtyard" || type === "garden") return "#bfe7c5";
  if (type === "service_shaft") return "#bfdbfe";
  if (type === "future_expansion") return "#ddd6fe";
  if (type === "kitchen" || type === "toilet" || type === "bathroom" || type === "utility") return "#dce2e8";
  if (type.includes("bedroom")) return "#d8bf9e";
  if (type === "pooja") return "#ecdcab";
  if (type === "staircase") return "#cdd3da";
  return "#efe9dd"; // living / dining / foyer
}

type Interval = [number, number];
function gaps(start: number, end: number, cuts: Interval[]): Interval[] {
  let segs: Interval[] = [[start, end]];
  for (const [g0, g1] of cuts) {
    const next: Interval[] = [];
    for (const [s0, s1] of segs) {
      if (g1 <= s0 || g0 >= s1) next.push([s0, s1]);
      else {
        if (g0 > s0) next.push([s0, g0]);
        if (g1 < s1) next.push([g1, s1]);
      }
    }
    segs = next;
  }
  return segs.filter(([a, b]) => b - a > 0.04);
}

type WallBox = { x0: number; z0: number; x1: number; z1: number };
function roomWalls(room: Room, openings: PlacedOpening[]): WallBox[] {
  if (SITE_TYPES.has(room.type)) return [];
  const r = bounds(room.polygon);
  const doors = openings.filter((o) => o.roomId === room.id && o.kind === "door");
  const onEdge = (e: Edge): Interval[] =>
    doors.filter((d) => d.edge === e).map((d) => {
      const c = e === "N" || e === "S" ? d.cx : d.cy;
      return [c - d.len / 2, c + d.len / 2] as Interval;
    });
  const out: WallBox[] = [];
  // N (top, z=r.y+h) & S (bottom, z=r.y): horizontal
  for (const [edge, z] of [["N", r.y + r.h] as const, ["S", r.y] as const]) {
    for (const [x0, x1] of gaps(r.x, r.x + r.w, onEdge(edge)))
      out.push({ x0, z0: z - WALL_T / 2, x1, z1: z + WALL_T / 2 });
  }
  // E (x=r.x+w) & W (x=r.x): vertical
  for (const [edge, x] of [["E", r.x + r.w] as const, ["W", r.x] as const]) {
    for (const [z0, z1] of gaps(r.y, r.y + r.h, onEdge(edge)))
      out.push({ x0: x - WALL_T / 2, z0, x1: x + WALL_T / 2, z1 });
  }
  return out;
}

type Item = { depth: number; el: React.ReactNode };

function box(key: string, x0: number, z0: number, x1: number, z1: number, h: number, base: string, items: Item[]) {
  const depth = (x0 + x1) / 2 + (z0 + z1) / 2;
  // visible faces: top, south (z=z1), east (x=x1)
  const top = `${pt(x0, z0, h)} ${pt(x1, z0, h)} ${pt(x1, z1, h)} ${pt(x0, z1, h)}`;
  const south = `${pt(x0, z1, 0)} ${pt(x1, z1, 0)} ${pt(x1, z1, h)} ${pt(x0, z1, h)}`;
  const east = `${pt(x1, z0, 0)} ${pt(x1, z1, 0)} ${pt(x1, z1, h)} ${pt(x1, z0, h)}`;
  items.push({
    depth,
    el: (
      <g key={key} strokeLinejoin="round">
        <polygon points={south} fill={shade(base, 0.84)} />
        <polygon points={east} fill={shade(base, 0.74)} />
        <polygon points={top} fill={shade(base, 1.0)} stroke={shade(base, 0.66)} strokeWidth={0.015} />
      </g>
    ),
  });
}

function furniture(room: Room, items: Item[]) {
  const r = bounds(room.polygon);
  const t = room.type;
  const cx = r.x + r.w / 2;
  const cz = r.y + r.h / 2;
  if (t.includes("bedroom")) {
    const bw = Math.min(r.w * 0.8, t === "master_bedroom" ? 1.9 : 1.5);
    const bl = Math.min(r.h * 0.72, 2.0);
    box(`${room.id}-bed`, cx - bw / 2, cz - bl / 2, cx + bw / 2, cz + bl / 2, 0.5, "#b8c1d2", items);
  } else if (t === "living") {
    const w = Math.min(r.w * 0.72, 2.1);
    box(`${room.id}-sofa`, cx - w / 2, r.y + 0.3, cx + w / 2, r.y + 0.95, 0.55, "#8b96aa", items);
  } else if (t === "kitchen") {
    box(`${room.id}-ktc`, r.x + 0.18, r.y + r.h - 0.72, r.x + r.w - 0.18, r.y + r.h - 0.18, 0.9, "#b6bcc6", items);
  } else if (t === "dining") {
    box(`${room.id}-tbl`, cx - 0.7, cz - 0.5, cx + 0.7, cz + 0.5, 0.78, "#a8865f", items);
  } else if (t === "pooja") {
    box(`${room.id}-mnd`, cx - 0.45, r.y + 0.2, cx + 0.45, r.y + 0.6, 0.7, "#cB5e3a".toLowerCase(), items);
  }
}

export function FloorPlanIso({ plan, floor, className }: { plan: Plan; floor?: number; className?: string }) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const rooms = plan.rooms.filter(
    (r) => !VIRTUAL.has(r.type) && (floor === undefined || (r.floor ?? 0) === floor),
  );
  const openings = React.useMemo(() => placeOpenings(plan), [plan]);

  const items: Item[] = [];

  // plot ground slab (always farthest)
  const slab = `${pt(-0.2, -0.2, 0)} ${pt(W + 0.2, -0.2, 0)} ${pt(W + 0.2, D + 0.2, 0)} ${pt(-0.2, D + 0.2, 0)}`;
  items.push({ depth: -1e6, el: <polygon key="slab" points={slab} fill="#cfc8ba" stroke="#b3ab9b" strokeWidth={0.03} /> });

  for (const room of rooms) {
    const r = bounds(room.polygon);
    // floor inlay (just above slab)
    const fp = `${pt(r.x, r.y, 0)} ${pt(r.x + r.w, r.y, 0)} ${pt(r.x + r.w, r.y + r.h, 0)} ${pt(r.x, r.y + r.h, 0)}`;
    items.push({
      depth: r.x + r.w / 2 + (r.y + r.h / 2) - 0.05,
      el: <polygon key={`${room.id}-fl`} points={fp} fill={floorColor(room.type)} stroke={shade(floorColor(room.type), 0.85)} strokeWidth={0.015} />,
    });
    for (const w of roomWalls(room, openings)) box(`${room.id}-w-${w.x0}-${w.z0}`, w.x0, w.z0, w.x1, w.z1, WALL_H, "#f4f0e9", items);
    furniture(room, items);
  }

  items.sort((a, b) => a.depth - b.depth);

  // labels (drawn last, on top) at projected room centres
  const labels = rooms.map((room) => {
    const r = bounds(room.polygon);
    const [lx, ly] = proj(r.x + r.w / 2, r.y + r.h / 2, WALL_H + 0.35);
    const small = r.w < 1.9 || r.h < 1.5;
    return (
      <text
        key={`${room.id}-lbl`}
        x={lx}
        y={ly}
        textAnchor="middle"
        fontSize={small ? 0.34 : 0.42}
        fontWeight={700}
        fill="#0f172a"
        fontFamily="var(--font-sora), sans-serif"
        style={{ paintOrder: "stroke" }}
        stroke="#ffffff"
        strokeWidth={0.055}
      >
        {ROOM_LABELS[room.type]}
      </text>
    );
  });

  // viewBox from projected extents
  const xs = [-D * COS, W * COS];
  const ys = [-WALL_H - 1, (W + D) * SIN + 0.6];
  const m = 0.8;
  const vbX = xs[0] - m;
  const vbY = ys[0] - m;
  const vbW = xs[1] - xs[0] + 2 * m;
  const vbH = ys[1] - ys[0] + 2 * m;

  // north arrow direction (north = -z): from centre toward decreasing pz
  const [n0x, n0y] = proj(W + D * 0.18, -D * 0.05, 0.2);

  return (
    <div className={className}>
      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        style={{ width: "100%", height: "100%", background: "linear-gradient(180deg,#f3f5fa 0%,#e7ebf3 100%)" }}
      >
        {items.map((it) => it.el)}
        {labels}
        {/* north arrow */}
        <g transform={`translate(${n0x},${n0y})`} fontFamily="var(--font-sora), sans-serif">
          <path d={`M ${-COS} ${SIN} L 0 0 L 0 -0.1`} fill="none" stroke="#475569" strokeWidth={0.05} />
          <path d={`M ${-COS} ${SIN} l 0.18 -0.02 l -0.05 0.18 z`} fill="#4f46e5" />
          <text x={-COS - 0.2} y={SIN + 0.1} fontSize={0.45} fontWeight={800} fill="#0f172a">N</text>
        </g>
      </svg>
    </div>
  );
}
