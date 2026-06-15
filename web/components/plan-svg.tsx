"use client";

import type { Plan } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";
import { roomBounds, STATUS_FILL, ZONE_FILL } from "@/lib/plan-helpers";

type Props = {
  plan: Plan;
  colorBy?: "zone" | "status";
  statusByRoom?: Record<string, "pass" | "warn" | "fail">;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showLabels?: boolean;
  className?: string;
};

const MARGIN = 0.9;

export function PlanSvg({
  plan,
  colorBy = "zone",
  statusByRoom = {},
  selectedId,
  onSelect,
  showLabels = true,
  className,
}: Props) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const toY = (y: number) => D - y; // flip so North is up

  return (
    <svg
      viewBox={`${-MARGIN} ${-MARGIN} ${W + 2 * MARGIN} ${D + 2 * MARGIN}`}
      className={className}
      style={{ width: "100%", height: "auto", background: "#FbFcFe", borderRadius: 8 }}
    >
      {/* plot boundary */}
      <rect x={0} y={0} width={W} height={D} fill="#ffffff" stroke="#334155" strokeWidth={0.05} />

      {/* 1m grid */}
      {Array.from({ length: Math.floor(W) + 1 }, (_, i) => (
        <line key={`v${i}`} x1={i} y1={0} x2={i} y2={D} stroke="#EEF2F7" strokeWidth={0.015} />
      ))}
      {Array.from({ length: Math.floor(D) + 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i} x2={W} y2={i} stroke="#EEF2F7" strokeWidth={0.015} />
      ))}

      {plan.rooms.map((room) => {
        const [x0, y0, x1, y1] = roomBounds(room.polygon);
        const zone = room.zone ?? "CENTER";
        const fill =
          colorBy === "status" ? STATUS_FILL[statusByRoom[room.id] ?? "pass"] : ZONE_FILL[zone] ?? "#f1f5f9";
        const selected = selectedId === room.id;
        const cx = room.centroid?.[0] ?? (x0 + x1) / 2;
        const cy = room.centroid?.[1] ?? (y0 + y1) / 2;
        return (
          <g key={room.id} onPointerDown={() => onSelect?.(room.id)} style={{ cursor: onSelect ? "pointer" : "default" }}>
            <rect
              x={x0}
              y={toY(y1)}
              width={x1 - x0}
              height={y1 - y0}
              fill={fill}
              stroke={selected ? "#1F3A5F" : "#94a3b8"}
              strokeWidth={selected ? 0.07 : 0.03}
            />
            {showLabels && (
              <text
                x={cx}
                y={toY(cy)}
                textAnchor="middle"
                fontSize={0.32}
                fill="#1f2937"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                <tspan x={cx} fontWeight={600}>
                  {ROOM_LABELS[room.type]}
                </tspan>
                <tspan x={cx} dy={0.4} fontSize={0.26} fill="#64748b">
                  {room.areaSqm.toFixed(1)} m² · {zone}
                </tspan>
              </text>
            )}
          </g>
        );
      })}

      {/* north arrow (top-right, North is up) */}
      <g transform={`translate(${W + 0.4}, 0.2)`}>
        <line x1={0} y1={0.9} x2={0} y2={0} stroke="#1f2937" strokeWidth={0.04} />
        <path d="M -0.15 0.25 L 0 0 L 0.15 0.25 Z" fill="#1f2937" />
        <text x={0} y={-0.05} textAnchor="middle" fontSize={0.3} fontWeight={700} fill="#1f2937">
          N
        </text>
      </g>
    </svg>
  );
}
