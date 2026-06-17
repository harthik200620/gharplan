"use client";

import * as React from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { Plan, Room } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";
import {
  bounds,
  fmtDim,
  placeOpenings,
  STATUS_CAD,
  ZONE_CAD,
  type Edge,
  type Rect,
} from "@/lib/cad";
import { cn } from "@/lib/utils";

type Status = "pass" | "warn" | "fail";

type Props = {
  plan: Plan;
  colorBy?: "zone" | "status";
  statusByRoom?: Record<string, Status>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  showZones?: boolean;
  showOpenings?: boolean;
  showFurniture?: boolean;
  showDimensions?: boolean;
  showLabels?: boolean;
  showGrid?: boolean;
  interactive?: boolean;
  floor?: number;
  className?: string;
};

// non-scaling stroke weights (viewport px)
const W_EXT = 2.6;
const W_INT = 1.4;
const W_OPEN = 1.5;
const W_DIM = 1;
const W_FURN = 1.1;

const FURN = "#9aa4b6";
const VIRTUAL = new Set(["overhead_tank", "borewell", "brahmasthan"]);
const SITE_TYPES = new Set(["parking", "sitout", "courtyard", "garden", "service_shaft", "future_expansion", "balcony"]);
const SITE_FILL: Record<string, string> = {
  parking: "#E7EDF5",
  sitout: "#FFF2D8",
  courtyard: "#E8F7EF",
  garden: "#DCFCE7",
  service_shaft: "#DBEAFE",
  future_expansion: "#F5F3FF",
  balcony: "#E0F2FE",
};

export function FloorPlanCad({
  plan,
  colorBy = "zone",
  statusByRoom = {},
  selectedId,
  onSelect,
  showZones = true,
  showOpenings = true,
  showFurniture = true,
  showDimensions = true,
  showLabels = true,
  showGrid = true,
  interactive = true,
  floor,
  className,
}: Props) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const sy = (y: number) => D - y; // flip: North is up

  // base viewBox (metres) with margins for dimension strings
  const mL = 1.6;
  const mR = 0.8;
  const mT = 0.8;
  const mB = 1.6;
  const base = React.useMemo(
    () => ({ x: -mL, y: -mT, w: W + mL + mR, h: D + mT + mB }),
    [W, D],
  );

  const [vb, setVb] = React.useState(base);
  React.useEffect(() => setVb(base), [base]);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ x: number; y: number; moved: boolean } | null>(null);

  function onWheel(e: React.WheelEvent) {
    if (!interactive) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setVb((v) => {
      const factor = Math.exp(e.deltaY * 0.0014);
      const minW = base.w * 0.18;
      const maxW = base.w * 2.2;
      const nw = Math.min(maxW, Math.max(minW, v.w * factor));
      const nh = nw * (v.h / v.w);
      const wx = v.x + px * v.w;
      const wy = v.y + py * v.h;
      return { x: wx - px * nw, y: wy - py * nh, w: nw, h: nh };
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!interactive || !drag.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.x) / r.width) * vb.w;
    const dy = ((e.clientY - drag.current.y) / r.height) * vb.h;
    if (Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y) > 3)
      drag.current.moved = true;
    drag.current.x = e.clientX;
    drag.current.y = e.clientY;
    setVb((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (drag.current && !drag.current.moved) onSelect?.(null);
    drag.current = null;
  }
  function zoom(factor: number) {
    setVb((v) => {
      const minW = base.w * 0.18;
      const maxW = base.w * 2.2;
      const nw = Math.min(maxW, Math.max(minW, v.w * factor));
      const nh = nw * (v.h / v.w);
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh };
    });
  }

  const shownRooms = React.useMemo(
    () => (floor === undefined ? plan.rooms : plan.rooms.filter((r) => (r.floor ?? 0) === floor)),
    [plan, floor],
  );
  const shownIds = React.useMemo(() => new Set(shownRooms.map((r) => r.id)), [shownRooms]);
  const openings = React.useMemo(
    () => (showOpenings ? placeOpenings(plan).filter((o) => shownIds.has(o.roomId)) : []),
    [plan, showOpenings, shownIds],
  );

  return (
    <div className={cn("relative overflow-hidden rounded-xl border bg-white", className)}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className={cn("block h-full w-full select-none", interactive && "cursor-grab active:cursor-grabbing")}
        style={{ touchAction: "none", background: "#fcfdff" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <defs>
          <pattern id="cad-grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#e8edf5" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
          </pattern>
          <linearGradient id="cad-paper" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f6f8fc" />
          </linearGradient>
        </defs>

        {/* plot paper + grid */}
        <rect x={0} y={0} width={W} height={D} fill="url(#cad-paper)" />
        {showGrid && <rect x={0} y={0} width={W} height={D} fill="url(#cad-grid)" />}

        {/* ROOMS (fills + partition walls) */}
        {shownRooms.map((room) => {
          if (VIRTUAL.has(room.type)) return null;
          const r = bounds(room.polygon);
          const zone = room.zone ?? "CENTER";
          const status = statusByRoom[room.id] ?? "pass";
          const isSite = SITE_TYPES.has(room.type);
          const fill =
            isSite
              ? SITE_FILL[room.type] ?? "#eef2f7"
              : colorBy === "status"
              ? STATUS_CAD[status].fill
              : showZones
                ? ZONE_CAD[zone]?.fill ?? "#f1f5f9"
                : "#ffffff";
          const selected = selectedId === room.id;
          return (
            <g key={room.id}>
              <rect
                x={r.x}
                y={sy(r.y + r.h)}
                width={r.w}
                height={r.h}
                fill={fill}
                stroke={selected ? "#4f46e5" : "#1f2a44"}
                strokeWidth={selected ? W_EXT : isSite ? 1.2 : W_INT}
                strokeDasharray={isSite ? "4 3" : undefined}
                vectorEffect="non-scaling-stroke"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!drag.current?.moved) onSelect?.(room.id);
                }}
                style={{ cursor: onSelect ? "pointer" : "default" }}
              />
              {selected && (
                <rect
                  x={r.x}
                  y={sy(r.y + r.h)}
                  width={r.w}
                  height={r.h}
                  fill="#4f46e5"
                  opacity={0.06}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}

        {/* FURNITURE */}
        {showFurniture &&
          shownRooms.map((room) => {
            if (VIRTUAL.has(room.type) || SITE_TYPES.has(room.type)) return null;
            const r = bounds(room.polygon);
            return <Furniture key={`f-${room.id}`} room={room} r={r} sy={sy} />;
          })}

        {/* OPENINGS (doors + windows) */}
        {openings.map((o, i) => (
          <Opening key={`o-${i}`} o={o} sy={sy} />
        ))}

        {/* exterior plot wall (drawn last so it reads as the boundary) */}
        <rect
          x={0}
          y={0}
          width={W}
          height={D}
          fill="none"
          stroke="#0f172a"
          strokeWidth={W_EXT}
          vectorEffect="non-scaling-stroke"
        />

        {/* LABELS */}
        {showLabels &&
          shownRooms.map((room) => {
            if (VIRTUAL.has(room.type)) return null;
            const r = bounds(room.polygon);
            const cx = room.centroid?.[0] ?? r.x + r.w / 2;
            const cy = room.centroid?.[1] ?? r.y + r.h / 2;
            const zone = room.zone ?? "CENTER";
            const small = r.w < 1.8 || r.h < 1.4;
            return (
              <g key={`l-${room.id}`} pointerEvents="none">
                <text
                  x={cx}
                  y={sy(cy)}
                  textAnchor="middle"
                  fontSize={small ? 0.26 : 0.34}
                  fontWeight={700}
                  fill="#0f172a"
                  fontFamily="var(--font-sora), sans-serif"
                >
                  {ROOM_LABELS[room.type]}
                </text>
                {!small && (
                  <text
                    x={cx}
                    y={sy(cy) + 0.42}
                    textAnchor="middle"
                    fontSize={0.26}
                    fill="#64748b"
                    fontFamily="var(--font-mono), monospace"
                  >
                    {room.areaSqm.toFixed(1)} m² · {zone}
                  </text>
                )}
              </g>
            );
          })}

        {/* DIMENSION STRINGS */}
        {showDimensions && (
          <g pointerEvents="none">
            {/* overall width (south side) */}
            <DimLine x1={0} y1={sy(0) + 0.85} x2={W} y2={sy(0) + 0.85} label={fmtDim(W)} />
            {/* overall depth (west side) */}
            <DimLine x1={-0.85} y1={sy(0)} x2={-0.85} y2={sy(D)} label={fmtDim(D)} vertical />
          </g>
        )}
      </svg>

      {/* ---- screen-space overlay chrome ---- */}
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-center gap-1 rounded-lg bg-white/85 px-2 py-1.5 text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        <svg width="22" height="30" viewBox="-11 -2 22 30">
          <line x1="0" y1="26" x2="0" y2="2" stroke="#0f172a" strokeWidth="1.5" />
          <path d="M -4 8 L 0 0 L 4 8 Z" fill="#4f46e5" />
          <text x="0" y="-4" textAnchor="middle" fontSize="9" fontWeight="800" fill="#0f172a">
            N
          </text>
        </svg>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-white/85 px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        <ScaleBar vb={vb} svgRef={svgRef} />
      </div>

      {interactive && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <button
            onClick={() => zoom(0.8)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
            title="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => zoom(1.25)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
            title="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={() => setVb(base)}
            className="grid h-7 w-7 place-items-center rounded-md text-slate-600 hover:bg-slate-100"
            title="Fit"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- pieces --------------------------------- */

function DimLine({
  x1,
  y1,
  x2,
  y2,
  label,
  vertical,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  vertical?: boolean;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const tick = 0.12;
  return (
    <g stroke="#475569" strokeWidth={W_DIM}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      <line
        x1={x1}
        y1={vertical ? y1 : y1 - tick}
        x2={vertical ? x1 + tick : x1}
        y2={vertical ? y1 : y1 + tick}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={vertical ? x2 - tick : x2}
        y1={vertical ? y2 : y2 - tick}
        x2={x2}
        y2={vertical ? y2 : y2 + tick}
        vectorEffect="non-scaling-stroke"
      />
      <g stroke="none">
        <text
          x={mx}
          y={my}
          transform={vertical ? `rotate(-90 ${mx} ${my})` : undefined}
          textAnchor="middle"
          dy={vertical ? -0.14 : -0.16}
          fontSize={0.3}
          fontWeight={600}
          fill="#334155"
          fontFamily="var(--font-mono), monospace"
        >
          {label}
        </text>
      </g>
    </g>
  );
}

function Opening({ o, sy }: { o: { kind: "door" | "window"; edge: Edge; cx: number; cy: number; len: number }; sy: (y: number) => number }) {
  const half = o.len / 2;
  const along: [number, number] = o.edge === "N" || o.edge === "S" ? [1, 0] : [0, 1];
  const inward: [number, number] =
    o.edge === "N" ? [0, -1] : o.edge === "S" ? [0, 1] : o.edge === "E" ? [-1, 0] : [1, 0];

  const j1: [number, number] = [o.cx - along[0] * half, o.cy - along[1] * half];
  const j2: [number, number] = [o.cx + along[0] * half, o.cy + along[1] * half];

  if (o.kind === "window") {
    const t = 0.07;
    const n: [number, number] = [inward[0] * t, inward[1] * t];
    return (
      <g stroke="#1d4ed8" strokeWidth={W_OPEN} fill="none">
        {/* break the wall white */}
        <line x1={j1[0]} y1={sy(j1[1])} x2={j2[0]} y2={sy(j2[1])} stroke="#ffffff" strokeWidth={W_EXT + 1.5} vectorEffect="non-scaling-stroke" />
        <line x1={j1[0] - n[0]} y1={sy(j1[1] - n[1])} x2={j2[0] - n[0]} y2={sy(j2[1] - n[1])} vectorEffect="non-scaling-stroke" />
        <line x1={j1[0] + n[0]} y1={sy(j1[1] + n[1])} x2={j2[0] + n[0]} y2={sy(j2[1] + n[1])} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }

  // door: leaf + swing arc pivoting at the hinge jamb (sampled polyline → flip-safe)
  const hingePt = o.hinge === "hi" ? j2 : j1;
  const otherPt = o.hinge === "hi" ? j1 : j2;
  const leafEnd: [number, number] = [hingePt[0] + inward[0] * o.len, hingePt[1] + inward[1] * o.len];
  const a0 = Math.atan2(otherPt[1] - hingePt[1], otherPt[0] - hingePt[0]);
  const a1 = Math.atan2(leafEnd[1] - hingePt[1], leafEnd[0] - hingePt[0]);
  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const steps = 10;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (da * i) / steps;
    pts.push(`${hingePt[0] + Math.cos(a) * o.len},${sy(hingePt[1] + Math.sin(a) * o.len)}`);
  }
  return (
    <g>
      <line x1={j1[0]} y1={sy(j1[1])} x2={j2[0]} y2={sy(j2[1])} stroke="#ffffff" strokeWidth={W_EXT + 1.5} vectorEffect="non-scaling-stroke" />
      <polyline points={pts.join(" ")} fill="none" stroke="#94a3b8" strokeWidth={W_DIM} vectorEffect="non-scaling-stroke" />
      <line
        x1={hingePt[0]}
        y1={sy(hingePt[1])}
        x2={leafEnd[0]}
        y2={sy(leafEnd[1])}
        stroke="#475569"
        strokeWidth={W_OPEN}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function Furniture({ room, r, sy }: { room: Room; r: Rect; sy: (y: number) => number }) {
  const inset = 0.22;
  const x = r.x + inset;
  const y = r.y + inset;
  const w = Math.max(0, r.w - inset * 2);
  const h = Math.max(0, r.h - inset * 2);
  if (w < 0.6 || h < 0.6) return null;
  const stroke = FURN;
  const sw = W_FURN;
  const common = { fill: "none", stroke, strokeWidth: sw, vectorEffect: "non-scaling-stroke" as const };

  const rectEl = (rx: number, ry: number, rw: number, rh: number, rd = 0.04) => (
    <rect x={rx} y={sy(ry + rh)} width={rw} height={rh} rx={rd} {...common} />
  );

  switch (room.type) {
    case "master_bedroom":
    case "bedroom":
    case "childrens_bedroom": {
      const bw = Math.min(w * 0.86, room.type === "master_bedroom" ? 1.8 : 1.4);
      const bh = Math.min(h * 0.7, 2.0);
      const bx = r.x + r.w / 2 - bw / 2;
      const by = r.y + inset;
      return (
        <g>
          {rectEl(bx, by, bw, bh, 0.08)}
          {/* pillows */}
          {rectEl(bx + 0.08, by + bh - 0.42, bw / 2 - 0.14, 0.34, 0.06)}
          {rectEl(bx + bw / 2 + 0.06, by + bh - 0.42, bw / 2 - 0.14, 0.34, 0.06)}
        </g>
      );
    }
    case "living": {
      const sofaW = Math.min(w * 0.8, 2.2);
      const sx = r.x + r.w / 2 - sofaW / 2;
      return (
        <g>
          {rectEl(sx, y, sofaW, 0.6, 0.08)}
          {rectEl(sx, y, 0.18, 0.6)}
          {rectEl(sx + sofaW - 0.18, y, 0.18, 0.6)}
          {rectEl(r.x + r.w / 2 - 0.5, y + 1.0, 1.0, 0.5, 0.04)}
        </g>
      );
    }
    case "kitchen": {
      // L-counter along two walls
      return (
        <g>
          {rectEl(x, r.y + r.h - 0.55, w, 0.5)}
          {rectEl(x, y, 0.5, h - 0.5)}
          <circle cx={x + 0.55} cy={sy(r.y + r.h - 0.3)} r={0.12} {...common} />
        </g>
      );
    }
    case "dining": {
      const tw = Math.min(w * 0.6, 1.6);
      const th = Math.min(h * 0.5, 1.0);
      return rectEl(r.x + r.w / 2 - tw / 2, r.y + r.h / 2 - th / 2, tw, th, 0.06);
    }
    case "toilet":
    case "bathroom": {
      return (
        <g>
          {/* wc */}
          {rectEl(x, y, 0.4, 0.6, 0.12)}
          {/* basin */}
          <path
            d={`M ${r.x + r.w - 0.6} ${sy(r.y + r.h - inset)} a 0.3 0.3 0 0 1 0.6 0`}
            {...common}
          />
        </g>
      );
    }
    case "staircase": {
      const n = 7;
      const stepH = h / n;
      return (
        <g>
          {rectEl(x, y, w, h)}
          {Array.from({ length: n - 1 }, (_, i) => (
            <line
              key={i}
              x1={x}
              y1={sy(y + stepH * (i + 1))}
              x2={x + w}
              y2={sy(y + stepH * (i + 1))}
              {...common}
            />
          ))}
          <line x1={r.x + r.w / 2} y1={sy(y)} x2={r.x + r.w / 2} y2={sy(y + h)} {...common} />
          <path d={`M ${r.x + r.w / 2 - 0.12} ${sy(y + h - 0.3)} L ${r.x + r.w / 2} ${sy(y + h)} L ${r.x + r.w / 2 + 0.12} ${sy(y + h - 0.3)}`} {...common} />
        </g>
      );
    }
    case "pooja": {
      const pw = Math.min(w * 0.7, 0.9);
      const px = r.x + r.w / 2 - pw / 2;
      return (
        <g>
          {rectEl(px, y, pw, 0.4)}
          <path d={`M ${px} ${sy(y + 0.4)} L ${r.x + r.w / 2} ${sy(y + 0.85)} L ${px + pw} ${sy(y + 0.4)}`} {...common} />
        </g>
      );
    }
    case "utility":
    case "store": {
      return rectEl(x, y, Math.min(w, 0.7), h);
    }
    default:
      return null;
  }
}

function ScaleBar({
  vb,
  svgRef,
}: {
  vb: { w: number };
  svgRef: React.RefObject<SVGSVGElement>;
}) {
  const [pxW, setPxW] = React.useState(600);
  React.useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [svgRef]);
  const pxPerM = pxW / vb.w;
  // pick a nice round length ≤ ~90px
  const candidates = [0.5, 1, 2, 5, 10];
  const meters = candidates.find((c) => c * pxPerM >= 60 && c * pxPerM <= 120) ?? 1;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2 border-x border-b border-slate-500" style={{ width: meters * pxPerM }} />
      <span className="tabular-nums">{meters} m</span>
    </div>
  );
}
