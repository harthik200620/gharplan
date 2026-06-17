// Geometry + styling helpers for the in-app CAD floor-plan renderer.
// Coordinates are in METRES, origin = plot SW corner, +x = East, +y = North.

import type { Plan, Point, Room } from "@gharplan/shared";

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

// Virtual point markers — never part of the built mass or openings.
const VIRTUAL = new Set(["overhead_tank", "borewell", "brahmasthan"]);
// Open site zones excluded from the built mass (elevations / sections / 3D).
const SITE_STRUCTURAL = new Set([
  "parking",
  "sitout",
  "courtyard",
  "garden",
  "service_shaft",
  "future_expansion",
]);
// Open zones additionally skipped when inferring openings (drop balcony too).
const SITE_OPENINGS = new Set([...SITE_STRUCTURAL, "balcony"]);

/** Rooms that form the built mass (exclude virtual markers + open site zones). */
export function structuralRooms(plan: Plan, floor?: number): Room[] {
  return plan.rooms.filter(
    (r) =>
      !VIRTUAL.has(r.type) &&
      !SITE_STRUCTURAL.has(r.type) &&
      (floor === undefined || (r.floor ?? 0) === floor),
  );
}

/** Bounding box of the built mass (all floors) — the building's outer wall extents. */
export function buildingFootprint(plan: Plan, floor?: number): Rect {
  // Per FLOOR when given: a G+1's floors are packed independently, so an exterior
  // wall must be judged against that floor's own outline, not the union of floors.
  const rooms = structuralRooms(plan, floor);
  if (!rooms.length) {
    return floor === undefined
      ? { x: 0, y: 0, w: plan.plot.widthM, h: plan.plot.depthM }
      : buildingFootprint(plan);
  }
  const pts: Point[] = rooms.flatMap((r) => r.polygon);
  return bounds(pts);
}

const TOL = 0.06;
// An edge is "exterior" when it lies on the building-footprint perimeter (± tol),
// NOT the raw plot — so rooms set back from the plot still get outer walls/windows.
export function exteriorEdges(r: Rect, fp: Rect): Record<Edge, boolean> {
  return {
    W: r.x <= fp.x + TOL,
    E: r.x + r.w >= fp.x + fp.w - TOL,
    S: r.y <= fp.y + TOL,
    N: r.y + r.h >= fp.y + fp.h - TOL,
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
  /** which jamb the door leaf pivots on for the plan swing. Windows ignore it. */
  hinge?: "lo" | "hi";
  /** the single main entrance door — drawn prominently and labelled. */
  main?: boolean;
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

/** Centre of the i-th of n openings spread evenly along edge e (margins at ends). */
function edgePos(e: Edge, r: Rect, i: number, n: number): [number, number] {
  const t = (i + 1) / (n + 1);
  switch (e) {
    case "N":
      return [r.x + r.w * t, r.y + r.h];
    case "S":
      return [r.x + r.w * t, r.y];
    case "E":
      return [r.x + r.w, r.y + r.h * t];
    case "W":
      return [r.x, r.y + r.h * t];
  }
}

/** If `room` is an attached bath (id "toilet_<p>" / "bath_<p>"), find the wall it
 *  SHARES with its parent bedroom `<p>` on the same floor and return the bath edge
 *  facing the bedroom + the midpoint of the shared span — so the ensuite door
 *  opens from the bedroom into the bath, never off the corridor. null otherwise. */
function ensuiteSharedEdge(
  room: Room,
  r: Rect,
  plan: Plan,
): { edge: Edge; mid: [number, number] } | null {
  const m = /^(?:toilet|bath)_(.+)$/.exec(room.id);
  if (!m) return null;
  const parent = plan.rooms.find((p) => p.id === m[1] && (p.floor ?? 0) === (room.floor ?? 0));
  if (!parent) return null;
  const p = bounds(parent.polygon);
  const tol = 0.08;
  const xOv = Math.min(r.x + r.w, p.x + p.w) - Math.max(r.x, p.x);
  const yOv = Math.min(r.y + r.h, p.y + p.h) - Math.max(r.y, p.y);
  const yc = (Math.max(r.y, p.y) + Math.min(r.y + r.h, p.y + p.h)) / 2;
  const xc = (Math.max(r.x, p.x) + Math.min(r.x + r.w, p.x + p.w)) / 2;
  if (Math.abs(r.x + r.w - p.x) < tol && yOv > 0.6) return { edge: "E", mid: [r.x + r.w, yc] };
  if (Math.abs(r.x - (p.x + p.w)) < tol && yOv > 0.6) return { edge: "W", mid: [r.x, yc] };
  if (Math.abs(r.y + r.h - p.y) < tol && xOv > 0.6) return { edge: "N", mid: [xc, r.y + r.h] };
  if (Math.abs(r.y - (p.y + p.h)) < tol && xOv > 0.6) return { edge: "S", mid: [xc, r.y] };
  return null;
}

function span(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

const WET_NEIGHBOUR = /toilet|bath/;
/** Does wall `e` of room `r` back onto a toilet/bath on the same floor? You never
 *  enter a room through a WC, so an entry door avoids such an edge. */
function edgeAbutsWet(room: Room, r: Rect, e: Edge, plan: Plan): boolean {
  const tol = 0.12;
  const floor = room.floor ?? 0;
  for (const nb of plan.rooms) {
    if (nb.id === room.id || (nb.floor ?? 0) !== floor || !WET_NEIGHBOUR.test(nb.type)) continue;
    const b = bounds(nb.polygon);
    if (e === "N" && Math.abs(b.y - (r.y + r.h)) < tol && span(r.x, r.x + r.w, b.x, b.x + b.w) > 0.4) return true;
    if (e === "S" && Math.abs(b.y + b.h - r.y) < tol && span(r.x, r.x + r.w, b.x, b.x + b.w) > 0.4) return true;
    if (e === "E" && Math.abs(b.x - (r.x + r.w)) < tol && span(r.y, r.y + r.h, b.y, b.y + b.h) > 0.4) return true;
    if (e === "W" && Math.abs(b.x + b.w - r.x) < tol && span(r.y, r.y + r.h, b.y, b.y + b.h) > 0.4) return true;
  }
  return false;
}

/** The street-facing building edge for a plot facing direction (the side the main
 *  entrance opens onto). Diagonals fold to their dominant cardinal. */
function facingEdge(facing: string): Edge {
  const f = (facing || "E").toUpperCase();
  if (f.includes("E")) return "E";
  if (f.includes("W")) return "W";
  if (f.includes("N")) return "N";
  return "S";
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
  const fpByFloor = new Map<number, Rect>();
  const footprintFor = (f: number): Rect => {
    let fp = fpByFloor.get(f);
    if (!fp) {
      fp = buildingFootprint(plan, f);
      fpByFloor.set(f, fp);
    }
    return fp;
  };
  const out: PlacedOpening[] = [];

  for (const room of plan.rooms) {
    if (VIRTUAL.has(room.type) || SITE_OPENINGS.has(room.type)) continue;
    const r = bounds(room.polygon);
    if (r.w < 0.6 || r.h < 0.6) continue;
    const ext = exteriorEdges(r, footprintFor(room.floor ?? 0));
    const edges: Edge[] = ["N", "S", "E", "W"];

    // --- door ---
    // An attached bath hinges off the wall it SHARES with its bedroom and opens
    // INTO the bath — a true ensuite. Every other room's door sits on the interior
    // wall nearest the circulation core, hinged at the corner nearest that core so
    // the leaf folds flat against a wall instead of sweeping the middle of the room.
    const shared = ensuiteSharedEdge(room, r, plan);
    let doorEdge: Edge;
    let doorCenter: [number, number];
    let hinge: "lo" | "hi" = "lo";
    if (shared) {
      doorEdge = shared.edge;
      doorCenter = shared.mid;
    } else {
      const interior = edges.filter((e) => !ext[e]);
      const doorPool = interior.length ? interior : edges;
      // nearest the circulation core, but never opening through a toilet/bath wall.
      const score = (e: Edge) =>
        dist(edgeMid(e, r), core) + (edgeAbutsWet(room, r, e, plan) ? 100 : 0);
      doorEdge = doorPool.slice().sort((a, b) => score(a) - score(b))[0];
      doorCenter = edgeMid(doorEdge, r);
    }
    const dW = Math.min(openingWidth(plan, room.id, "door", 0.9), edgeLen(doorEdge, r) - 0.3);
    if (dW > 0.4) {
      let [cx, cy] = doorCenter;
      if (!shared) {
        // hinge at the wall end nearer the core; sit the jamb a margin off the corner.
        const horiz = doorEdge === "N" || doorEdge === "S";
        const lo: [number, number] = horiz ? [r.x, doorCenter[1]] : [doorCenter[0], r.y];
        const hi: [number, number] = horiz ? [r.x + r.w, doorCenter[1]] : [doorCenter[0], r.y + r.h];
        const margin = dW / 2 + 0.12;
        if (dist(lo, core) <= dist(hi, core)) {
          hinge = "lo";
          if (horiz) cx = r.x + margin;
          else cy = r.y + margin;
        } else {
          hinge = "hi";
          if (horiz) cx = r.x + r.w - margin;
          else cy = r.y + r.h - margin;
        }
      }
      out.push({ roomId: room.id, kind: "door", edge: doorEdge, cx, cy, len: dW, hinge });
    }

    // windows: one per ACTUAL plan window for this room, spread across the room's
    // exterior walls so a cross-ventilated corner room shows a window on each face
    // (preferring N > E > W > S). Falls back to a single inferred window for plans
    // authored without an explicit window list.
    const winEdges = (["N", "E", "W", "S"] as Edge[]).filter((e) => ext[e]);
    const roomWindows = plan.windows.filter((w) => w.roomId === room.id);
    if (winEdges.length && roomWindows.length) {
      const assign = roomWindows.map((_, k) => winEdges[k % winEdges.length]);
      const countByEdge: Partial<Record<Edge, number>> = {};
      assign.forEach((e) => (countByEdge[e] = (countByEdge[e] ?? 0) + 1));
      const seenByEdge: Partial<Record<Edge, number>> = {};
      roomWindows.forEach((w, k) => {
        const e = assign[k];
        const n = countByEdge[e] ?? 1;
        const i = (seenByEdge[e] = (seenByEdge[e] ?? 0));
        seenByEdge[e] = i + 1;
        const wW = Math.min(w.widthM ?? 1.2, edgeLen(e, r) / n - 0.4);
        if (wW > 0.4) {
          const [cx, cy] = edgePos(e, r, i, n);
          out.push({ roomId: room.id, kind: "window", edge: e, cx, cy, len: wW });
        }
      });
    } else if (winEdges.length) {
      const e = winEdges[0];
      const wW = Math.min(openingWidth(plan, room.id, "window", 1.2), edgeLen(e, r) - 0.5);
      if (wW > 0.4) {
        const [cx, cy] = edgeMid(e, r);
        out.push({ roomId: room.id, kind: "window", edge: e, cx, cy, len: wW });
      }
    }
  }

  // --- main entrance ---
  // One prominent front door on the street-facing wall of the ground-floor entry
  // room: an `entrance` room if present, else the front-most social room (living,
  // then dining/kitchen) that actually reaches the street edge.
  const street = facingEdge(plan.plot.facing);
  const fp0 = footprintFor(0);
  const entryRank: Record<string, number> = { entrance: 0, living: 1, dining: 2, kitchen: 3 };
  const frontRooms = plan.rooms.filter(
    (r) =>
      (r.floor ?? 0) === 0 &&
      !VIRTUAL.has(r.type) &&
      !SITE_OPENINGS.has(r.type) &&
      exteriorEdges(bounds(r.polygon), fp0)[street],
  );
  if (frontRooms.length) {
    const entry = frontRooms.slice().sort((a, b) => {
      const d = (entryRank[a.type] ?? 9) - (entryRank[b.type] ?? 9);
      if (d !== 0) return d;
      const A = bounds(a.polygon);
      const B = bounds(b.polygon);
      return B.w * B.h - A.w * A.h;
    })[0];
    const er = bounds(entry.polygon);
    const mW = Math.min(1.2, edgeLen(street, er) - 0.4);
    if (mW > 0.6) {
      const t = 0.66; // off-centre so the front door clears a centred window
      const horiz = street === "N" || street === "S";
      const cx = horiz ? er.x + er.w * t : street === "E" ? er.x + er.w : er.x;
      const cy = horiz ? (street === "N" ? er.y + er.h : er.y) : er.y + er.h * t;
      out.push({ roomId: entry.id, kind: "door", edge: street, cx, cy, len: mW, main: true });
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
