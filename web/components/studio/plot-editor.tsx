"use client";

import * as React from "react";
import { Plus, RotateCcw, TriangleAlert } from "lucide-react";
import type { Point } from "@gharplan/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Canvas is a fixed viewBox; the plot rectangle is fitted + centred inside it.
const VW = 480;
const VH = 320;
const PAD = 34;
const SNAP = 0.25; // metres

const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function rectRing(w: number, d: number): Point[] {
  // SW origin, counter-clockwise: SW → SE → NE → NW.
  return [
    [0, 0],
    [snap(w), 0],
    [snap(w), snap(d)],
    [0, snap(d)],
  ];
}

const cross = (o: Point, a: Point, b: Point) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when any two non-adjacent boundary edges cross (the ring is self-intersecting). */
function selfIntersects(pts: Point[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent edges share a vertex
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Optional irregular-plot boundary editor. Renders the current w×d rectangle as
 * draggable vertices on an SVG canvas (0.25 m snap, SW origin, +y = North) and
 * emits the ring in metres via onChange. onChange(null) = plain rectangle.
 */
export function PlotEditor({
  widthM,
  depthM,
  value,
  onChange,
  className,
}: {
  widthM: number;
  depthM: number;
  value?: Point[] | null;
  onChange: (pts: Point[] | null) => void;
  className?: string;
}) {
  const custom = !!(value && value.length >= 3);
  const pts = custom ? (value as Point[]) : rectRing(widthM, depthM);
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  const scale = Math.min((VW - 2 * PAD) / Math.max(widthM, 0.001), (VH - 2 * PAD) / Math.max(depthM, 0.001));
  const ox = (VW - widthM * scale) / 2;
  const oy = (VH - depthM * scale) / 2;
  // Plot metres (SW origin, +y North) ⇄ SVG px (y grows downward).
  const toPx = (p: Point): [number, number] => [ox + p[0] * scale, VH - oy - p[1] * scale];
  const toMetres = (px: number, py: number): Point => [
    snap(clamp((px - ox) / scale, 0, widthM)),
    snap(clamp((VH - oy - py) / scale, 0, depthM)),
  ];

  function clientToViewBox(e: React.PointerEvent): [number, number] {
    const r = svgRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * VW) / r.width, ((e.clientY - r.top) * VH) / r.height];
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragIdx === null) return;
    const [px, py] = clientToViewBox(e);
    const m = toMetres(px, py);
    const cur = pts[dragIdx];
    if (cur[0] === m[0] && cur[1] === m[1]) return;
    onChange(pts.map((p, i) => (i === dragIdx ? m : p)) as Point[]);
  }

  function startDrag(i: number) {
    return (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDragIdx(i);
      if (!custom) onChange(pts); // first touch of the rectangle becomes a custom ring
    };
  }

  function addVertex() {
    let best = 0;
    let bestLen = -1;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > bestLen) {
        bestLen = len;
        best = i;
      }
    }
    const a = pts[best];
    const b = pts[(best + 1) % pts.length];
    const mid: Point = [snap((a[0] + b[0]) / 2), snap((a[1] + b[1]) / 2)];
    onChange([...pts.slice(0, best + 1), mid, ...pts.slice(best + 1)] as Point[]);
  }

  function removeVertex(i: number) {
    if (pts.length <= 3) return;
    onChange(pts.filter((_, k) => k !== i) as Point[]);
  }

  const crossed = selfIntersects(pts);
  const rect = rectRing(widthM, depthM);
  const fmt = (n: number) => String(parseFloat(n.toFixed(2)));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="overflow-hidden rounded-xl border bg-grid">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VW} ${VH}`}
          className="h-[320px] w-full touch-none select-none"
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragIdx(null)}
          onPointerLeave={() => setDragIdx(null)}
        >
          {/* Reference: the full w×d plot rectangle */}
          <polygon
            points={rect.map((p) => toPx(p).join(",")).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeDasharray="4 4"
            strokeWidth={1}
            className="text-muted-foreground/50"
          />
          {/* The boundary ring */}
          <polygon
            points={pts.map((p) => toPx(p).join(",")).join(" ")}
            fill="currentColor"
            fillOpacity={0.08}
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            className={crossed ? "text-rose-500" : "text-primary"}
          />
          {/* Live edge-length labels (metres) */}
          {pts.map((p, i) => {
            const q = pts[(i + 1) % pts.length];
            const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const [ax, ay] = toPx(p);
            const [bx, by] = toPx(q);
            return (
              <text
                key={`e${i}`}
                x={(ax + bx) / 2}
                y={(ay + by) / 2 - 5}
                textAnchor="middle"
                fontSize={10}
                fill="currentColor"
                className="pointer-events-none font-mono text-muted-foreground"
              >
                {fmt(len)} m
              </text>
            );
          })}
          {/* Draggable vertices */}
          {pts.map((p, i) => {
            const [x, y] = toPx(p);
            return (
              <circle
                key={`v${i}`}
                cx={x}
                cy={y}
                r={7}
                strokeWidth={2}
                stroke="currentColor"
                className={cn(
                  "cursor-grab fill-background text-primary active:cursor-grabbing",
                  dragIdx === i && "text-accent-foreground",
                )}
                onPointerDown={startDrag(i)}
                onDoubleClick={() => removeVertex(i)}
              >
                <title>{`(${fmt(p[0])}, ${fmt(p[1])}) m — drag to move${pts.length > 3 ? ", double-click to remove" : ""}`}</title>
              </circle>
            );
          })}
          {/* Origin marker (SW corner) */}
          <text x={ox - 4} y={VH - oy + 12} fontSize={9} fill="currentColor" className="pointer-events-none font-mono text-muted-foreground/70">
            SW 0,0
          </text>
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addVertex}>
          <Plus className="h-3.5 w-3.5" /> Vertex
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!custom} onClick={() => onChange(null)}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset to rectangle
        </Button>
        <span className="text-[10px] text-muted-foreground">
          Drag corners · 0.25 m snap · metres from the SW corner
        </span>
      </div>

      {crossed && (
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          Boundary crosses itself — drag the corners apart so the outline is a simple ring.
        </p>
      )}
    </div>
  );
}
