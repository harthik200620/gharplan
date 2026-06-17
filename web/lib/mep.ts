// Derive an indicative MEP (plumbing + electrical) coordination model from a Plan,
// the way a services engineer marks up an architect's floor plan: fixtures sit just
// inside the wet-room exterior wall, drains fall to a single service shaft, electrical
// points follow per-room schedules, and conduits run back to one distribution board.
//
// Pure functions only — no React, no DOM. Coordinates are in METRES; origin = plot SW
// corner, +x = East, +y = North (same convention as lib/cad.ts).

import type { Plan, Room } from "@gharplan/shared";
import { bounds, buildingFootprint, exteriorEdges, placeOpenings, type Edge, type PlacedOpening, type Rect } from "./cad";

// --------------------------------------------------------------------------- //
// Room classification
// --------------------------------------------------------------------------- //

const WET = /toilet|bath|kitchen|utility|wash/;
const VIRTUAL = new Set(["overhead_tank", "borewell", "brahmasthan"]);

export function isWet(type: string): boolean {
  return WET.test(type);
}

export function floorRooms(plan: Plan, floor?: number): Room[] {
  return plan.rooms.filter(
    (r) => !VIRTUAL.has(r.type) && (floor === undefined || (r.floor ?? 0) === floor),
  );
}

function center(room: Room): [number, number] {
  const r = bounds(room.polygon);
  return [room.centroid?.[0] ?? r.x + r.w / 2, room.centroid?.[1] ?? r.y + r.h / 2];
}

// --------------------------------------------------------------------------- //
// Model types
// --------------------------------------------------------------------------- //

export type FixtureKind = "wc" | "basin" | "shower" | "sink" | "floor_drain" | "washing_machine";

export type Fixture = {
  id: string;
  roomId: string;
  kind: FixtureKind;
  x: number;
  y: number;
};

/** A plumbing service class — drives line colour, style and weight in the legend. */
export type ServiceKind = "cold" | "hot" | "soil" | "waste" | "vent" | "rainwater";

export type PipeRun = {
  id: string;
  roomId: string;
  service: ServiceKind;
  /** Manhattan polyline, metres, [x,y] points. */
  points: [number, number][];
  /** Nominal bore in mm, e.g. 100 for WC soil. */
  sizeMm: number;
  /** Drains carry a fall annotation, supplies do not. */
  slope?: string;
  label?: string;
};

export type ElectricalKind =
  | "light"
  | "fan"
  | "socket6a"
  | "socket16a"
  | "ac"
  | "exhaust"
  | "geyser"
  | "switchboard"
  | "db"
  | "bell";

export type ElecPoint = {
  id: string;
  roomId: string;
  kind: ElectricalKind;
  x: number;
  y: number;
  /** Final sub-circuit this point sits on (lighting / power / kitchen / AC / geyser / pump). */
  circuit?: string;
};

/** A whole-house services node drawn as a labelled symbol: the overhead tank, the
 *  underground sump + pump, the energy meter, the drainage inspection chamber, the
 *  septic tank, and the rainwater-harvesting pit — the fixed plant a real Indian
 *  house is built around. */
export type MepNodeKind =
  | "oht"        // overhead tank on the roof (SW), gravity down-take
  | "sump"       // underground water sump (NE)
  | "pump"       // sump → OHT pump
  | "meter"      // energy meter at the compound entry
  | "inspection" // drainage inspection chamber
  | "septic"     // septic tank / sewer connection
  | "rainpit";   // rainwater-harvesting recharge pit

export type MepNode = {
  id: string;
  kind: MepNodeKind;
  x: number;
  y: number;
  label: string;
};

/** A final electrical sub-circuit off the DB, with its protective MCB rating. */
export type Circuit = {
  id: string;
  name: string;
  mcbA: number;
  phase: "1ph" | "3ph";
  points: number;
};

export type Conduit = {
  id: string;
  roomId: string;
  /** switchboard → DB, Manhattan polyline. */
  points: [number, number][];
};

export type Clash = {
  id: string;
  ruleId: string;
  severity: "error" | "warn";
  message: string;
};

export type ServiceLegendItem = {
  service: ServiceKind;
  label: string;
  color: string;
  dash?: string;
  width: number;
};

export type MepModel = {
  floor?: number;
  rooms: Room[];
  wetRooms: Room[];
  fixtures: Fixture[];
  shaft: Rect | null;
  pipes: PipeRun[];
  elec: ElecPoint[];
  conduits: Conduit[];
  db: ElecPoint | null;
  /** Whole-house plant: OHT, sump, pump, meter, inspection chamber, septic, rain pit. */
  nodes: MepNode[];
  /** Final electrical sub-circuits off the DB with their MCB ratings. */
  circuits: Circuit[];
  clashes: Clash[];
  summary: { errors: number; warns: number };
  legend: ServiceLegendItem[];
};

// --------------------------------------------------------------------------- //
// Service render styles (the plumbing legend)
// --------------------------------------------------------------------------- //

export const SERVICE_STYLE: Record<ServiceKind, ServiceLegendItem> = {
  cold: { service: "cold", label: "Cold supply", color: "#2563eb", width: 0.05 },
  hot: { service: "hot", label: "Hot supply", color: "#dc2626", width: 0.05 },
  soil: { service: "soil", label: "Soil (WC)", color: "#7c4a1e", width: 0.1 },
  waste: { service: "waste", label: "Waste", color: "#15803d", dash: "0.22 0.14", width: 0.06 },
  vent: { service: "vent", label: "Vent", color: "#0891b2", dash: "0.1 0.12", width: 0.035 },
  rainwater: { service: "rainwater", label: "Rainwater", color: "#7c3aed", width: 0.06 },
};

const SUPPLY_MAIN_MM = 25;
const SUPPLY_BRANCH_MM = 15;

// --------------------------------------------------------------------------- //
// Fixtures — placed just inside the wet room's exterior wall
// --------------------------------------------------------------------------- //

const INSET = 0.4; // metres in from the chosen wall

/** Pick the exterior wall for a wet room (prefer a real exterior edge; else nearest footprint edge). */
function wetWall(r: Rect, fp: Rect): Edge {
  const ext = exteriorEdges(r, fp);
  const order: Edge[] = ["S", "W", "E", "N"]; // drainage prefers the lower/utility side
  const exterior = order.find((e) => ext[e]);
  if (exterior) return exterior;
  // landlocked wet room: drop toward the nearest building-footprint edge
  const dl = r.x - fp.x;
  const dr = fp.x + fp.w - (r.x + r.w);
  const db = r.y - fp.y;
  const dt = fp.y + fp.h - (r.y + r.h);
  const min = Math.min(dl, dr, db, dt);
  if (min === db) return "S";
  if (min === dl) return "W";
  if (min === dr) return "E";
  return "N";
}

/** Spread n fixture positions along the chosen wall, INSET in from it. */
function alongWall(r: Rect, edge: Edge, n: number): [number, number][] {
  const pts: [number, number][] = [];
  const horiz = edge === "N" || edge === "S";
  const lo = horiz ? r.x : r.y;
  const span = horiz ? r.w : r.h;
  // keep fixtures off the corners
  const usable = Math.max(0.1, span - 0.6);
  const start = lo + 0.3;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const u = start + t * usable;
    if (horiz) {
      const y = edge === "S" ? r.y + INSET : r.y + r.h - INSET;
      pts.push([u, y]);
    } else {
      const x = edge === "W" ? r.x + INSET : r.x + r.w - INSET;
      pts.push([x, u]);
    }
  }
  return pts;
}

function fixturesFor(room: Room, fp: Rect): Fixture[] {
  const r = bounds(room.polygon);
  if (r.w < 0.6 || r.h < 0.6) return [];
  const edge = wetWall(r, fp);
  // a rear "utility / wash" balcony plumbs like a wash area even though it's typed balcony
  const t = /utility|wash/.test(room.id) ? "utility" : room.type;
  let kinds: FixtureKind[];
  if (/toilet|bath/.test(t)) kinds = ["wc", "basin", "shower"];
  else if (/kitchen/.test(t)) kinds = ["sink"];
  else if (/utility|wash/.test(t)) kinds = ["washing_machine", "floor_drain"];
  else kinds = ["floor_drain"];

  const pts = alongWall(r, edge, kinds.length);
  return kinds.map((kind, i) => ({
    id: `fx-${room.id}-${kind}`,
    roomId: room.id,
    kind,
    x: pts[i][0],
    y: pts[i][1],
  }));
}

/** Soil/waste size by the fixture it serves (mm). */
function drainSize(kind: FixtureKind): { service: ServiceKind; mm: number } {
  switch (kind) {
    case "wc":
      return { service: "soil", mm: 100 };
    case "basin":
      return { service: "waste", mm: 40 };
    case "sink":
      return { service: "waste", mm: 50 };
    case "shower":
    case "floor_drain":
    case "washing_machine":
      return { service: "waste", mm: 75 };
  }
}

// --------------------------------------------------------------------------- //
// Plumbing shaft + routing
// --------------------------------------------------------------------------- //

const SHAFT_W = 0.5;
const SHAFT_H = 0.6;

/** One service shaft near the centroid of wet-room centres, snapped just inside a wall. */
function computeShaft(wetRooms: Room[], W: number, D: number): Rect | null {
  if (!wetRooms.length) return null;
  let cx = 0;
  let cy = 0;
  for (const room of wetRooms) {
    const c = center(room);
    cx += c[0];
    cy += c[1];
  }
  cx /= wetRooms.length;
  cy /= wetRooms.length;

  // snap to the nearest plot wall, keeping the box fully inside
  const dl = cx;
  const dr = W - cx;
  const db = cy;
  const dt = D - cy;
  const min = Math.min(dl, dr, db, dt);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  let x: number;
  let y: number;
  if (min === dl) {
    x = 0.05;
    y = clamp(cy - SHAFT_H / 2, 0.05, D - SHAFT_H - 0.05);
  } else if (min === dr) {
    x = W - SHAFT_W - 0.05;
    y = clamp(cy - SHAFT_H / 2, 0.05, D - SHAFT_H - 0.05);
  } else if (min === db) {
    x = clamp(cx - SHAFT_W / 2, 0.05, W - SHAFT_W - 0.05);
    y = 0.05;
  } else {
    x = clamp(cx - SHAFT_W / 2, 0.05, W - SHAFT_W - 0.05);
    y = D - SHAFT_H - 0.05;
  }
  return { x, y, w: SHAFT_W, h: SHAFT_H };
}

function shaftPort(shaft: Rect): [number, number] {
  return [shaft.x + shaft.w / 2, shaft.y + shaft.h / 2];
}

/** Manhattan route: fixture → horizontal → vertical → shaft (horizontal leg first). */
function manhattan(from: [number, number], to: [number, number]): [number, number][] {
  return [from, [to[0], from[1]], to];
}

function buildPlumbing(
  wetRooms: Room[],
  fixtures: Fixture[],
  shaft: Rect | null,
): PipeRun[] {
  if (!shaft) return [];
  const port = shaftPort(shaft);
  const runs: PipeRun[] = [];
  const byRoom = new Map<string, Fixture[]>();
  for (const f of fixtures) {
    const arr = byRoom.get(f.roomId) ?? [];
    arr.push(f);
    byRoom.set(f.roomId, arr);
  }

  for (const room of wetRooms) {
    const fxs = byRoom.get(room.id) ?? [];
    // DRAIN per fixture: fall to the shaft, sized by fixture, slope 1:40 toward shaft.
    for (const f of fxs) {
      const { service, mm } = drainSize(f.kind);
      runs.push({
        id: `drain-${f.id}`,
        roomId: room.id,
        service,
        points: manhattan([f.x, f.y], port),
        sizeMm: mm,
        slope: "1:40",
        label: `${mm}∅`,
      });
    }
    // SUPPLY branch: shaft → room (cold; a hot tap-off accompanies bath/kitchen).
    const c = center(room);
    runs.push({
      id: `cold-${room.id}`,
      roomId: room.id,
      service: "cold",
      points: manhattan(port, [c[0], c[1]]),
      sizeMm: SUPPLY_BRANCH_MM,
      label: `${SUPPLY_BRANCH_MM}∅`,
    });
    if (/toilet|bath|kitchen/.test(room.type)) {
      runs.push({
        id: `hot-${room.id}`,
        roomId: room.id,
        service: "hot",
        points: manhattan([port[0], port[1] + 0.1], [c[0], c[1] + 0.12]),
        sizeMm: SUPPLY_BRANCH_MM,
        label: `${SUPPLY_BRANCH_MM}∅`,
      });
    }
    // VENT stack riser at the shaft for the soil line.
    if (fxs.some((f) => f.kind === "wc")) {
      runs.push({
        id: `vent-${room.id}`,
        roomId: room.id,
        service: "vent",
        points: [
          [port[0] + 0.12, port[1]],
          [port[0] + 0.12, port[1] - 0.5],
        ],
        sizeMm: 50,
      });
    }
  }
  return runs;
}

// --------------------------------------------------------------------------- //
// Electrical schedule
// --------------------------------------------------------------------------- //

type ElecSpec = Partial<Record<ElectricalKind, number>>;

const ELEC_SCHEDULE: Record<string, ElecSpec> = {
  living: { light: 3, fan: 2, socket6a: 4, socket16a: 2, ac: 1 },
  master_bedroom: { light: 2, fan: 1, socket6a: 3, ac: 1 },
  bedroom: { light: 2, fan: 1, socket6a: 3, ac: 1 },
  childrens_bedroom: { light: 2, fan: 1, socket6a: 3, ac: 1 },
  kitchen: { light: 2, socket6a: 4, socket16a: 3, exhaust: 1 },
  dining: { light: 1, fan: 1, socket6a: 2 },
  toilet: { light: 1, exhaust: 1, geyser: 1 },
  bathroom: { light: 1, exhaust: 1, geyser: 1 },
  pooja: { light: 1 },
  study: { light: 2, fan: 1, socket6a: 2 },
  balcony: { light: 1 },
  sitout: { light: 1 },
  staircase: { light: 1 },
  entrance: { light: 1, bell: 1 },
};

/** Spread n points along an interior wall, ~0.3 m in from it. */
function spread(r: Rect, n: number): [number, number][] {
  const pts: [number, number][] = [];
  const y = r.y + 0.3; // south interior wall band
  const usable = Math.max(0.1, r.w - 0.6);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    pts.push([r.x + 0.3 + t * usable, y]);
  }
  return pts;
}

function elecFor(room: Room, door: PlacedOpening | undefined): ElecPoint[] {
  // the rear utility/wash balcony gets a light + a 16A point for the washing machine
  const spec = /utility|wash/.test(room.id) ? { light: 1, socket16a: 1 } : ELEC_SCHEDULE[room.type];
  if (!spec) return [];
  const r = bounds(room.polygon);
  const c = center(room);
  const out: ElecPoint[] = [];
  const push = (kind: ElectricalKind, x: number, y: number) =>
    out.push({ id: `e-${room.id}-${kind}-${out.length}`, roomId: room.id, kind, x, y });

  // ceiling fixtures cluster at the centroid (fan slightly offset from lights)
  const nLight = spec.light ?? 0;
  for (let i = 0; i < nLight; i++) {
    const off = nLight === 1 ? 0 : (i - (nLight - 1) / 2) * Math.min(0.6, r.w / (nLight + 1));
    push("light", c[0] + off, c[1] + (i % 2 ? 0.18 : -0.18));
  }
  for (let i = 0; i < (spec.fan ?? 0); i++) push("fan", c[0], c[1]);

  // wall sockets spread along an interior wall
  const sockets: ElectricalKind[] = [
    ...Array(spec.socket6a ?? 0).fill("socket6a"),
    ...Array(spec.socket16a ?? 0).fill("socket16a"),
  ];
  const sp = spread(r, sockets.length);
  sockets.forEach((kind, i) => push(kind, sp[i][0], sp[i][1]));

  // AC high on an exterior-ish wall (top of room)
  for (let i = 0; i < (spec.ac ?? 0); i++) push("ac", r.x + r.w - 0.5, r.y + r.h - 0.3);
  // exhaust / geyser in wet rooms — near the centroid-top
  for (let i = 0; i < (spec.exhaust ?? 0); i++) push("exhaust", r.x + r.w - 0.35, r.y + r.h - 0.35);
  for (let i = 0; i < (spec.geyser ?? 0); i++) push("geyser", r.x + 0.35, r.y + r.h - 0.35);
  for (let i = 0; i < (spec.bell ?? 0); i++) push("bell", c[0], r.y + r.h - 0.3);

  // switchboard at the door's latch side
  if (door) {
    const horiz = door.edge === "N" || door.edge === "S";
    const latchOff = 0.35;
    let sx = door.cx;
    let sy = door.cy;
    if (horiz) {
      sx = door.cx + door.len / 2 + latchOff * 0.6;
      sy = door.edge === "S" ? door.cy + 0.25 : door.cy - 0.25;
    } else {
      sy = door.cy + door.len / 2 + latchOff * 0.6;
      sx = door.edge === "W" ? door.cx + 0.25 : door.cx - 0.25;
    }
    // keep inside the room
    sx = Math.max(r.x + 0.15, Math.min(r.x + r.w - 0.15, sx));
    sy = Math.max(r.y + 0.15, Math.min(r.y + r.h - 0.15, sy));
    push("switchboard", sx, sy);
  }
  return out;
}

/** Place ONE main DB near the front entrance (entrance room, else living), avoiding wet rooms. */
function placeDb(rooms: Room[]): ElecPoint | null {
  const host =
    rooms.find((r) => r.type === "entrance" && !isWet(r.type)) ??
    rooms.find((r) => r.type === "living") ??
    rooms.find((r) => !isWet(r.type) && r.type !== "staircase");
  if (!host) return null;
  const r = bounds(host.polygon);
  // tuck the DB near the entry-side wall (south band of the host room)
  return {
    id: "db-main",
    roomId: host.id,
    kind: "db",
    x: r.x + Math.min(0.6, r.w / 2),
    y: r.y + 0.4,
  };
}

function buildConduits(elec: ElecPoint[], db: ElecPoint | null): Conduit[] {
  if (!db) return [];
  const boards = elec.filter((p) => p.kind === "switchboard");
  return boards.map((b) => ({
    id: `cd-${b.roomId}`,
    roomId: b.roomId,
    points: manhattan([b.x, b.y], [db.x, db.y]),
  }));
}

// --------------------------------------------------------------------------- //
// Clash checks
// --------------------------------------------------------------------------- //

function pointInRect(x: number, y: number, r: Rect, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** Distance from a point to a door's clear opening segment, in metres. */
function doorClearance(px: number, py: number, door: PlacedOpening): number {
  const half = door.len / 2;
  const horiz = door.edge === "N" || door.edge === "S";
  const a: [number, number] = horiz ? [door.cx - half, door.cy] : [door.cx, door.cy - half];
  const b: [number, number] = horiz ? [door.cx + half, door.cy] : [door.cx, door.cy + half];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function computeClashes(
  plan: Plan,
  floor: number | undefined,
  wetRooms: Room[],
  fixtures: Fixture[],
  db: ElecPoint | null,
  elec: ElecPoint[],
  doors: PlacedOpening[],
): Clash[] {
  const out: Clash[] = [];

  // 1) DB inside / over a wet room
  if (db) {
    const over = wetRooms.find((r) => pointInRect(db.x, db.y, bounds(r.polygon)));
    if (over) {
      out.push({
        id: "clash-db-wet",
        ruleId: "DB_IN_WET",
        severity: "error",
        message: "Distribution board sits in/over a wet area.",
      });
    }
  }

  // 2) Multifloor: upper-floor wet room not stacked over a wet room below (~0.5 m)
  if (floor !== undefined && floor > 0) {
    const below = plan.rooms.filter((r) => (r.floor ?? 0) === floor - 1 && isWet(r.type));
    for (const room of wetRooms) {
      const c = center(room);
      const stacked = below.some((b) => {
        const bc = center(b);
        return Math.hypot(bc[0] - c[0], bc[1] - c[1]) <= 0.5;
      });
      if (!stacked) {
        out.push({
          id: `clash-stack-${room.id}`,
          ruleId: "WET_NOT_STACKED",
          severity: "warn",
          message: "Wet area not stacked over the floor below.",
        });
      }
    }
  }

  // 3) switchboard within a door's swing
  const doorByRoom = new Map(doors.filter((d) => d.kind === "door").map((d) => [d.roomId, d]));
  for (const p of elec) {
    if (p.kind !== "switchboard") continue;
    const door = doorByRoom.get(p.roomId);
    if (!door) continue;
    // swing radius ≈ leaf width; flag if the board falls within the quarter-disc
    if (doorClearance(p.x, p.y, door) <= door.len * 0.9) {
      out.push({
        id: `clash-swb-${p.roomId}`,
        ruleId: "SWB_IN_SWING",
        severity: "warn",
        message: "Switchboard falls within a door swing.",
      });
    }
  }

  // 4) fixture overlapping a door opening clearance
  for (const f of fixtures) {
    const door = doorByRoom.get(f.roomId);
    if (!door) continue;
    if (doorClearance(f.x, f.y, door) <= 0.45) {
      out.push({
        id: `clash-fx-${f.id}`,
        ruleId: "FIXTURE_AT_DOOR",
        severity: "warn",
        message: "Fixture encroaches on a door opening.",
      });
    }
  }

  return out;
}

// --------------------------------------------------------------------------- //
// Whole-house services: overhead tank + sump + pump, drainage outlet, rainwater
// --------------------------------------------------------------------------- //

const DOWNTAKE_MM = 32; // OHT gravity down-take main
const PUMP_RISER_MM = 25; // sump → OHT delivery
const SOIL_MAIN_MM = 110; // shaft → inspection chamber → septic
const RWP_MM = 75; // rainwater downpipe

function clampPt(p: [number, number], W: number, D: number): [number, number] {
  return [Math.max(0.2, Math.min(W - 0.2, p[0])), Math.max(0.2, Math.min(D - 0.2, p[1]))];
}

/** Water supply the Indian way: municipal/borewell → underground SUMP (NE) → PUMP
 *  lifts to the OVERHEAD TANK on the roof (SW) → a gravity DOWN-TAKE main feeds the
 *  shaft manifold, where the per-room cold branches tap off. */
function buildWaterSource(fp: Rect | null, shaft: Rect | null, W: number, D: number): { nodes: MepNode[]; pipes: PipeRun[] } {
  if (!fp) return { nodes: [], pipes: [] };
  const oht = clampPt([fp.x + 0.8, fp.y + 0.8], W, D); // SW (Vastu: tank SW)
  const sump = clampPt([fp.x + fp.w - 0.8, fp.y + fp.h - 0.8], W, D); // NE (Vastu: water NE)
  const pump = clampPt([sump[0] - 1.1, sump[1]], W, D);
  const nodes: MepNode[] = [
    { id: "oht", kind: "oht", x: oht[0], y: oht[1], label: "OHT 1000L" },
    { id: "sump", kind: "sump", x: sump[0], y: sump[1], label: "Sump" },
    { id: "pump", kind: "pump", x: pump[0], y: pump[1], label: "Pump" },
  ];
  const pipes: PipeRun[] = [
    { id: "supply-riser", roomId: "service", service: "cold", points: [sump, pump, [pump[0], oht[1]], oht], sizeMm: PUMP_RISER_MM, label: `${PUMP_RISER_MM}∅` },
  ];
  if (shaft) {
    const port = shaftPort(shaft);
    pipes.push({ id: "downtake", roomId: "service", service: "cold", points: [oht, [oht[0], port[1]], port], sizeMm: DOWNTAKE_MM, label: `${DOWNTAKE_MM}∅` });
  }
  return { nodes, pipes };
}

/** Drainage outlet: soil/waste gathered at the shaft runs to an INSPECTION CHAMBER
 *  just outside, then to the SEPTIC TANK / sewer at the plot edge (110 mm, 1:40). */
function buildDrainageOutlet(fp: Rect | null, shaft: Rect | null, W: number, D: number): { nodes: MepNode[]; pipes: PipeRun[] } {
  if (!shaft || !fp) return { nodes: [], pipes: [] };
  const port = shaftPort(shaft);
  const fcx = fp.x + fp.w / 2;
  const fcy = fp.y + fp.h / 2;
  let dx = port[0] - fcx;
  let dy = port[1] - fcy;
  const m = Math.hypot(dx, dy) || 1;
  dx /= m;
  dy /= m;
  const ic = clampPt([port[0] + dx * 0.8, port[1] + dy * 0.8], W, D);
  const septic = clampPt([port[0] + dx * 2.2, port[1] + dy * 2.2], W, D);
  const nodes: MepNode[] = [
    { id: "ic", kind: "inspection", x: ic[0], y: ic[1], label: "IC" },
    { id: "septic", kind: "septic", x: septic[0], y: septic[1], label: "Septic" },
  ];
  const pipes: PipeRun[] = [
    { id: "soil-outlet", roomId: "service", service: "soil", points: [port, ic, septic], sizeMm: SOIL_MAIN_MM, slope: "1:40", label: `${SOIL_MAIN_MM}∅` },
  ];
  return { nodes, pipes };
}

/** Rainwater: downpipes at the two front building corners carry roof run-off to a
 *  recharge PIT (rainwater harvesting), as required by most Indian municipalities. */
function buildRainwater(fp: Rect | null, W: number, D: number): { nodes: MepNode[]; pipes: PipeRun[] } {
  if (!fp) return { nodes: [], pipes: [] };
  const pit = clampPt([fp.x + fp.w + 0.5, fp.y - 0.4], W, D);
  const corners: [number, number][] = [
    [fp.x + 0.15, fp.y + 0.15],
    [fp.x + fp.w - 0.15, fp.y + 0.15],
  ];
  const nodes: MepNode[] = [{ id: "rainpit", kind: "rainpit", x: pit[0], y: pit[1], label: "RWH pit" }];
  const pipes: PipeRun[] = corners.map((c, i) => ({
    id: `rwp-${i}`,
    roomId: "service",
    service: "rainwater" as ServiceKind,
    points: [c, [c[0], pit[1]], pit],
    sizeMm: RWP_MM,
    label: `${RWP_MM}∅`,
  }));
  return { nodes, pipes };
}

/** Tag every electrical point with its final sub-circuit and return the circuit
 *  schedule (lighting / power / kitchen / AC / geyser / pump) with MCB ratings —
 *  the way an Indian DB is actually loaded. */
function assignCircuits(elec: ElecPoint[]): Circuit[] {
  const circuitOf = (p: ElecPoint): string => {
    switch (p.kind) {
      case "light":
      case "fan":
      case "bell":
      case "exhaust":
        return "Lighting";
      case "socket16a":
        return "Kitchen/Power";
      case "ac":
        return "AC";
      case "geyser":
        return "Geyser";
      default:
        return "Power"; // socket6a etc.
    }
  };
  const counts = new Map<string, number>();
  for (const p of elec) {
    if (p.kind === "switchboard" || p.kind === "db") continue;
    p.circuit = circuitOf(p);
    counts.set(p.circuit, (counts.get(p.circuit) ?? 0) + 1);
  }
  const SPEC: Record<string, { mcbA: number; phase: "1ph" | "3ph" }> = {
    Lighting: { mcbA: 6, phase: "1ph" },
    Power: { mcbA: 16, phase: "1ph" },
    "Kitchen/Power": { mcbA: 20, phase: "1ph" },
    AC: { mcbA: 20, phase: "1ph" },
    Geyser: { mcbA: 16, phase: "1ph" },
    Pump: { mcbA: 16, phase: "1ph" },
  };
  const order = ["Lighting", "Power", "Kitchen/Power", "AC", "Geyser", "Pump"];
  return order
    .filter((n) => (counts.get(n) ?? 0) > 0 || n === "Pump")
    .map((n) => ({ id: `ckt-${n}`, name: n, mcbA: SPEC[n].mcbA, phase: SPEC[n].phase, points: counts.get(n) ?? (n === "Pump" ? 1 : 0) }));
}

// --------------------------------------------------------------------------- //
// Public entry point
// --------------------------------------------------------------------------- //

export function buildMepModel(plan: Plan, floor?: number): MepModel {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const fp = buildingFootprint(plan, floor);
  const rooms = floorRooms(plan, floor);
  const wetRooms = rooms.filter((r) => isWet(r.type) || /utility|wash/.test(r.id));

  const fixtures = wetRooms.flatMap((r) => fixturesFor(r, fp));
  const shaft = computeShaft(wetRooms, W, D);
  const pipes = buildPlumbing(wetRooms, fixtures, shaft);

  // whole-house plant + mains: OHT down-take, sump + pump, drainage outlet to the
  // septic tank, and rainwater downpipes to a recharge pit.
  const water = buildWaterSource(fp, shaft, W, D);
  const drain = buildDrainageOutlet(fp, shaft, W, D);
  const rain = buildRainwater(fp, W, D);
  const nodes: MepNode[] = [...water.nodes, ...drain.nodes, ...rain.nodes];
  pipes.push(...water.pipes, ...drain.pipes, ...rain.pipes);

  // door placements for this floor (latch-side switchboards + clash geometry)
  const placed = placeOpenings(plan);
  const roomIds = new Set(rooms.map((r) => r.id));
  const floorDoors = placed.filter((o) => roomIds.has(o.roomId));
  const doorByRoom = new Map(
    floorDoors.filter((d) => d.kind === "door").map((d) => [d.roomId, d]),
  );

  const elec = rooms.flatMap((r) => elecFor(r, doorByRoom.get(r.id)));
  const db = placeDb(rooms);
  if (db) elec.push(db);
  const conduits = buildConduits(elec, db);
  // energy meter at the entry; the metered service main runs meter → DB.
  if (db) {
    const meter = clampPt([db.x, db.y - 0.9], W, D);
    nodes.push({ id: "meter", kind: "meter", x: meter[0], y: meter[1], label: "Meter" });
    conduits.push({ id: "cd-main", roomId: "service", points: [meter, [db.x, db.y]] });
  }
  const circuits = assignCircuits(elec);

  const clashes = computeClashes(plan, floor, wetRooms, fixtures, db, elec, floorDoors);
  const summary = {
    errors: clashes.filter((c) => c.severity === "error").length,
    warns: clashes.filter((c) => c.severity === "warn").length,
  };

  // legend lists only the services that actually appear, in a stable order
  const used = new Set(pipes.map((p) => p.service));
  const order: ServiceKind[] = ["cold", "hot", "soil", "waste", "vent", "rainwater"];
  const legend = order.filter((s) => used.has(s)).map((s) => SERVICE_STYLE[s]);

  return {
    floor,
    rooms,
    wetRooms,
    fixtures,
    shaft,
    pipes,
    elec,
    conduits,
    db,
    nodes,
    circuits,
    clashes,
    summary,
    legend,
  };
}

/** Pipe-size reference used for supply mains (exported for callers/tests). */
export const SUPPLY_MAIN = SUPPLY_MAIN_MM;
