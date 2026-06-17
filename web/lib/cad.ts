// Geometry + styling helpers for the in-app CAD floor-plan renderer.
// Coordinates are in METRES, origin = plot SW corner, +x = East, +y = North.

import type { Plan, Point } from "@gharplan/shared";

export type Rect = { x: number; y: number; w: number; h: number };
export type Edge = "N" | "S" | "E" | "W";

export function bounds(poly: Point[]): Rect {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Fixed "paper" palette — a CAD drawing reads best on light stock regardless of
// app theme. Each zone gets a soft fill + a saturated ink for accents.
export const ZONE_CAD: Record<string, { fill: string; ink: string; label: string }> = {
  N: { fill: "#EAF2FF", ink: "#2563eb", label: "North" },
  NE: { fill: "#E5FAF5", ink: "#0d9488", label: "North-East" },
  E: { fill: "#E6F6FF", ink: "#0284c7", label: "East" },
  SE: { fill: "#FFEEE3", ink: "#ea580c", label: "South-East" },
  S: { fill: "#FFF5E1", ink: "#d97706", label: "South" },
  SW: { fill: "#F4ECE5", ink: "#9a5b2e", label: "South-West" },
  W: { fill: "#F3ECFF", ink: "#7c3aed", label: "West" },
  NW: { fill: "#EEF1F6", ink: "#475569", label: "North-West" },
  CENTER: { fill: "#FFFBEA", ink: "#ca8a04", label: "Brahmasthan" },
};

export const STATUS_CAD: Record<string, { fill: string; ink: string }> = {
  pass: { fill: "#E7F8EF", ink: "#16a34a" },
  warn: { fill: "#FEF4D6", ink: "#d97706" },
  fail: { fill: "#FDE7E7", ink: "#dc2626" },
};

export const INK = "#0f172a";
export const WALL = "#0f172a";
export const PAPER = "#ffffff";

const VIRTUAL = new Set(["overhead_tank", "borewell", "brahmasthan"]);
const SITE_TYPES = new Set(["parking", "sitout", "courtyard", "garden", "service_shaft", "future_expansion", "balcony"]);

const TOL = 0.06;
export function exteriorEdges(r: Rect, W: number, D: number): Record<Edge, boolean> {
  return {
    W: r.x <= TOL,
    E: r.x + r.w >= W - TOL,
    S: r.y <= TOL,
    N: r.y + r.h >= D - TOL,
  };
}

function dist(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function edgeLen(e: Edge, r: Rect) {
  return e === "N" || e === "S" ? r.w : r.h;
}

function openingWidth(plan: Plan, roomId: string, kind: "door" | "window", fallback: number) {
  const pool = kind === "door" ? plan.doors : plan.windows;
  const o = pool.find((p) => p.roomId === roomId);
  return o?.widthM ?? fallback;
}

export type PlacedOpening = {
  roomId: string;
  kind: "door" | "window";
  edge: Edge;
  /** centre point of the opening, in metres */
  cx: number;
  cy: number;
  /** clear width of the opening, in metres */
  len: number;
};

function edgeMid(e: Edge, r: Rect): [number, number] {
  switch (e) {
    case "N":
      return [r.x + r.w / 2, r.y + r.h];
    case "S":
      return [r.x + r.w / 2, r.y];
    case "E":
      return [r.x + r.w, r.y + r.h / 2];
    case "W":
      return [r.x, r.y + r.h / 2];
  }
}

/**
 * The Plan model stores openings per-room without a wall position, so we infer a
 * sensible placement for visualization: doors open onto the interior edge nearest
 * the plot core (circulation); windows sit on an exterior edge, preferring the
 * Vastu-favourable North/East light.
 */
export function placeOpenings(plan: Plan): PlacedOpening[] {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const core: [number, number] = [W / 2, D / 2];
  const out: PlacedOpening[] = [];

  for (const room of plan.rooms) {
    if (VIRTUAL.has(room.type) || SITE_TYPES.has(room.type)) continue;
    const r = bounds(room.polygon);
    if (r.w < 0.6 || r.h < 0.6) continue;
    const ext = exteriorEdges(r, W, D);
    const edges: Edge[] = ["N", "S", "E", "W"];

    // door: interior edge closest to the plot core
    const interior = edges.filter((e) => !ext[e]);
    const doorPool = interior.length ? interior : edges;
    const doorEdge = doorPool
      .slice()
      .sort((a, b) => dist(edgeMid(a, r), core) - dist(edgeMid(b, r), core))[0];
    const dW = Math.min(openingWidth(plan, room.id, "door", 0.9), edgeLen(doorEdge, r) - 0.3);
    if (dW > 0.4) {
      const [cx, cy] = edgeMid(doorEdge, r);
      out.push({ roomId: room.id, kind: "door", edge: doorEdge, cx, cy, len: dW });
    }

    // window: first available exterior edge, N > E > W > S
    const winEdge = (["N", "E", "W", "S"] as Edge[]).find((e) => ext[e]);
    if (winEdge) {
      const wW = Math.min(openingWidth(plan, room.id, "window", 1.2), edgeLen(winEdge, r) - 0.5);
      if (wW > 0.4) {
        const [cx, cy] = edgeMid(winEdge, r);
        out.push({ roomId: room.id, kind: "window", edge: winEdge, cx, cy, len: wW });
      }
    }
  }
  return out;
}

/** metres → a tidy "3.66 m · 12′0″" dual label */
export function fmtDim(m: number): string {
  const totalIn = m * 39.3701;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  const ftAdj = inch === 12 ? ft + 1 : ft;
  const inAdj = inch === 12 ? 0 : inch;
  return `${m.toFixed(2)} m · ${ftAdj}′${inAdj}″`;
}

export function fmtFeet(m: number): string {
  const totalIn = m * 39.3701;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  const ftAdj = inch === 12 ? ft + 1 : ft;
  const inAdj = inch === 12 ? 0 : inch;
  return `${ftAdj}′${inAdj}″`;
}
