"use client";

import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Sky } from "@react-three/drei";
import type { Plan, Room } from "@gharplan/shared";
import {
  bounds,
  buildingFootprint,
  exteriorEdges,
  placeOpenings,
  type Edge,
  type PlacedOpening,
  type Rect,
} from "@/lib/cad";

// Levels (metres) — kept in step with the engine drawing levels.
const WALL_H = 2.75; // clear room height
const FLOOR_TO_FLOOR = 3.0;
const SLAB = 0.2; // structural slab shown between floors / at roof
const PARAPET = 0.9;
const SILL = 0.9;
const SILL_WET = 1.2;
const LINTEL = 2.1;
const WALL_T = 0.1;
const FLOOR_Y = 0.05; // floor finish thickness
const PLINTH_H = 0.45; // projecting base course at ground level
const CHAJJA_PROJ = 0.5; // sunshade projection past the wall face
const CHAJJA_T = 0.08; // sunshade slab thickness

// material colours — warm Indian-render palette
const PLASTER_EXT = "#efe7d6"; // warm off-white exterior render
const PLASTER_INT = "#f5f2ec"; // lighter interior
const PLINTH_COL = "#8d8175"; // darker plinth / base course
const CONCRETE = "#d6d2c8"; // RCC slabs / chajja
const FRAME_COL = "#5a5550"; // window/door frame (dark anodised)
const GLASS_COL = "#9fc6d4"; // tinted glazing
const DOOR_MAIN = "#6e4a2b"; // teak main door
const DOOR_INT = "#c7b299"; // light internal door
const TANK_COL = "#1f1f22"; // black Sintex tank

const WET = /toilet|bath|kitchen|utility|wash/;
const VIRTUAL = new Set(["overhead_tank", "borewell", "brahmasthan"]);
const SITE_TYPES = new Set(["parking", "sitout", "courtyard", "garden", "service_shaft", "future_expansion", "balcony"]);

// professional, muted material palette by room family
function floorColor(type: string): string {
  if (type === "parking") return "#cbd5e1";
  if (type === "sitout" || type === "balcony") return "#f4d7a1";
  if (type === "courtyard" || type === "garden") return "#a7d8aa";
  if (type === "service_shaft") return "#bfdbfe";
  if (type === "future_expansion") return "#ddd6fe";
  if (type === "kitchen" || type === "toilet" || type === "bathroom" || type === "utility") return "#d7dde3";
  if (type.includes("bedroom")) return "#cdb091";
  if (type === "pooja") return "#e8d6a8";
  if (type === "staircase") return "#c4cad2";
  return "#ece5d8"; // living / dining / foyer — marble
}

function floorsOf(plan: Plan): number[] {
  return Array.from(new Set(plan.rooms.map((r) => r.floor ?? 0))).sort((a, b) => a - b);
}

function footprint(rooms: Room[]): Rect | null {
  const built = rooms.filter((r) => !VIRTUAL.has(r.type) && !SITE_TYPES.has(r.type));
  if (!built.length) return null;
  const pts = built.flatMap((r) => r.polygon);
  return bounds(pts);
}

type Box = { pos: [number, number, number]; size: [number, number, number] };
// glass bands carry their plan rect so the renderer can mullion them + add a chajja
type GlassPart = Box & { horiz: boolean; fixed: number; exterior: boolean; sill: number };
// door bands carry hinge geometry so the renderer can swing a leaf open
type DoorPart = { horiz: boolean; fixed: number; s: number; e: number; main: boolean };
type Band = { p0: number; p1: number; y0: number; y1: number; kind: "wall" | "glass" };
type EdgeOpening = { s: number; e: number; sill: number; lintel: number; kind: "door" | "window" };

/** Split one wall edge into vertical bands, cutting doorways (open to lintel) and
 *  windows (glazed sill→lintel, solid below & above). */
function edgeBands(a: number, b: number, openings: EdgeOpening[]): Band[] {
  const ops = openings
    .map((o) => ({ ...o, s: Math.max(o.s, a), e: Math.min(o.e, b) }))
    .filter((o) => o.e - o.s > 0.05)
    .sort((p, q) => p.s - q.s);

  const bands: Band[] = [];
  let cursor = a;
  for (const o of ops) {
    if (o.s > cursor) bands.push({ p0: cursor, p1: o.s, y0: 0, y1: WALL_H, kind: "wall" });
    if (o.kind === "window") {
      if (o.sill > 0) bands.push({ p0: o.s, p1: o.e, y0: 0, y1: o.sill, kind: "wall" });
      bands.push({ p0: o.s, p1: o.e, y0: o.sill, y1: o.lintel, kind: "glass" });
      bands.push({ p0: o.s, p1: o.e, y0: o.lintel, y1: WALL_H, kind: "wall" });
    } else {
      // door: open from floor to lintel, masonry header above
      bands.push({ p0: o.s, p1: o.e, y0: o.lintel, y1: WALL_H, kind: "wall" });
    }
    cursor = Math.max(cursor, o.e);
  }
  if (cursor < b) bands.push({ p0: cursor, p1: b, y0: 0, y1: WALL_H, kind: "wall" });
  return bands.filter((bd) => bd.p1 - bd.p0 > 0.04 && bd.y1 - bd.y0 > 0.02);
}

function buildWallParts(room: Room, openings: PlacedOpening[], W: number, D: number, fp: Rect, mainEntry: boolean) {
  const walls: Box[] = [];
  const glass: GlassPart[] = [];
  const doors: DoorPart[] = [];
  if (SITE_TYPES.has(room.type)) return { walls, glass, doors };
  const r = bounds(room.polygon);
  const wet = WET.test(room.type);
  const sill = wet ? SILL_WET : SILL;
  const ext = exteriorEdges(r, fp);
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;

  const mine = openings.filter((o) => o.roomId === room.id);
  const onEdge = (e: Edge): EdgeOpening[] =>
    mine
      .filter((o) => o.edge === e)
      .map((o) => {
        const c = e === "N" || e === "S" ? o.cx : o.cy;
        return {
          s: c - o.len / 2,
          e: c + o.len / 2,
          sill: o.kind === "window" ? sill : 0,
          lintel: LINTEL,
          kind: o.kind,
        };
      });

  const emit = (band: Band, horiz: boolean, fixed: number, exterior: boolean) => {
    const len = band.p1 - band.p0;
    const mid = (band.p0 + band.p1) / 2;
    const h = band.y1 - band.y0;
    const yc = FLOOR_Y + (band.y0 + band.y1) / 2;
    if (band.kind === "glass") {
      const box: Box = horiz
        ? { pos: [X(mid), yc, Z(fixed)], size: [len, h, WALL_T] }
        : { pos: [X(fixed), yc, Z(mid)], size: [WALL_T, h, len] };
      glass.push({ ...box, horiz, fixed, exterior, sill: band.y0 });
    } else {
      const box: Box = horiz
        ? { pos: [X(mid), yc, Z(fixed)], size: [len, h, WALL_T] }
        : { pos: [X(fixed), yc, Z(mid)], size: [WALL_T, h, len] };
      walls.push(box);
    }
  };

  // record a door opening so a swung leaf + frame can be drawn into the void
  const noteDoors = (e: Edge, fixed: number, horiz: boolean) => {
    for (const o of onEdge(e)) {
      if (o.kind !== "door") continue;
      doors.push({ horiz, fixed, s: o.s, e: o.e, main: mainEntry });
    }
  };

  // horizontal walls (N at top, S at bottom) run along x
  for (const [edge, yPlan] of [["N", r.y + r.h] as const, ["S", r.y] as const]) {
    for (const band of edgeBands(r.x, r.x + r.w, onEdge(edge))) emit(band, true, yPlan, ext[edge]);
    noteDoors(edge, yPlan, true);
  }
  // vertical walls (E at right, W at left) run along y
  for (const [edge, xPlan] of [["E", r.x + r.w] as const, ["W", r.x] as const]) {
    for (const band of edgeBands(r.y, r.y + r.h, onEdge(edge))) emit(band, false, xPlan, ext[edge]);
    noteDoors(edge, xPlan, false);
  }
  return { walls, glass, doors };
}

/** A four-pane glazed window: dark frame border + one horizontal + one vertical
 *  glazing bar, with tinted glass behind. Exterior windows also get a chajja. */
function Window3D({ part, W, D }: { part: GlassPart; W: number; D: number }) {
  const [px, py, pz] = part.pos;
  const [sx, sy, sz] = part.size;
  // span/up = the two in-plane dimensions of the window; depth runs through the wall
  const span = part.horiz ? sx : sz;
  const up = sy;
  const F = 0.05; // frame / mullion thickness
  const paneD = WALL_T * 0.5;

  // glass slightly recessed; frame flush with wall face
  const glass: Box = part.horiz
    ? { pos: [px, py, pz], size: [span - 2 * F, up - 2 * F, paneD] }
    : { pos: [px, py, pz], size: [paneD, up - 2 * F, span - 2 * F] };

  // frame as 4 edges + 2 mullion bars, all on the same in-plane footprint
  const inPlane = (a: number, b: number): [number, number, number] =>
    part.horiz ? [px + a, py + b, pz] : [px, py + b, pz + a];
  const inPlaneSize = (la: number, lb: number): [number, number, number] =>
    part.horiz ? [la, lb, WALL_T + 0.02] : [WALL_T + 0.02, lb, la];

  const bars: Box[] = [
    { pos: inPlane(0, up / 2 - F / 2), size: inPlaneSize(span, F) }, // top
    { pos: inPlane(0, -up / 2 + F / 2), size: inPlaneSize(span, F) }, // bottom
    { pos: inPlane(span / 2 - F / 2, 0), size: inPlaneSize(F, up) }, // right
    { pos: inPlane(-span / 2 + F / 2, 0), size: inPlaneSize(F, up) }, // left
    { pos: inPlane(0, 0), size: inPlaneSize(span, F) }, // horizontal mullion
    { pos: inPlane(0, 0), size: inPlaneSize(F, up) }, // vertical mullion
  ];

  // chajja: thin RCC slab projecting outward over the head, at lintel level
  let chajja: Box | null = null;
  if (part.exterior) {
    const headY = FLOOR_Y + part.sill + up; // top of the glazed band (lintel)
    const outDir = part.horiz ? Math.sign(pz) || 1 : Math.sign(px) || 1;
    const off = WALL_T / 2 + CHAJJA_PROJ / 2;
    chajja = part.horiz
      ? { pos: [px, headY + CHAJJA_T / 2, pz + outDir * off], size: [span + 0.4, CHAJJA_T, CHAJJA_PROJ] }
      : { pos: [px + outDir * off, headY + CHAJJA_T / 2, pz], size: [CHAJJA_PROJ, CHAJJA_T, span + 0.4] };
  }

  return (
    <group>
      <mesh position={glass.pos}>
        <boxGeometry args={glass.size} />
        <meshStandardMaterial color={GLASS_COL} roughness={0.08} metalness={0.2} transparent opacity={0.42} />
      </mesh>
      {bars.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={FRAME_COL} roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
      {chajja && (
        <mesh position={chajja.pos} castShadow receiveShadow>
          <boxGeometry args={chajja.size} />
          <meshStandardMaterial color={CONCRETE} roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

/** A door leaf swung ~20° open inside its opening, with a slim frame. */
function Door3D({ part, W, D }: { part: DoorPart; W: number; D: number }) {
  const width = part.e - part.s;
  if (width < 0.4) return null;
  const mid = (part.s + part.e) / 2;
  const leafH = LINTEL - 0.04;
  const cy = FLOOR_Y + leafH / 2;
  const F = 0.06; // frame thickness
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;

  // hinge at one jamb; rotate the leaf about it so it reads as ajar
  const ajar = (20 * Math.PI) / 180;
  const hingeS = part.s + F;
  const leafW = width - 2 * F;
  const col = part.main ? DOOR_MAIN : DOOR_INT;

  // position of the door group along its wall axis
  const groupPos: [number, number, number] = part.horiz ? [X(mid), 0, Z(part.fixed)] : [X(part.fixed), 0, Z(mid)];
  // frame uprights at both jambs + a head
  const jamb = (a: number): [number, number, number] =>
    part.horiz ? [X(mid + a), cy, Z(part.fixed)] : [X(part.fixed), cy, Z(mid + a)];
  const jambSize: [number, number, number] = part.horiz ? [F, leafH, WALL_T + 0.02] : [WALL_T + 0.02, leafH, F];
  const headSize: [number, number, number] = part.horiz ? [width, F, WALL_T + 0.02] : [WALL_T + 0.02, F, width];

  // leaf pivot — translate to the hinge jamb, rotate, then offset by half-leaf
  const hingeOffset = part.horiz ? X(hingeS) - X(mid) : Z(hingeS) - Z(mid);
  const leafColor = <meshStandardMaterial color={col} roughness={0.7} metalness={0.05} />;

  return (
    <group position={groupPos}>
      {/* frame */}
      <mesh position={[jamb(-width / 2)[0] - groupPos[0], cy, jamb(-width / 2)[2] - groupPos[2]]} castShadow>
        <boxGeometry args={jambSize} />
        <meshStandardMaterial color={FRAME_COL} roughness={0.6} />
      </mesh>
      <mesh position={[jamb(width / 2)[0] - groupPos[0], cy, jamb(width / 2)[2] - groupPos[2]]} castShadow>
        <boxGeometry args={jambSize} />
        <meshStandardMaterial color={FRAME_COL} roughness={0.6} />
      </mesh>
      <mesh position={[0, FLOOR_Y + leafH + F / 2, 0]} castShadow>
        <boxGeometry args={headSize} />
        <meshStandardMaterial color={FRAME_COL} roughness={0.6} />
      </mesh>
      {/* leaf: hinge group at the jamb, leaf box pushed out by half its width */}
      <group
        position={part.horiz ? [hingeOffset, 0, 0] : [0, 0, hingeOffset]}
        rotation={[0, part.horiz ? ajar : -ajar, 0]}
      >
        <mesh position={part.horiz ? [leafW / 2, cy, 0.02] : [0.02, cy, -leafW / 2]} castShadow receiveShadow>
          <boxGeometry args={part.horiz ? [leafW, leafH, 0.05] : [0.05, leafH, leafW]} />
          {leafColor}
        </mesh>
      </group>
    </group>
  );
}

function StairSteps({ room, W, D }: { room: Room; W: number; D: number }) {
  const r = bounds(room.polygon);
  const n = 8;
  const run = (r.h * 0.8) / n;
  const x = r.x + r.w / 2 - W / 2;
  const z0 = D / 2 - (r.y + 0.1);
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => (
        <mesh key={i} position={[x, FLOOR_Y + (i + 0.5) * (WALL_H / n / 1.6), z0 - i * run]} castShadow receiveShadow>
          <boxGeometry args={[Math.min(r.w * 0.7, 1.1), WALL_H / n / 1.6, run]} />
          <meshStandardMaterial color="#b9bec7" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Furniture3D({ room, W, D }: { room: Room; W: number; D: number }) {
  const r = bounds(room.polygon);
  const cx = r.x + r.w / 2 - W / 2;
  const cz = D / 2 - (r.y + r.h / 2);
  const t = room.type;

  if (t === "staircase") return <StairSteps room={room} W={W} D={D} />;

  if (t === "parking") {
    return (
      <group position={[cx, 0, cz]}>
        <mesh position={[0, 0.18 + FLOOR_Y, 0]} castShadow>
          <boxGeometry args={[Math.min(r.w * 0.7, 1.8), 0.35, Math.min(r.h * 0.7, 3.2)]} />
          <meshStandardMaterial color="#64748b" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.42 + FLOOR_Y, 0]} castShadow>
          <boxGeometry args={[Math.min(r.w * 0.58, 1.45), 0.22, Math.min(r.h * 0.42, 1.6)]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.8} />
        </mesh>
      </group>
    );
  }
  if (t === "garden" || t === "courtyard") {
    // trunk + spherical canopy reads as a real tree
    const rad = Math.min(r.w, r.h);
    const canopy = Math.min(Math.max(rad * 0.35, 0.6), 1.4);
    return (
      <group position={[cx, FLOOR_Y, cz]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.13, 1.0, 8]} />
          <meshStandardMaterial color="#6b4f2a" roughness={0.95} />
        </mesh>
        <mesh position={[0, 1.0 + canopy * 0.7, 0]} castShadow receiveShadow>
          <sphereGeometry args={[canopy, 16, 12]} />
          <meshStandardMaterial color="#4d7c2f" roughness={0.95} />
        </mesh>
      </group>
    );
  }

  if (t.includes("bedroom")) {
    const bw = Math.min(r.w * 0.8, t === "master_bedroom" ? 1.8 : 1.5);
    const bl = Math.min(r.h * 0.7, 2.0);
    return (
      <group position={[cx, 0, cz]}>
        <mesh position={[0, 0.28 + FLOOR_Y, 0]} castShadow receiveShadow>
          <boxGeometry args={[bw, 0.45, bl]} />
          <meshStandardMaterial color="#b9c2d2" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.55 + FLOOR_Y, -bl / 2 + 0.18]} castShadow>
          <boxGeometry args={[bw, 0.55, 0.12]} />
          <meshStandardMaterial color="#8a6d4f" roughness={0.7} />
        </mesh>
      </group>
    );
  }
  if (t === "living") {
    return (
      <mesh position={[cx, 0.25 + FLOOR_Y, cz]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(r.w * 0.7, 2.0), 0.5, 0.7]} />
        <meshStandardMaterial color="#7f8aa0" roughness={0.95} />
      </mesh>
    );
  }
  if (t === "dining") {
    return (
      <mesh position={[cx, 0.37 + FLOOR_Y, cz]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(r.w * 0.55, 1.4), 0.05, Math.min(r.h * 0.45, 0.9)]} />
        <meshStandardMaterial color="#9c7a55" roughness={0.6} />
      </mesh>
    );
  }
  if (t === "kitchen") {
    return (
      <mesh position={[cx, 0.45 + FLOOR_Y, r.y - D / 2 + 0.3]} castShadow receiveShadow>
        <boxGeometry args={[r.w * 0.85, 0.85, 0.5]} />
        <meshStandardMaterial color="#aeb4bd" roughness={0.5} />
      </mesh>
    );
  }
  if (t === "pooja") {
    return (
      <mesh position={[cx, 0.2 + FLOOR_Y, r.y + r.h - D / 2 - 0.3]} castShadow>
        <boxGeometry args={[Math.min(r.w * 0.6, 0.9), 0.4, 0.4]} />
        <meshStandardMaterial color="#caa15a" roughness={0.5} />
      </mesh>
    );
  }
  return null;
}

const RAIL_H = 0.95; // balcony balustrade height
const RAIL_T = 0.08;

/** A balcony balustrade: a low wall on the three OPEN edges (the edge nearest the
 *  building centre is the step-out from the room, so it's left open). */
function Railing({ room, W, D }: { room: Room; W: number; D: number }) {
  const r = bounds(room.polygon);
  const cx = r.x + r.w / 2 - W / 2;
  const cz = D / 2 - (r.y + r.h / 2);
  const edges: { pos: [number, number, number]; size: [number, number, number]; mid: [number, number] }[] = [
    { pos: [cx, FLOOR_Y + RAIL_H / 2, D / 2 - (r.y + r.h)], size: [r.w, RAIL_H, RAIL_T], mid: [r.x + r.w / 2, r.y + r.h] },
    { pos: [cx, FLOOR_Y + RAIL_H / 2, D / 2 - r.y], size: [r.w, RAIL_H, RAIL_T], mid: [r.x + r.w / 2, r.y] },
    { pos: [r.x - W / 2, FLOOR_Y + RAIL_H / 2, cz], size: [RAIL_T, RAIL_H, r.h], mid: [r.x, r.y + r.h / 2] },
    { pos: [r.x + r.w - W / 2, FLOOR_Y + RAIL_H / 2, cz], size: [RAIL_T, RAIL_H, r.h], mid: [r.x + r.w, r.y + r.h / 2] },
  ];
  let skip = 0;
  let best = Infinity;
  edges.forEach((e, i) => {
    const d = (e.mid[0] - W / 2) ** 2 + (e.mid[1] - D / 2) ** 2;
    if (d < best) {
      best = d;
      skip = i;
    }
  });
  return (
    <>
      {edges.filter((_, i) => i !== skip).map((e, i) => (
        <mesh key={i} position={e.pos} castShadow receiveShadow>
          <boxGeometry args={e.size} />
          <meshStandardMaterial color="#c9b495" roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

function FloorGroup({
  plan,
  floor,
  W,
  D,
  openings,
  entranceId,
}: {
  plan: Plan;
  floor: number;
  W: number;
  D: number;
  openings: PlacedOpening[];
  entranceId: string | null;
}) {
  const rooms = plan.rooms.filter((r) => !VIRTUAL.has(r.type) && (r.floor ?? 0) === floor);
  const fp = buildingFootprint(plan, floor);
  const exterior = floor === 0; // plinth + exterior render only on ground storey faces
  return (
    <group position={[0, floor * FLOOR_TO_FLOOR, 0]}>
      {rooms.map((room) => {
        const r = bounds(room.polygon);
        const cx = r.x + r.w / 2 - W / 2;
        const cz = D / 2 - (r.y + r.h / 2);
        const isEntry = room.id === entranceId;
        const { walls, glass, doors } = buildWallParts(room, openings, W, D, fp, isEntry);
        // an exterior room face gets the warm render; interior partitions stay light
        const eMap = exteriorEdges(r, fp);
        const hasExt = eMap.N || eMap.S || eMap.E || eMap.W;
        const wallCol = hasExt ? PLASTER_EXT : PLASTER_INT;
        return (
          <group key={room.id}>
            <mesh position={[cx, FLOOR_Y, cz]} receiveShadow>
              <boxGeometry args={[r.w - 0.04, 0.05, r.h - 0.04]} />
              <meshStandardMaterial color={floorColor(room.type)} roughness={0.85} />
            </mesh>
            {walls.map((w, i) => (
              <mesh key={`w${i}`} position={w.pos} castShadow receiveShadow>
                <boxGeometry args={w.size} />
                <meshStandardMaterial color={wallCol} roughness={0.92} />
              </mesh>
            ))}
            {glass.map((g, i) => (
              <Window3D key={`g${i}`} part={g} W={W} D={D} />
            ))}
            {doors.map((d, i) => (
              <Door3D key={`d${i}`} part={d} W={W} D={D} />
            ))}
            <Furniture3D room={room} W={W} D={D} />
            {room.type === "balcony" && <Railing room={room} W={W} D={D} />}
          </group>
        );
      })}
      {/* darker projecting plinth course around the ground-floor footprint */}
      {exterior && <Plinth fp={fp} W={W} D={D} />}
    </group>
  );
}

/** Darker, slightly-projecting plinth/base course around the ground footprint. */
function Plinth({ fp, W, D }: { fp: Rect; W: number; D: number }) {
  const cx = fp.x + fp.w / 2 - W / 2;
  const cz = D / 2 - (fp.y + fp.h / 2);
  const out = 0.06; // projection past the wall face
  const t = WALL_T + 2 * out;
  const yc = FLOOR_Y + PLINTH_H / 2;
  const bands: Box[] = [
    { pos: [cx, yc, D / 2 - fp.y], size: [fp.w + 2 * out, PLINTH_H, t] }, // S
    { pos: [cx, yc, D / 2 - (fp.y + fp.h)], size: [fp.w + 2 * out, PLINTH_H, t] }, // N
    { pos: [fp.x - W / 2, yc, cz], size: [t, PLINTH_H, fp.h + 2 * out] }, // W
    { pos: [fp.x + fp.w - W / 2, yc, cz], size: [t, PLINTH_H, fp.h + 2 * out] }, // E
  ];
  return (
    <>
      {bands.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow receiveShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={PLINTH_COL} roughness={0.95} />
        </mesh>
      ))}
    </>
  );
}

/** Projecting entrance porch: a canopy slab on two slim columns + a step,
 *  set just outside the entrance/sit-out room's exterior face. */
function EntrancePorch({ plan, W, D }: { plan: Plan; W: number; D: number }) {
  const fp = buildingFootprint(plan, 0);
  // prefer the explicit entrance; else the sit-out; else the front-most room
  const entry =
    plan.rooms.find((r) => r.type === "entrance" && (r.floor ?? 0) === 0) ??
    plan.rooms.find((r) => r.type === "sitout" && (r.floor ?? 0) === 0);
  if (!entry) return null;
  const r = bounds(entry.polygon);
  const ext = exteriorEdges(r, fp);
  // pick the exterior face the porch projects from (prefer the road / +x East side)
  const face: Edge | null = ext.E ? "E" : ext.S ? "S" : ext.W ? "W" : ext.N ? "N" : null;
  if (!face) return null;

  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;
  const proj = 1.4; // how far the canopy reaches out
  const w = Math.min(face === "N" || face === "S" ? r.w : r.h, 2.6); // canopy width along the wall
  const canopyY = FLOOR_Y + LINTEL + 0.15;
  const colH = LINTEL + 0.1;

  // centre of the wall face, and the outward unit direction
  let wallCx: number, wallCz: number, dx = 0, dz = 0;
  if (face === "S") {
    wallCx = r.x + r.w / 2; wallCz = r.y; dz = -1;
  } else if (face === "N") {
    wallCx = r.x + r.w / 2; wallCz = r.y + r.h; dz = 1;
  } else if (face === "W") {
    wallCx = r.x; wallCz = r.y + r.h / 2; dx = -1;
  } else {
    wallCx = r.x + r.w; wallCz = r.y + r.h / 2; dx = 1;
  }
  // step "outward" in plan coords. Note Z(py) flips sign, so a +y move is -z in world.
  const outAt = (d: number): [number, number] => [X(wallCx + dx * d), Z(wallCz + dz * d)];
  const along = face === "N" || face === "S"; // canopy spans x

  const [slabX, slabZ] = outAt(proj / 2);
  const [stepX, stepZ] = outAt(proj + 0.25);
  const colInset = w / 2 - 0.18;
  const [colCx, colCz] = outAt(proj - 0.1);

  return (
    <group>
      {/* canopy slab */}
      <mesh position={[slabX, canopyY, slabZ]} castShadow receiveShadow>
        <boxGeometry args={along ? [w + 0.3, CHAJJA_T * 1.6, proj + 0.2] : [proj + 0.2, CHAJJA_T * 1.6, w + 0.3]} />
        <meshStandardMaterial color={CONCRETE} roughness={0.95} />
      </mesh>
      {/* two slim columns at the outer corners */}
      {[-colInset, colInset].map((off, i) => {
        const px = along ? colCx + off : colCx;
        const pz = along ? colCz : colCz + off;
        return (
          <mesh key={i} position={[px, FLOOR_Y + colH / 2, pz]} castShadow>
            <boxGeometry args={[0.16, colH, 0.16]} />
            <meshStandardMaterial color={PLASTER_EXT} roughness={0.9} />
          </mesh>
        );
      })}
      {/* one entrance step */}
      <mesh position={[stepX, FLOOR_Y + 0.09, stepZ]} castShadow receiveShadow>
        <boxGeometry args={along ? [w * 0.8, 0.18, 0.5] : [0.5, 0.18, w * 0.8]} />
        <meshStandardMaterial color="#bcae9a" roughness={0.95} />
      </mesh>
    </group>
  );
}

function Slabs({ plan, W, D }: { plan: Plan; W: number; D: number }) {
  const floors = floorsOf(plan);
  const fp = footprint(plan.rooms);
  if (!fp) return null;
  const cx = fp.x + fp.w / 2 - W / 2;
  const cz = D / 2 - (fp.y + fp.h / 2);
  const topFloor = floors[floors.length - 1];
  const roofY = topFloor * FLOOR_TO_FLOOR + WALL_H + SLAB / 2;
  const roofTop = roofY + SLAB / 2; // walking surface of the roof
  const concrete = CONCRETE;

  // staircase mumty (headroom box) above the top-floor staircase footprint
  const stair = plan.rooms.find((r) => r.type === "staircase" && (r.floor ?? 0) === topFloor)
    ?? plan.rooms.find((r) => r.type === "staircase");
  let mumty: { pos: [number, number, number]; size: [number, number, number] } | null = null;
  if (stair) {
    const s = bounds(stair.polygon);
    const mh = 2.2;
    mumty = {
      pos: [s.x + s.w / 2 - W / 2, roofTop + mh / 2, D / 2 - (s.y + s.h / 2)],
      size: [s.w * 0.9, mh, s.h * 0.9],
    };
  }

  // overhead Sintex tank on the SW corner of the roof (S = -y plan, W = -x plan)
  const tankR = 0.5;
  const tankH = 1.2;
  const tankPos: [number, number, number] = [
    fp.x + tankR + 0.4 - W / 2, // near W edge
    roofTop + 0.15 + tankH / 2, // sat on a small stand
    D / 2 - (fp.y + tankR + 0.4), // near S edge
  ];

  return (
    <>
      {/* intermediate floor slabs */}
      {floors.filter((f) => f > 0).map((f) => (
        <mesh key={f} position={[cx, f * FLOOR_TO_FLOOR - SLAB / 2 + FLOOR_Y, cz]} receiveShadow castShadow>
          <boxGeometry args={[fp.w + 0.3, SLAB, fp.h + 0.3]} />
          <meshStandardMaterial color={concrete} roughness={0.95} />
        </mesh>
      ))}
      {/* roof slab */}
      <mesh position={[cx, roofY, cz]} receiveShadow castShadow>
        <boxGeometry args={[fp.w + 0.4, SLAB, fp.h + 0.4]} />
        <meshStandardMaterial color={concrete} roughness={0.95} />
      </mesh>
      {/* parapet ring */}
      {([
        { pos: [cx, roofY + SLAB / 2 + PARAPET / 2, D / 2 - fp.y] as [number, number, number], size: [fp.w + 0.4, PARAPET, WALL_T] as [number, number, number] },
        { pos: [cx, roofY + SLAB / 2 + PARAPET / 2, D / 2 - (fp.y + fp.h)] as [number, number, number], size: [fp.w + 0.4, PARAPET, WALL_T] as [number, number, number] },
        { pos: [fp.x - W / 2, roofY + SLAB / 2 + PARAPET / 2, cz] as [number, number, number], size: [WALL_T, PARAPET, fp.h + 0.4] as [number, number, number] },
        { pos: [fp.x + fp.w - W / 2, roofY + SLAB / 2 + PARAPET / 2, cz] as [number, number, number], size: [WALL_T, PARAPET, fp.h + 0.4] as [number, number, number] },
      ]).map((p, i) => (
        <mesh key={i} position={p.pos} castShadow receiveShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color="#e7e2d9" roughness={0.9} />
        </mesh>
      ))}
      {/* staircase mumty (roof headroom box) */}
      {mumty && (
        <mesh position={mumty.pos} castShadow receiveShadow>
          <boxGeometry args={mumty.size} />
          <meshStandardMaterial color={PLASTER_EXT} roughness={0.92} />
        </mesh>
      )}
      {/* overhead water tank: stand + black Sintex cylinder */}
      <mesh position={[tankPos[0], roofTop + 0.075, tankPos[2]]} castShadow receiveShadow>
        <boxGeometry args={[tankR * 2.2, 0.15, tankR * 2.2]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.9} />
      </mesh>
      <mesh position={tankPos} castShadow receiveShadow>
        <cylinderGeometry args={[tankR, tankR * 0.92, tankH, 20]} />
        <meshStandardMaterial color={TANK_COL} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[tankPos[0], tankPos[1] + tankH / 2 + 0.05, tankPos[2]]} castShadow>
        <cylinderGeometry args={[tankR * 0.55, tankR * 0.55, 0.1, 16]} />
        <meshStandardMaterial color={TANK_COL} roughness={0.6} />
      </mesh>
    </>
  );
}

/** Low compound wall around the plot perimeter with a gate gap on the East (road) side. */
function CompoundWall({ W, D }: { W: number; D: number }) {
  const H = 1.0;
  const T = 0.15;
  const yc = H / 2;
  const hx = W / 2;
  const hz = D / 2;
  const gate = Math.min(D * 0.35, 3.0); // gate opening width on the East run
  const segLen = (D - gate) / 2; // each East-side segment beside the gate

  const segs: Box[] = [
    // West run (full)
    { pos: [-hx, yc, 0], size: [T, H, D] },
    // North run (full)
    { pos: [0, yc, -hz], size: [W, H, T] },
    // South run (full)
    { pos: [0, yc, hz], size: [W, H, T] },
    // East run split into two, leaving the gate gap centred
    { pos: [hx, yc, -(gate / 2 + segLen / 2)], size: [T, H, segLen] },
    { pos: [hx, yc, gate / 2 + segLen / 2], size: [T, H, segLen] },
  ];

  // two gate pillars flanking the opening
  const pillars: [number, number, number][] = [
    [hx, H * 0.6, -gate / 2],
    [hx, H * 0.6, gate / 2],
  ];

  return (
    <group>
      {segs.map((s, i) => (
        <mesh key={i} position={s.pos} castShadow receiveShadow>
          <boxGeometry args={s.size} />
          <meshStandardMaterial color={PLASTER_EXT} roughness={0.95} />
        </mesh>
      ))}
      {pillars.map((p, i) => (
        <mesh key={`p${i}`} position={p} castShadow receiveShadow>
          <boxGeometry args={[0.3, H * 1.2, 0.3]} />
          <meshStandardMaterial color={PLINTH_COL} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ plan }: { plan: Plan }) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const openings = React.useMemo(() => placeOpenings(plan), [plan]);
  const floors = floorsOf(plan);
  const entranceId = React.useMemo(() => {
    const e = plan.rooms.find((r) => r.type === "entrance") ?? plan.rooms.find((r) => r.type === "sitout");
    return e?.id ?? null;
  }, [plan]);

  return (
    <>
      {/* procedural sky (no network assets) for a believable horizon + sun glow */}
      <Sky distance={450000} sunPosition={[W * 0.6, 30, D * 0.5]} turbidity={6} rayleigh={1.2} mieCoefficient={0.006} mieDirectionalG={0.85} />

      <hemisphereLight args={["#fdf6e8", "#b8bdc8", 0.6]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[W * 0.6, 18, D * 0.5]}
        intensity={2.0}
        color="#fff4e0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-W}
        shadow-camera-right={W}
        shadow-camera-top={D}
        shadow-camera-bottom={-D}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
      />

      {/* plot slab (ground / yard) */}
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <boxGeometry args={[W + 0.3, 0.12, D + 0.3]} />
        <meshStandardMaterial color="#c9c3b4" roughness={1} />
      </mesh>

      {floors.map((f) => (
        <FloorGroup key={f} plan={plan} floor={f} W={W} D={D} openings={openings} entranceId={entranceId} />
      ))}
      <Slabs plan={plan} W={W} D={D} />
      <EntrancePorch plan={plan} W={W} D={D} />
      <CompoundWall W={W} D={D} />

      <ContactShadows position={[0, 0.02, 0]} scale={Math.max(W, D) * 1.6} blur={2.2} opacity={0.4} far={6} />
      <OrbitControls
        makeDefault
        enablePan
        minDistance={6}
        maxDistance={Math.max(W, D, floors.length * FLOOR_TO_FLOOR) * 4}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, Math.min(floors.length * FLOOR_TO_FLOOR, 3) * 0.5, 0]}
      />
    </>
  );
}

export function FloorPlan3D({ plan, className }: { plan: Plan; className?: string }) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const floors = Math.max(1, new Set(plan.rooms.map((r) => r.floor ?? 0)).size);
  const dist = Math.max(W, D);
  const h = floors * FLOOR_TO_FLOOR;
  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 1.8]}
        camera={{ position: [W * 0.85, dist * 1.0 + h, D * 1.2 + h * 0.4], fov: 38, near: 0.1, far: 240 }}
        style={{ background: "linear-gradient(180deg,#cfe0f2 0%,#e8edf3 100%)" }}
      >
        <Scene plan={plan} />
      </Canvas>
    </div>
  );
}
