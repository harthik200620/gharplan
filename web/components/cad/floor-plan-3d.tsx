"use client";

import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import type { Plan, Room } from "@gharplan/shared";
import { bounds, placeOpenings, type Edge, type PlacedOpening } from "@/lib/cad";

const WALL_H = 2.8;
const WALL_T = 0.1;
const FLOOR_Y = 0.04;

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

type Interval = [number, number];
function intervalsMinusGaps(start: number, end: number, gaps: Interval[]): Interval[] {
  let segs: Interval[] = [[start, end]];
  for (const [g0, g1] of gaps) {
    const next: Interval[] = [];
    for (const [s0, s1] of segs) {
      if (g1 <= s0 || g0 >= s1) {
        next.push([s0, s1]);
        continue;
      }
      if (g0 > s0) next.push([s0, g0]);
      if (g1 < s1) next.push([g1, s1]);
    }
    segs = next;
  }
  return segs.filter(([a, b]) => b - a > 0.04);
}

type Box = { pos: [number, number, number]; size: [number, number, number] };

function buildWalls(room: Room, openings: PlacedOpening[], W: number, D: number): Box[] {
  if (SITE_TYPES.has(room.type)) return [];
  const r = bounds(room.polygon);
  const out: Box[] = [];
  const doors = openings.filter((o) => o.roomId === room.id && o.kind === "door");
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;

  const edgeDoors = (e: Edge): Interval[] =>
    doors.filter((d) => d.edge === e).map((d) => {
      const c = e === "N" || e === "S" ? d.cx : d.cy;
      return [c - d.len / 2, c + d.len / 2] as Interval;
    });

  // horizontal walls (N at top y=r.y+r.h, S at bottom y=r.y) run along x
  for (const [edge, yPlan] of [["N", r.y + r.h] as const, ["S", r.y] as const]) {
    for (const [x0, x1] of intervalsMinusGaps(r.x, r.x + r.w, edgeDoors(edge))) {
      out.push({
        pos: [X((x0 + x1) / 2), WALL_H / 2 + FLOOR_Y, Z(yPlan)],
        size: [x1 - x0, WALL_H, WALL_T],
      });
    }
  }
  // vertical walls (E at x=r.x+r.w, W at x=r.x) run along y
  for (const [edge, xPlan] of [["E", r.x + r.w] as const, ["W", r.x] as const]) {
    for (const [y0, y1] of intervalsMinusGaps(r.y, r.y + r.h, edgeDoors(edge))) {
      out.push({
        pos: [X(xPlan), WALL_H / 2 + FLOOR_Y, Z((y0 + y1) / 2)],
        size: [WALL_T, WALL_H, y1 - y0],
      });
    }
  }
  return out;
}

function Furniture3D({ room, W, D }: { room: Room; W: number; D: number }) {
  const r = bounds(room.polygon);
  const cx = r.x + r.w / 2 - W / 2;
  const cz = D / 2 - (r.y + r.h / 2);
  const t = room.type;

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
  return null;
}

function Scene({ plan }: { plan: Plan }) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const openings = React.useMemo(() => placeOpenings(plan), [plan]);
  const rooms = plan.rooms.filter((r) => !VIRTUAL.has(r.type));

  return (
    <>
      <hemisphereLight args={["#ffffff", "#b8bdc8", 0.85]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[W * 0.6, 14, D * 0.5]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-W}
        shadow-camera-right={W}
        shadow-camera-top={D}
        shadow-camera-bottom={-D}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
      />

      {/* plot slab */}
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <boxGeometry args={[W + 0.3, 0.12, D + 0.3]} />
        <meshStandardMaterial color="#cfc8bb" roughness={1} />
      </mesh>

      {rooms.map((room) => {
        const r = bounds(room.polygon);
        const cx = r.x + r.w / 2 - W / 2;
        const cz = D / 2 - (r.y + r.h / 2);
        const walls = buildWalls(room, openings, W, D);
        return (
          <group key={room.id}>
            {/* room floor inlay */}
            <mesh position={[cx, FLOOR_Y, cz]} receiveShadow>
              <boxGeometry args={[r.w - 0.04, 0.05, r.h - 0.04]} />
              <meshStandardMaterial color={floorColor(room.type)} roughness={0.85} />
            </mesh>
            {walls.map((w, i) => (
              <mesh key={i} position={w.pos} castShadow receiveShadow>
                <boxGeometry args={w.size} />
                <meshStandardMaterial color="#f3efe8" roughness={0.9} />
              </mesh>
            ))}
            <Furniture3D room={room} W={W} D={D} />
          </group>
        );
      })}

      <ContactShadows position={[0, 0.02, 0]} scale={Math.max(W, D) * 1.6} blur={2.2} opacity={0.35} far={6} />
      <OrbitControls
        makeDefault
        enablePan
        minDistance={6}
        maxDistance={Math.max(W, D) * 3.5}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0.5, 0]}
      />
    </>
  );
}

export function FloorPlan3D({ plan, className }: { plan: Plan; className?: string }) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const dist = Math.max(W, D);
  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 1.8]}
        camera={{ position: [W * 0.75, dist * 1.05, D * 1.15], fov: 38, near: 0.1, far: 200 }}
        style={{ background: "linear-gradient(180deg,#eef1f6 0%,#e3e7ef 100%)" }}
      >
        <Scene plan={plan} />
      </Canvas>
    </div>
  );
}
