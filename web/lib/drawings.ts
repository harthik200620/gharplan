// Derive ELEVATIONS and SECTIONS from a floor plan, the way an architect projects
// them: horizontal positions come straight off the plan, vertical positions from a
// table of standard Indian building levels (NBC 2016 + common practice, in metres).
// Coordinates in metres; origin = plot SW, +x = East, +y = North.

import type { Plan } from "@gharplan/shared";
import { bounds, buildingFootprint, placeOpenings, structuralRooms, type Edge } from "./cad";

// structuralRooms / buildingFootprint now live in cad.ts (mirroring cad_geom.py);
// re-export so callers importing them from drawings.ts keep working.
export { buildingFootprint, structuralRooms };

/** Standard vertical levels, metres from finished ground-floor level (±0.000). */
export const LEVELS = {
  GROUND: -0.15, // natural ground line, ~150 mm below FFL (plinth)
  FFL: 0, // finished floor level (datum)
  SILL: 0.9, // window sill — habitable rooms
  SILL_WET: 1.2, // window sill — toilet / kitchen
  LINTEL: 2.1, // door & window head
  CEIL: 2.75, // clear room height (NBC min for habitable)
  FLOOR_TO_FLOOR: 3.0, // FFL to FFL
  SLAB: 0.25, // slab + finish (FLOOR_TO_FLOOR - CEIL)
  SLAB_STRUCT: 0.15, // structural slab thickness shown in section
  PARAPET: 1.0, // parapet above the roof slab
  PLINTH: 0.45, // plinth height above ground
  FOOTING: 1.2, // foundation depth below ground (section)
  CHAJJA: 0.6, // sun-shade projection over openings
  DOOR_MAIN_W: 1.1,
} as const;

const WET = /toilet|bath|kitchen|utility|wash/;

export function floorsOf(plan: Plan): number[] {
  return Array.from(new Set(plan.rooms.map((r) => r.floor ?? 0))).sort((a, b) => a - b);
}

/** The facing of the plot reduced to a cardinal elevation face. */
export function frontFace(plan: Plan): Edge {
  const f = String(plan.plot.facing || "N").toUpperCase();
  if (f.startsWith("N")) return "N";
  if (f.startsWith("S")) return "S";
  if (f.startsWith("E")) return "E";
  if (f.startsWith("W")) return "W";
  // NE/NW/SE/SW → take the leading cardinal already handled; default N
  return "N";
}

export const FACE_LABEL: Record<Edge, string> = {
  N: "North",
  S: "South",
  E: "East",
  W: "West",
};

export type ElevationOpening = {
  u: number; // position along the face (metres, from the face origin)
  len: number; // clear width
  kind: "door" | "window";
  sill: number;
  lintel: number;
  floor: number;
};

/**
 * Openings visible on one elevation face. Windows come from the inferred plan
 * placement (exterior edge === face); the main entrance door is added on the front
 * face at the foyer/living position so the front elevation reads correctly.
 */
export function elevationOpenings(plan: Plan, face: Edge, front: Edge): ElevationOpening[] {
  const placed = placeOpenings(plan);
  const roomById = new Map(plan.rooms.map((r) => [r.id, r]));
  const fp = buildingFootprint(plan);
  const horiz = face === "N" || face === "S";
  const faceOrigin = horiz ? fp.x : fp.y;
  const out: ElevationOpening[] = [];

  for (const op of placed) {
    if (op.kind !== "window" || op.edge !== face) continue;
    const room = roomById.get(op.roomId);
    if (!room) continue;
    const u = (horiz ? op.cx : op.cy) - faceOrigin;
    const wet = WET.test(room.type);
    out.push({
      u,
      len: op.len,
      kind: "window",
      sill: wet ? LEVELS.SILL_WET : LEVELS.SILL,
      lintel: LEVELS.LINTEL,
      floor: room.floor ?? 0,
    });
  }

  // Main entrance door on the front elevation, on the ground floor.
  if (face === front) {
    const entry =
      structuralRooms(plan, 0).find((r) => r.type === "entrance") ??
      structuralRooms(plan, 0).find((r) => r.type === "living");
    const span = horiz ? fp.w : fp.h;
    let u = span / 2;
    if (entry) {
      const r = bounds(entry.polygon);
      u = (horiz ? r.x + r.w / 2 : r.y + r.h / 2) - faceOrigin;
    }
    out.push({ u, len: LEVELS.DOOR_MAIN_W, kind: "door", sill: 0, lintel: LEVELS.LINTEL, floor: 0 });
  }
  return out;
}

/** Roof level (top of the top floor slab) for an n-floor building. */
export function roofLevel(plan: Plan): number {
  const n = floorsOf(plan).length;
  return n * LEVELS.FLOOR_TO_FLOOR - LEVELS.SLAB;
}

// ---- Section ------------------------------------------------------------- //

export type SectionCell = {
  u0: number; // left position along the section (metres)
  u1: number;
  floor: number;
  label: string;
  type: string;
};

export type SectionModel = {
  cutAxis: "x" | "y"; // the section is a vertical plane at constant y (x-axis section) or constant x
  cutAt: number; // the constant coordinate of the cut plane
  span: number; // visible width of the section
  origin: number; // u origin (footprint min along the section axis)
  floors: number[];
  cells: SectionCell[]; // rooms the cut passes through, per floor
};

/**
 * Choose a section cut that passes through the staircase and, ideally, a wet area —
 * exactly where an architect cuts to reveal the most. Returns the rooms the plane
 * intersects (per floor) with their horizontal extent.
 */
export function sectionModel(plan: Plan): SectionModel {
  const fp = buildingFootprint(plan);
  const ground = structuralRooms(plan, 0);
  const stair = ground.find((r) => r.type === "staircase");

  // Cut along the building's longer dimension (an X-axis section if it is wider).
  const cutAxis: "x" | "y" = fp.w >= fp.h ? "x" : "y";
  // Place the cut through the stair centre if we have one, else mid-building.
  let cutAt: number;
  if (stair) {
    const r = bounds(stair.polygon);
    cutAt = cutAxis === "x" ? r.y + r.h / 2 : r.x + r.w / 2;
  } else {
    cutAt = cutAxis === "x" ? fp.y + fp.h / 2 : fp.x + fp.w / 2;
  }

  const span = cutAxis === "x" ? fp.w : fp.h;
  const origin = cutAxis === "x" ? fp.x : fp.y;
  const floors = floorsOf(plan);
  const cells: SectionCell[] = [];

  for (const f of floors) {
    for (const room of structuralRooms(plan, f)) {
      const r = bounds(room.polygon);
      const lo = cutAxis === "x" ? r.y : r.x;
      const hi = cutAxis === "x" ? r.y + r.h : r.x + r.w;
      if (cutAt < lo - 1e-6 || cutAt > hi + 1e-6) continue; // plane misses this room
      const u0 = (cutAxis === "x" ? r.x : r.y) - origin;
      const u1 = u0 + (cutAxis === "x" ? r.w : r.h);
      cells.push({ u0, u1, floor: f, label: roomShort(room.type), type: room.type });
    }
  }
  cells.sort((a, b) => a.floor - b.floor || a.u0 - b.u0);
  return { cutAxis, cutAt, span, origin, floors, cells };
}

export function roomShort(type: string): string {
  const map: Record<string, string> = {
    living: "Living",
    master_bedroom: "Master",
    bedroom: "Bedroom",
    childrens_bedroom: "Bedroom",
    kitchen: "Kitchen",
    dining: "Dining",
    pooja: "Pooja",
    toilet: "Toilet",
    bathroom: "Bath",
    staircase: "Stair",
    entrance: "Foyer",
    utility: "Utility",
    study: "Study",
    store: "Store",
    sitout: "Sit-out",
  };
  return map[type] ?? type.replace(/_/g, " ");
}
