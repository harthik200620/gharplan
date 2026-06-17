"use client";

import { useRef } from "react";
import type { Plan } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";
import { roomBounds, ZONE_FILL } from "@/lib/plan-helpers";
import { useWizard } from "@/lib/store";

const MARGIN = 0.9;
const GRID = 0.1;
const MIN = 0.6;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type Drag =
  | { mode: "move" | "resize"; id: string; corner: number; sx: number; sy: number; b: [number, number, number, number] }
  | null;

export function RoomCanvas({
  plan,
  selectedId,
  onSelect,
}: {
  plan: Plan;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag>(null);
  const setRoomRect = useWizard((s) => s.setRoomRect);
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const toY = (y: number) => D - y;

  function ptr(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPointReadOnly(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: D - p.y };
  }

  function startMove(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    onSelect(id);
    const room = plan.rooms.find((r) => r.id === id)!;
    const p = ptr(e);
    drag.current = { mode: "move", id, corner: -1, sx: p.x, sy: p.y, b: roomBounds(room.polygon) };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function startResize(e: React.PointerEvent, id: string, corner: number) {
    e.stopPropagation();
    onSelect(id);
    const room = plan.rooms.find((r) => r.id === id)!;
    const p = ptr(e);
    drag.current = { mode: "resize", id, corner, sx: p.x, sy: p.y, b: roomBounds(room.polygon) };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = ptr(e);
    let [x0, y0, x1, y1] = d.b;
    if (d.mode === "move") {
      const w = x1 - x0;
      const h = y1 - y0;
      const nx0 = clamp(snap(x0 + (p.x - d.sx)), 0, W - w);
      const ny0 = clamp(snap(y0 + (p.y - d.sy)), 0, D - h);
      setRoomRect(d.id, nx0, ny0, nx0 + w, ny0 + h);
    } else {
      const mx = clamp(snap(p.x), 0, W);
      const my = clamp(snap(p.y), 0, D);
      // corners: 0=SW 1=SE 2=NE 3=NW
      if (d.corner === 0) {
        x0 = Math.min(mx, x1 - MIN);
        y0 = Math.min(my, y1 - MIN);
      } else if (d.corner === 1) {
        x1 = Math.max(mx, x0 + MIN);
        y0 = Math.min(my, y1 - MIN);
      } else if (d.corner === 2) {
        x1 = Math.max(mx, x0 + MIN);
        y1 = Math.max(my, y0 + MIN);
      } else {
        x0 = Math.min(mx, x1 - MIN);
        y1 = Math.max(my, y0 + MIN);
      }
      setRoomRect(d.id, x0, y0, x1, y1);
    }
  }

  function end() {
    drag.current = null;
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${-MARGIN} ${-MARGIN} ${W + 2 * MARGIN} ${D + 2 * MARGIN}`}
      className="touch-none select-none"
      style={{ width: "100%", height: "auto", background: "transparent", borderRadius: 12 }}
      onPointerDown={() => onSelect(null)}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <rect x={0} y={0} width={W} height={D} fill="#ffffff" stroke="#1e293b" strokeWidth={0.05} rx={0.05} />
      {Array.from({ length: Math.floor(W) + 1 }, (_, i) => (
        <line key={`v${i}`} x1={i} y1={0} x2={i} y2={D} stroke="#EEF2F7" strokeWidth={0.015} />
      ))}
      {Array.from({ length: Math.floor(D) + 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i} x2={W} y2={i} stroke="#EEF2F7" strokeWidth={0.015} />
      ))}

      {plan.rooms.map((room) => {
        const [x0, y0, x1, y1] = roomBounds(room.polygon);
        const sel = selectedId === room.id;
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const corners: [number, number][] = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ];
        return (
          <g key={room.id}>
            <rect
              x={x0}
              y={toY(y1)}
              width={x1 - x0}
              height={y1 - y0}
              fill={ZONE_FILL[room.zone ?? "CENTER"] ?? "#f1f5f9"}
              stroke={sel ? "#4F46E5" : "#94a3b8"}
              strokeWidth={sel ? 0.08 : 0.03}
              style={{ cursor: "move" }}
              onPointerDown={(e) => startMove(e, room.id)}
            />
            <text x={cx} y={toY(cy)} textAnchor="middle" fontSize={0.3} fill="#1f2937" style={{ pointerEvents: "none" }}>
              <tspan x={cx} fontWeight={600}>
                {ROOM_LABELS[room.type]}
              </tspan>
              <tspan x={cx} dy={0.38} fontSize={0.24} fill="#64748b">
                {room.areaSqm.toFixed(1)} m² · {room.zone}
              </tspan>
            </text>
            {sel &&
              corners.map(([hx, hy], i) => (
                <rect
                  key={i}
                  x={hx - 0.16}
                  y={toY(hy) - 0.16}
                  width={0.32}
                  height={0.32}
                  fill="#4F46E5"
                  rx={0.06}
                  style={{ cursor: "nwse-resize" }}
                  onPointerDown={(e) => startResize(e, room.id, i)}
                />
              ))}
          </g>
        );
      })}
    </svg>
  );
}
