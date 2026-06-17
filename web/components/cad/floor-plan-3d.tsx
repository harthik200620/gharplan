"use client";

import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import type { Plan, Room } from "@gharplan/shared";
import { bounds, placeOpenings, type Edge, type PlacedOpening, type Rect } from "@/lib/cad";

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

function buildWallParts(room: Room, openings: PlacedOpening[], W: number, D: number) {
  const walls: Box[] = [];
  const glass: Box[] = [];
  if (SITE_TYPES.has(room.type)) return { walls, glass };
  const r = bounds(room.polygon);
  const wet = WET.test(room.type);
  const sill = wet ? SILL_WET : SILL;
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

  const emit = (band: Band, horiz: boolean, fixed: number) => {
    const len = band.p1 - band.p0;
    const mid = (band.p0 + band.p1) / 2;
    const h = band.y1 - band.y0;
    const yc = FLOOR_Y + (band.y0 + band.y1) / 2;
    const box: Box = horiz
      ? { pos: [X(mid), yc, Z(fixed)], size: [len, h, WALL_T] }
      : { pos: [X(fixed), yc, Z(mid)], size: [WALL_T, h, len] };
    (band.kind === "glass" ? glass : walls).push(box);
  };

  // horizontal walls (N at top, S at bottom) run along x
  for (const [edge, yPlan] of [["N", r.y + r.h] as const, ["S", r.y] as const]) {
    for (const band of edgeBands(r.x, r.x + r.w, onEdge(edge))) emit(band, true, yPlan);
  }
  // vertical walls (E at right, W at left) run along y
  for (const [edge, xPlan] of [["E", r.x + r.w] as const, ["W", r.x] as const]) {
    for (const band of edgeBands(r.y, r.y + r.h, onEdge(edge))) emit(band, false, xPlan);
  }
  return { walls, glass };
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
    return (
      <mesh position={[cx, 0.12 + FLOOR_Y, cz]} castShadow>
        <cylinderGeometry args={[Math.min(r.w, r.h) * 0.18, Math.min(r.w, r.h) * 0.28, 0.24, 16]} />
        <meshStandardMaterial color="#4d7c0f" roughness={0.9} />
      </mesh>
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

function FloorGroup({ plan, floor, W, D, openings }: { plan: Plan; floor: number; W: number; D: number; openings: PlacedOpening[] }) {
  const rooms = plan.rooms.filter((r) => !VIRTUAL.has(r.type) && (r.floor ?? 0) === floor);
  return (
    <group position={[0, floor * FLOOR_TO_FLOOR, 0]}>
      {rooms.map((room) => {
        const r = bounds(room.polygon);
        const cx = r.x + r.w / 2 - W / 2;
        const cz = D / 2 - (r.y + r.h / 2);
        const { walls, glass } = buildWallParts(room, openings, W, D);
        return (
          <group key={room.id}>
            <mesh position={[cx, FLOOR_Y, cz]} receiveShadow>
              <boxGeometry args={[r.w - 0.04, 0.05, r.h - 0.04]} />
              <meshStandardMaterial color={floorColor(room.type)} roughness={0.85} />
            </mesh>
            {walls.map((w, i) => (
              <mesh key={`w${i}`} position={w.pos} castShadow receiveShadow>
                <boxGeometry args={w.size} />
                <meshStandardMaterial color="#f3efe8" roughness={0.9} />
              </mesh>
            ))}
            {glass.map((g, i) => (
              <mesh key={`g${i}`} position={g.pos}>
                <boxGeometry args={g.size} />
                <meshStandardMaterial color="#bcdfe8" roughness={0.1} metalness={0.1} transparent opacity={0.45} />
              </mesh>
            ))}
            <Furniture3D room={room} W={W} D={D} />
          </group>
        );
      })}
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
  const concrete = "#d6d2c8";
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
    </>
  );
}

function Scene({ plan }: { plan: Plan }) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const openings = React.useMemo(() => placeOpenings(plan), [plan]);
  const floors = floorsOf(plan);

  return (
    <>
      <hemisphereLight args={["#ffffff", "#b8bdc8", 0.85]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[W * 0.6, 16, D * 0.5]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-W}
        shadow-camera-right={W}
        shadow-camera-top={D}
        shadow-camera-bottom={-D}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />

      {/* plot slab */}
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <boxGeometry args={[W + 0.3, 0.12, D + 0.3]} />
        <meshStandardMaterial color="#cfc8bb" roughness={1} />
      </mesh>

      {floors.map((f) => (
        <FloorGroup key={f} plan={plan} floor={f} W={W} D={D} openings={openings} />
      ))}
      <Slabs plan={plan} W={W} D={D} />

      <ContactShadows position={[0, 0.02, 0]} scale={Math.max(W, D) * 1.6} blur={2.2} opacity={0.35} far={6} />
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
        style={{ background: "linear-gradient(180deg,#eef1f6 0%,#e3e7ef 100%)" }}
      >
        <Scene plan={plan} />
      </Canvas>
    </div>
  );
}
