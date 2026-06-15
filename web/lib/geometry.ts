// Client-side mirror of the engine's geometry + zone computation, so the canvas
// shows live area / perimeter / zone without a round-trip. The engine remains
// authoritative on /plan/validate. Keep in sync with engine/app/services/zones.py.

import type { Compass, Point } from "@gharplan/shared";

export function area(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function perimeter(poly: Point[]): number {
  let p = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    p += Math.hypot(x2 - x1, y2 - y1);
  }
  return p;
}

export function centroid(poly: Point[]): Point {
  let cx = 0,
    cy = 0,
    a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) {
    // fallback: average of vertices
    const n = poly.length;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

const SECTORS: [number, Compass][] = [
  [22.5, "N"],
  [67.5, "NE"],
  [112.5, "E"],
  [157.5, "SE"],
  [202.5, "S"],
  [247.5, "SW"],
  [292.5, "W"],
  [337.5, "NW"],
];

export function bearingDeg(dx: number, dy: number): number {
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export function zoneOf(cx: number, cy: number, width: number, depth: number): Compass {
  // grid_3x3 Brahmasthan (central 1/9), matching the engine default.
  if (cx >= width / 3 && cx <= (2 * width) / 3 && cy >= depth / 3 && cy <= (2 * depth) / 3) {
    return "CENTER";
  }
  const dx = cx - width / 2;
  const dy = cy - depth / 2;
  if (dx === 0 && dy === 0) return "CENTER";
  const b = Math.round(bearingDeg(dx, dy) * 1e6) / 1e6;
  for (const [upper, comp] of SECTORS) if (b < upper) return comp;
  return "N";
}

export function rectPolygon(x0: number, y0: number, x1: number, y1: number): Point[] {
  const ax = Math.min(x0, x1),
    bx = Math.max(x0, x1),
    ay = Math.min(y0, y1),
    by = Math.max(y0, y1);
  return [
    [ax, ay],
    [bx, ay],
    [bx, by],
    [ax, by],
    [ax, ay],
  ];
}
