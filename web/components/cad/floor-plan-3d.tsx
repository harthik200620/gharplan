"use client";

import * as React from "react";
import { Suspense } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Sky,
  Environment,
  SoftShadows,
  Bounds,
  useBounds,
} from "@react-three/drei";
import type { Plan, Room, StructureReport } from "@gharplan/shared";
import {
  bounds,
  buildingFootprint,
  exteriorEdges,
  placeOpenings,
  type Edge,
  type PlacedOpening,
  type Rect,
} from "@/lib/cad";
import { buildMepModel } from "@/lib/mep";
import { cn } from "@/lib/utils";

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
const MARBLE_COL = "#ece5d8"; // polished living/dining marble
const TEAK_COL = "#6e4a2b"; // warm teak joinery
const SOFA_COL = "#7d8aa3"; // upholstered slate-blue
const FABRIC_COL = "#cdbfa6"; // bed linen / soft furnishing
const STEEL_COL = "#c7ccd2"; // appliances / steel
const TILE_WET = "#d7dde3"; // glazed wet-room tile
const GRASS_COL = "#7fae5a"; // lawn / planting
const PATH_COL = "#cabfa6"; // paved approach

// One-time low-power check: physical transmission + clearcoat is an expensive
// per-fragment shader, so on machines with few logical cores (likely integrated
// GPUs / phones) we drop to a cheap tinted-transparent glass. Computed once at
// module load — no per-frame or per-mesh cost. Defaults to the rich look when the
// hint is unavailable (SSR / unknown).
const LOW_POWER =
  typeof navigator !== "undefined" &&
  typeof navigator.hardwareConcurrency === "number" &&
  navigator.hardwareConcurrency <= 4;

// ============================================================
// PREMIUM GLASS HOUSE MATERIALS & VISUAL MODE
// ============================================================

// Ultra-luxury material palette for Premium tier
const PREMIUM_GLASS = '#b8d4e8';   // structural glazing (slightly blue tint)
const PREMIUM_STEEL = '#c0c8d4';   // architectural steel frame
const PREMIUM_MARBLE = '#f5f0eb';  // Calacatta Oro marble
const PREMIUM_WOOD = '#8b6340';    // Belgian engineered teak
const PREMIUM_CONCRETE = '#d8d4cf'; // polished architectural concrete
const PREMIUM_POOL = '#1a7ab5';    // infinity pool water
const PREMIUM_GOLD = '#c8a951';    // brushed brass accents

// Premium structural glass — MeshPhysicalMaterial with maximum transmission for archviz quality
const PREMIUM_GLASS_MAT = (
  <meshPhysicalMaterial
    color={PREMIUM_GLASS}
    roughness={0.0}
    metalness={0.1}
    transmission={0.92}
    thickness={0.08}
    ior={1.5}
    clearcoat={1.0}
    clearcoatRoughness={0.02}
    transparent
    opacity={0.85}
    envMapIntensity={2.0}
    reflectivity={0.9}
  />
);

const PREMIUM_STEEL_MAT = (
  <meshPhysicalMaterial
    color={PREMIUM_STEEL}
    roughness={0.1}
    metalness={0.95}
    clearcoat={0.8}
    clearcoatRoughness={0.05}
    envMapIntensity={2.0}
  />
);

const PREMIUM_MARBLE_MAT = (
  <meshPhysicalMaterial
    color={PREMIUM_MARBLE}
    roughness={0.05}
    metalness={0}
    clearcoat={1.0}
    clearcoatRoughness={0.05}
    envMapIntensity={1.5}
  />
);

const PREMIUM_WOOD_MAT = (
  <meshPhysicalMaterial
    color={PREMIUM_WOOD}
    roughness={0.3}
    metalness={0}
    clearcoat={0.6}
    clearcoatRoughness={0.2}
    envMapIntensity={0.8}
  />
);

const PREMIUM_CONCRETE_MAT = (
  <meshPhysicalMaterial
    color={PREMIUM_CONCRETE}
    roughness={0.3}
    metalness={0.05}
    clearcoat={0.2}
    clearcoatRoughness={0.5}
    envMapIntensity={0.5}
  />
);

const PREMIUM_GOLD_MAT = (
  <meshPhysicalMaterial
    color={PREMIUM_GOLD}
    roughness={0.15}
    metalness={0.9}
    clearcoat={0.9}
    clearcoatRoughness={0.1}
    envMapIntensity={2.0}
  />
);

/**
 * PREMIUM GLASS HOUSE renderer — renders ultra-luxury glass architecture
 * completely differently from the standard render:
 * - Walls become floor-to-ceiling structural glazing panels
 * - Steel I-beam columns at corners and mid-spans
 * - Double-height living volume
 * - Infinity pool on roof
 * - Landscaped grounds with water feature
 * - Dramatic sunset HDRI lighting
 */
function PremiumGlassHouseScene({ plan }: { plan: Plan }) {
  const floors = floorsOf(plan);
  const fp = footprint(plan.rooms);
  if (!fp) return null;

  const W = fp.maxX - fp.minX;
  const D = fp.maxY - fp.minY;
  const totalFloors = floors.length;
  const totalH = totalFloors * FLOOR_TO_FLOOR;

  // Steel column positions at corners and midpoints
  const colPositions: [number, number][] = [
    [fp.minX, fp.minY], [fp.maxX, fp.minY],
    [fp.minX, fp.maxY], [fp.maxX, fp.maxY],
    [fp.minX + W/2, fp.minY], [fp.minX + W/2, fp.maxY],
    [fp.minX, fp.minY + D/2], [fp.maxX, fp.minY + D/2],
  ];

  // Convert plan coords to world coords (centered at origin)
  const plotW = plan.plot.widthM;
  const plotD = plan.plot.depthM;
  const cx = fp.minX + W / 2 - plotW / 2;
  const cz = plotD / 2 - (fp.minY + D / 2);
  const toX = (px: number) => px - plotW / 2;
  const toZ = (py: number) => plotD / 2 - py;

  const mullionStep = 1.5; // glass panel width

  return (
    <group>
      {/* === GROUND PLANE — Polished concrete approach === */}
      <mesh receiveShadow position={[0, -0.01, 0]}>
        <boxGeometry args={[plotW + 20, 0.05, plotD + 20]} />
        {PREMIUM_CONCRETE_MAT}
      </mesh>

      {/* === LANDSCAPING GRASS === */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[plotW + 16, 0.04, plotD + 16]} />
        <meshStandardMaterial color="#4a7c3f" roughness={0.9} />
      </mesh>

      {/* === STRUCTURAL STEEL COLUMNS === */}
      {colPositions.map(([x, y], i) => (
        <mesh key={`col-${i}`} castShadow receiveShadow
          position={[toX(x), totalH / 2, toZ(y)]}>
          <boxGeometry args={[0.12, totalH, 0.12]} />
          {PREMIUM_STEEL_MAT}
        </mesh>
      ))}

      {/* === HORIZONTAL STEEL BEAMS at each floor === */}
      {floors.map((fl) => {
        const beamY = fl * FLOOR_TO_FLOOR + FLOOR_TO_FLOOR;
        return (
          <group key={`beam-fl${fl}`}>
            {/* N edge */}
            <mesh castShadow position={[cx, beamY, toZ(fp.maxY)]}>
              <boxGeometry args={[W, 0.15, 0.12]} />
              {PREMIUM_STEEL_MAT}
            </mesh>
            {/* S edge */}
            <mesh castShadow position={[cx, beamY, toZ(fp.minY)]}>
              <boxGeometry args={[W, 0.15, 0.12]} />
              {PREMIUM_STEEL_MAT}
            </mesh>
            {/* E edge */}
            <mesh castShadow position={[toX(fp.maxX), beamY, cz]}>
              <boxGeometry args={[0.12, 0.15, D]} />
              {PREMIUM_STEEL_MAT}
            </mesh>
            {/* W edge */}
            <mesh castShadow position={[toX(fp.minX), beamY, cz]}>
              <boxGeometry args={[0.12, 0.15, D]} />
              {PREMIUM_STEEL_MAT}
            </mesh>
          </group>
        );
      })}

      {/* === GLASS CURTAIN WALLS — all 4 facades, all floors === */}
      {floors.map((fl) => {
        const flY = fl * FLOOR_TO_FLOOR;
        const glassH = FLOOR_TO_FLOOR - 0.2;
        const glassY = flY + glassH / 2 + 0.1;
        const nPanelsW = Math.max(1, Math.floor(W / mullionStep));
        const nPanelsD = Math.max(1, Math.floor(D / mullionStep));

        return (
          <group key={`glass-fl${fl}`}>
            {/* South facade — full glass panels */}
            {Array.from({ length: nPanelsW }).map((_, pi) => {
              const px = toX(fp.minX + pi * mullionStep + mullionStep / 2);
              return (
                <group key={`S-${pi}`}>
                  <mesh castShadow position={[px, glassY, toZ(fp.minY)]}>
                    <boxGeometry args={[mullionStep - 0.03, glassH, 0.025]} />
                    {PREMIUM_GLASS_MAT}
                  </mesh>
                  <mesh position={[toX(fp.minX + pi * mullionStep), glassY, toZ(fp.minY)]}>
                    <boxGeometry args={[0.03, glassH, 0.04]} />
                    {PREMIUM_STEEL_MAT}
                  </mesh>
                  {/* Timber louvers for sun shading */}
                  <group position={[px, glassY, toZ(fp.minY) + 0.2]}>
                    {Array.from({ length: 4 }).map((_, li) => (
                      <mesh key={`lvr-${li}`} castShadow position={[-mullionStep/2 + (li + 0.5) * (mullionStep/4), 0, 0]} rotation={[0, Math.PI / 6, 0]}>
                        <boxGeometry args={[0.04, glassH, 0.25]} />
                        {PREMIUM_WOOD_MAT}
                      </mesh>
                    ))}
                  </group>
                </group>
              );
            })}

            {/* North facade */}
            {Array.from({ length: nPanelsW }).map((_, pi) => {
              const px = toX(fp.minX + pi * mullionStep + mullionStep / 2);
              return (
                <group key={`N-${pi}`}>
                  <mesh castShadow position={[px, glassY, toZ(fp.maxY)]}>
                    <boxGeometry args={[mullionStep - 0.03, glassH, 0.025]} />
                    {PREMIUM_GLASS_MAT}
                  </mesh>
                  <mesh position={[toX(fp.minX + pi * mullionStep), glassY, toZ(fp.maxY)]}>
                    <boxGeometry args={[0.03, glassH, 0.04]} />
                    {PREMIUM_STEEL_MAT}
                  </mesh>
                </group>
              );
            })}

            {/* East facade */}
            {Array.from({ length: nPanelsD }).map((_, pi) => {
              const pz = toZ(fp.minY + pi * mullionStep + mullionStep / 2);
              return (
                <group key={`E-${pi}`}>
                  <mesh castShadow position={[toX(fp.maxX), glassY, pz]}>
                    <boxGeometry args={[0.025, glassH, mullionStep - 0.03]} />
                    {PREMIUM_GLASS_MAT}
                  </mesh>
                </group>
              );
            })}

            {/* West facade */}
            {Array.from({ length: nPanelsD }).map((_, pi) => {
              const pz = toZ(fp.minY + pi * mullionStep + mullionStep / 2);
              return (
                <group key={`W-${pi}`}>
                  <mesh castShadow position={[toX(fp.minX), glassY, pz]}>
                    <boxGeometry args={[0.025, glassH, mullionStep - 0.03]} />
                    {PREMIUM_GLASS_MAT}
                  </mesh>
                  {/* Timber louvers for sun shading */}
                  <group position={[toX(fp.minX) - 0.2, glassY, pz]}>
                    {Array.from({ length: 4 }).map((_, li) => (
                      <mesh key={`lvr-w-${li}`} castShadow position={[0, 0, -mullionStep/2 + (li + 0.5) * (mullionStep/4)]} rotation={[0, -Math.PI / 6, 0]}>
                        <boxGeometry args={[0.25, glassH, 0.04]} />
                        {PREMIUM_WOOD_MAT}
                      </mesh>
                    ))}
                  </group>
                </group>
              );
            })}
          </group>
        );
      })}

      {/* === FLOOR SLABS — polished marble each floor === */}
      {floors.map((fl) => (
        <mesh key={`slab-${fl}`} receiveShadow castShadow
          position={[cx, fl * FLOOR_TO_FLOOR + 0.05, cz]}>
          <boxGeometry args={[W, 0.15, D]} />
          {PREMIUM_MARBLE_MAT}
        </mesh>
      ))}

      {/* === ROOF SLAB & SKYLIGHT === */}
      <group position={[cx, totalH + 0.075, cz]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[W, 0.15, D]} />
          {PREMIUM_CONCRETE_MAT}
        </mesh>
        
        {/* Large Architectural Skylight */}
        <group position={[0, 0.25, 0]}>
          <mesh castShadow>
            <boxGeometry args={[W * 0.4, 0.4, D * 0.4]} />
            {PREMIUM_GLASS_MAT}
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <boxGeometry args={[W * 0.42, 0.06, D * 0.42]} />
            {PREMIUM_STEEL_MAT}
          </mesh>
          {/* Internal steel mullions for skylight */}
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[W * 0.4, 0.04, 0.04]} />
            {PREMIUM_STEEL_MAT}
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.04, 0.04, D * 0.4]} />
            {PREMIUM_STEEL_MAT}
          </mesh>
        </group>
      </group>

      {/* === INFINITY POOL on roof (if 2+ floors) === */}
      {totalFloors >= 2 && (
        <group position={[toX(fp.maxX) - 2, totalH + 0.25, cz]}>
          {/* Pool basin */}
          <mesh castShadow>
            <boxGeometry args={[5, 0.5, Math.min(D - 2, 6)]} />
            <meshStandardMaterial color="#1e4060" roughness={0.3} />
          </mesh>
          {/* Water surface */}
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[4.8, 0.04, Math.min(D - 2.2, 5.8)]} />
            <meshPhysicalMaterial
              color={PREMIUM_POOL}
              roughness={0.02}
              metalness={0.1}
              transmission={0.5}
              transparent
              opacity={0.85}
              envMapIntensity={1.5}
            />
          </mesh>
          {/* Pool edge lighting (gold strip) */}
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[5.1, 0.05, Math.min(D - 1.8, 6.2)]} />
            {PREMIUM_GOLD_MAT}
          </mesh>
        </group>
      )}

      {/* === STEEL FLOATING STAIRCASE === */}
      {Array.from({ length: 14 }).map((_, i) => (
        <group key={`step-${i}`}>
          {/* Tread */}
          <mesh castShadow
            position={[
              cx - W * 0.25 + i * 0.05,
              i * (FLOOR_TO_FLOOR / 14) + 0.06,
              cz - i * 0.22,
            ]}>
            <boxGeometry args={[1.2, 0.04, 0.28]} />
            {PREMIUM_GOLD_MAT}
          </mesh>
          {/* Stringer */}
          <mesh
            position={[
              cx - W * 0.25 + i * 0.05,
              i * (FLOOR_TO_FLOOR / 14) - 0.15,
              cz - i * 0.22,
            ]}>
            <boxGeometry args={[0.06, 0.3, 0.03]} />
            {PREMIUM_STEEL_MAT}
          </mesh>
        </group>
      ))}

      {/* === WATER FEATURE / REFLECTING POND at entry === */}
      <group position={[cx, 0.15, toZ(fp.minY) + 4]}>
        <mesh receiveShadow>
          <boxGeometry args={[W * 0.5, 0.3, 3]} />
          <meshStandardMaterial color="#1a3040" roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <boxGeometry args={[W * 0.5 - 0.1, 0.04, 2.9]} />
          <meshPhysicalMaterial
            color="#2a6090"
            roughness={0.01}
            transmission={0.6}
            transparent
            opacity={0.9}
            envMapIntensity={2}
          />
        </mesh>
      </group>

      {/* === BOUNDARY — low glass + steel parapet === */}
      {/* Front glass fence */}
      <mesh position={[cx, 0.5, toZ(fp.minY) + 6]}>
        <boxGeometry args={[W + 4, 1.0, 0.02]} />
        {PREMIUM_GLASS_MAT}
      </mesh>
      {/* Top rail */}
      <mesh position={[cx, 1.02, toZ(fp.minY) + 6]}>
        <boxGeometry args={[W + 4, 0.04, 0.06]} />
        {PREMIUM_STEEL_MAT}
      </mesh>

      {/* === LANDSCAPING — ornamental trees === */}
      {([
        [toX(fp.minX) - 2, 0, toZ(fp.minY) + 2],
        [toX(fp.maxX) + 2, 0, toZ(fp.minY) + 2],
        [toX(fp.minX) - 3, 0, cz],
        [toX(fp.maxX) + 3, 0, cz],
        [toX(fp.minX) - 2, 0, toZ(fp.maxY) - 2],
        [toX(fp.maxX) + 2, 0, toZ(fp.maxY) - 2],
      ] as [number, number, number][]).map(([tx, ty, tz], i) => (
        <group key={`tree-${i}`} position={[tx, ty, tz]}>
          <mesh castShadow position={[0, 1.2, 0]}>
            <cylinderGeometry args={[0.1, 0.15, 2.4, 8]} />
            <meshStandardMaterial color="#4a3728" roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0, 3.2, 0]}>
            <sphereGeometry args={[1.2, 12, 12]} />
            <meshStandardMaterial color="#2d6a2d" roughness={0.8} />
          </mesh>
        </group>
      ))}

      {/* === DRAMATIC ACCENT LIGHTING STRIPS (gold trim) === */}
      {floors.map((fl) => (
        <mesh key={`ledN-${fl}`}
          position={[cx, fl * FLOOR_TO_FLOOR + FLOOR_TO_FLOOR - 0.02, toZ(fp.maxY) - 0.02]}>
          <boxGeometry args={[W, 0.03, 0.03]} />
          <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={2.0} />
        </mesh>
      ))}

      {/* === PARAPET CAP with gold trim === */}
      <mesh position={[cx, totalH + 0.17, cz]}>
        <boxGeometry args={[W + 0.1, 0.06, D + 0.1]} />
        {PREMIUM_GOLD_MAT}
      </mesh>
    </group>
  );
}

// ---- shared PBR materials (declared as render helpers so the look is consistent) ----
// Tinted architectural glazing: low roughness + clearcoat read as real glass; a touch
// of transmission lifts it when perf allows (kept modest — high transmission is costly).
// On low-power devices we render a simple tinted transparent pane (transmission 0,
// no clearcoat) which is visually close but far cheaper to shade.
const GlassMat = () =>
  LOW_POWER ? (
    <meshPhysicalMaterial
      color={GLASS_COL}
      roughness={0.1}
      metalness={0}
      transmission={0}
      transparent
      opacity={0.45}
      envMapIntensity={0.9}
    />
  ) : (
    <meshPhysicalMaterial
      color={GLASS_COL}
      roughness={0.05}
      metalness={0}
      transmission={0.95}
      thickness={0.05}
      ior={1.45}
      clearcoat={1}
      clearcoatRoughness={0.06}
      transparent
      opacity={0.8}
      envMapIntensity={1.1}
    />
  );
// Anodised aluminium window/door frames.
const FrameMat = () => (
  <meshPhysicalMaterial color={FRAME_COL} metalness={0.7} roughness={0.35} envMapIntensity={0.9} />
);
// Polished marble for living/dining — low roughness with a subtle clearcoat sheen.
const MarbleMat = ({ color = MARBLE_COL }: { color?: string }) => (
  <meshPhysicalMaterial color={color} roughness={0.1} metalness={0} clearcoat={0.8} clearcoatRoughness={0.15} envMapIntensity={1.0} />
);
// Matte RCC for slabs / chajja / parapet.
const ConcreteMat = ({ color = CONCRETE }: { color?: string }) => (
  <meshPhysicalMaterial color={color} roughness={0.8} metalness={0.1} clearcoat={0.1} clearcoatRoughness={0.8} />
);
// Warm teak for doors and timber joinery.
const TeakMat = ({ color = TEAK_COL }: { color?: string }) => (
  <meshPhysicalMaterial color={color} roughness={0.4} metalness={0.05} clearcoat={0.4} clearcoatRoughness={0.3} envMapIntensity={0.6} />
);
// Glazed tile for wet rooms.
const TileMat = ({ color = TILE_WET }: { color?: string }) => (
  <meshPhysicalMaterial color={color} roughness={0.22} metalness={0} clearcoat={0.4} clearcoatRoughness={0.3} envMapIntensity={0.7} />
);

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
  return MARBLE_COL; // living / dining / foyer — marble
}

/** True for rooms that get a polished-marble finish (living/dining/foyer family). */
function isMarbleFloor(type: string): boolean {
  return type === "living" || type === "dining" || type === "foyer" || type === "entrance" || type === "passage";
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
        <GlassMat />
      </mesh>
      {bars.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow>
          <boxGeometry args={b.size} />
          <FrameMat />
        </mesh>
      ))}
      {chajja && (
        <mesh position={chajja.pos} castShadow receiveShadow>
          <boxGeometry args={chajja.size} />
          <ConcreteMat />
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

  return (
    <group position={groupPos}>
      {/* frame */}
      <mesh position={[jamb(-width / 2)[0] - groupPos[0], cy, jamb(-width / 2)[2] - groupPos[2]]} castShadow>
        <boxGeometry args={jambSize} />
        <FrameMat />
      </mesh>
      <mesh position={[jamb(width / 2)[0] - groupPos[0], cy, jamb(width / 2)[2] - groupPos[2]]} castShadow>
        <boxGeometry args={jambSize} />
        <FrameMat />
      </mesh>
      <mesh position={[0, FLOOR_Y + leafH + F / 2, 0]} castShadow>
        <boxGeometry args={headSize} />
        <FrameMat />
      </mesh>
      {/* leaf: hinge group at the jamb, leaf box pushed out by half its width */}
      <group
        position={part.horiz ? [hingeOffset, 0, 0] : [0, 0, hingeOffset]}
        rotation={[0, part.horiz ? ajar : -ajar, 0]}
      >
        <mesh position={part.horiz ? [leafW / 2, cy, 0.02] : [0.02, cy, -leafW / 2]} castShadow receiveShadow>
          <boxGeometry args={part.horiz ? [leafW, leafH, 0.05] : [0.05, leafH, leafW]} />
          <TeakMat color={col} />
        </mesh>
        {/* slim handle reads the leaf as joinery, not a slab */}
        <mesh
          position={part.horiz ? [leafW - 0.12, cy, 0.06] : [0.06, cy, -leafW + 0.12]}
          castShadow
        >
          <boxGeometry args={part.horiz ? [0.04, 0.22, 0.04] : [0.04, 0.22, 0.04]} />
          <FrameMat />
        </mesh>
      </group>
    </group>
  );
}

const STEP_COL = "#cdd2da"; // light grey stone tread
const STEP_NOSE = "#b9bec7"; // riser shade
const RAIL_WOOD = "#7a5230"; // stained-wood handrail / newels

/** A balustrade run: a top handrail on two posts, with thin vertical balusters
 *  in between. `horiz=true` means the run extends along world-X. */
function Balustrade({
  cx, cz, len, y0, y1, horiz,
}: { cx: number; cz: number; len: number; y0: number; y1: number; horiz: boolean }) {
  const railY = y1; // handrail height at the top of this run
  const postH = railY - y0;
  const nBal = Math.max(2, Math.round(len / 0.16));
  const railSize: [number, number, number] = horiz ? [len, 0.05, 0.05] : [0.05, 0.05, len];
  return (
    <group>
      {/* handrail */}
      <mesh position={[cx, y0 + postH + 0.02, cz]} castShadow>
        <boxGeometry args={railSize} />
        <TeakMat color={RAIL_WOOD} />
      </mesh>
      {/* balusters */}
      {Array.from({ length: nBal }).map((_, i) => {
        const f = nBal === 1 ? 0.5 : i / (nBal - 1);
        const px = horiz ? cx - len / 2 + f * len : cx;
        const pz = horiz ? cz : cz - len / 2 + f * len;
        return (
          <mesh key={i} position={[px, y0 + postH / 2, pz]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, postH, 6]} />
            <meshPhysicalMaterial color={STEEL_COL} metalness={0.7} roughness={0.35} />
          </mesh>
        );
      })}
    </group>
  );
}

/** A realistic dog-leg (U-return) staircase: a first flight rising along +Y(plan),
 *  a half-landing at the far end, a return flight climbing back to the upper floor,
 *  plus newel posts and balustrades along both open sides. It rises exactly one
 *  storey (FLOOR_TO_FLOOR) so it visually stitches this living level to the one above
 *  through the slab void cut over the staircase footprint.
 *  When `toRoof` is set (top-floor stair with no slab void above, just the terrace
 *  + mumty), it instead lands flush on the roof walking surface (WALL_H + SLAB) so
 *  the return flight doesn't punch up into the solid roof soffit. */
function StairSteps({ room, W, D, toRoof = false }: { room: Room; W: number; D: number; toRoof?: boolean }) {
  const r = bounds(room.polygon);
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;

  // climb to the next finished floor, or to the terrace surface on the top floor
  const rise = toRoof ? WALL_H + SLAB : FLOOR_TO_FLOOR;
  const half = rise / 2; // height at the landing
  const nPer = 9; // treads per flight
  const stepRise = half / nPer; // riser height
  const inset = 0.12; // keep the stair off the room walls

  // two parallel flights split the room width; landing spans the far (high-Y) end
  const usableW = Math.max(r.w - 2 * inset, 0.9);
  const flightW = Math.min((usableW - 0.06) / 2, 1.1); // 0.06 = gap between flights
  const landingD = Math.min(r.h * 0.32, 1.2); // depth of the half-landing
  const runDepth = Math.max(r.h - 2 * inset - landingD, nPer * 0.16);
  const going = runDepth / nPer; // tread depth (run)

  // flight centre-lines in plan-X; flight A (up) on the low-X half, B (return) high-X
  const xA = r.x + inset + flightW / 2;
  const xB = r.x + r.w - inset - flightW / 2;
  const yLow = r.y + inset; // near edge (start)
  const yLanding = r.y + r.h - inset - landingD; // where flight A tops out

  const treadT = 0.05;
  const tread = (cx: number, cy: number, cz: number) => (
    <group>
      <mesh position={[X(cx), cy, Z(cz)]} castShadow receiveShadow>
        <boxGeometry args={[flightW, treadT, going + 0.03]} />
        <MarbleMat color={STEP_COL} />
      </mesh>
      {/* riser face under the tread nose */}
      <mesh position={[X(cx), cy - stepRise / 2, Z(cz) + going / 2]} castShadow>
        <boxGeometry args={[flightW, stepRise, 0.03]} />
        <ConcreteMat color={STEP_NOSE} />
      </mesh>
    </group>
  );

  return (
    <group>
      {/* flight A — climbs from the floor up to the landing, advancing +Y in plan */}
      {Array.from({ length: nPer }).map((_, i) => {
        const cy = FLOOR_Y + (i + 1) * stepRise - treadT / 2;
        const cz = yLow + (i + 0.5) * going;
        return <group key={`a${i}`}>{tread(xA, cy, cz)}</group>;
      })}
      {/* half-landing at far end, at mid-height, spanning both flights */}
      <mesh
        position={[X((xA + xB) / 2), FLOOR_Y + half - treadT / 2, Z(yLanding + landingD / 2)]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[xB - xA + flightW, treadT, landingD]} />
        <MarbleMat color={STEP_COL} />
      </mesh>
      {/* flight B — returns from the landing up to the upper floor, advancing -Y */}
      {Array.from({ length: nPer }).map((_, i) => {
        const cy = FLOOR_Y + half + (i + 1) * stepRise - treadT / 2;
        const cz = yLanding - (i + 0.5) * going;
        return <group key={`b${i}`}>{tread(xB, cy, cz)}</group>;
      })}
      {/* central stringer wall between the two flights (the U-return spine) */}
      <mesh
        position={[X((xA + xB) / 2), FLOOR_Y + half / 2, Z((yLow + yLanding) / 2)]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.06, half, runDepth + landingD * 0.4]} />
        <ConcreteMat color={STEP_NOSE} />
      </mesh>
      {/* newel posts at the foot and at the landing */}
      {[
        [xA, yLow, FLOOR_Y + 0.5],
        [xB, yLow, FLOOR_Y + rise - 0.5],
      ].map(([px, py, top], i) => (
        <mesh key={`n${i}`} position={[X(px), (top + FLOOR_Y) / 2, Z(py)]} castShadow>
          <boxGeometry args={[0.07, top - FLOOR_Y, 0.07]} />
          <TeakMat color={RAIL_WOOD} />
        </mesh>
      ))}
      {/* balustrade along the outer (room-wall) side of each flight, sloping up */}
      <Balustrade cx={X(xA - flightW / 2)} cz={Z((yLow + yLanding) / 2)} len={runDepth} y0={FLOOR_Y + half / 2} y1={FLOOR_Y + half / 2 + 0.9} horiz={false} />
      <Balustrade cx={X(xB + flightW / 2)} cz={Z((yLow + yLanding) / 2)} len={runDepth} y0={FLOOR_Y + half + half / 2} y1={FLOOR_Y + half + half / 2 + 0.9} horiz={false} />
      {/* landing-edge balustrade facing the void on the inner side */}
      <Balustrade cx={X((xA + xB) / 2)} cz={Z(yLanding)} len={xB - xA} y0={FLOOR_Y + half} y1={FLOOR_Y + half + 0.9} horiz={true} />
    </group>
  );
}

function Furniture3D({ room, W, D, isTopFloor = false }: { room: Room; W: number; D: number; isTopFloor?: boolean }) {
  const r = bounds(room.polygon);
  const cx = r.x + r.w / 2 - W / 2;
  const cz = D / 2 - (r.y + r.h / 2);
  const t = room.type;

  // a top-floor stair has no slab void above it (only the terrace + mumty), so it
  // lands on the roof surface rather than rising into the solid roof soffit.
  if (t === "staircase") return <StairSteps room={room} W={W} D={D} toRoof={isTopFloor} />;

  if (t === "parking") return <Car cx={cx} cz={cz} along={r.h >= r.w} />;
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

  if (t.includes("bedroom")) return <BedroomSet r={r} W={W} D={D} master={t === "master_bedroom"} />;
  if (t === "living") return <LivingSet r={r} W={W} D={D} />;
  if (t === "dining") return <DiningSet r={r} W={W} D={D} />;
  if (t === "kitchen") return <KitchenSet r={r} W={W} D={D} />;
  if (t === "pooja") return <PoojaShrine r={r} W={W} D={D} />;
  return null;
}

// ---------- furniture sets (each composed of distinctly-materialled blocks) ----------

/** Saloon car: body + cabin + four wheel cylinders + windscreen tint. */
function Car({ cx, cz, along }: { cx: number; cz: number; along: boolean }) {
  // along=true → car parked nose-to-tail along world-Z (the deeper plot axis)
  const L = 3.9, Wd = 1.65; // car length / width
  const sx = along ? Wd : L;
  const sz = along ? L : Wd;
  const wheelOff = (along ? L : Wd) / 2 - 0.55;
  const wheelXZ: [number, number][] = along
    ? [[sx / 2 - 0.06, wheelOff], [-sx / 2 + 0.06, wheelOff], [sx / 2 - 0.06, -wheelOff], [-sx / 2 + 0.06, -wheelOff]]
    : [[wheelOff, sz / 2 - 0.06], [wheelOff, -sz / 2 + 0.06], [-wheelOff, sz / 2 - 0.06], [-wheelOff, -sz / 2 + 0.06]];
  return (
    <group position={[cx, FLOOR_Y, cz]}>
      {/* lower body */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[sx, 0.5, sz]} />
        <meshPhysicalMaterial color="#3b4a63" metalness={0.6} roughness={0.3} clearcoat={0.8} clearcoatRoughness={0.2} />
      </mesh>
      {/* cabin / greenhouse */}
      <mesh position={[0, 0.86, 0]} castShadow>
        <boxGeometry args={[sx * 0.78, 0.42, sz * 0.55]} />
        <meshPhysicalMaterial color="#2a3346" metalness={0.4} roughness={0.2} transmission={0.3} transparent opacity={0.7} clearcoat={1} />
      </mesh>
      {wheelXZ.map(([px, pz], i) => (
        <mesh key={i} position={[px, 0.26, pz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.28, 0.28, 0.18, 16]} />
          <meshStandardMaterial color="#15171c" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

/** Bed (mattress + headboard + 2 pillows + 2 side tables) and a wardrobe box. */
function BedroomSet({ r, W, D, master }: { r: Rect; W: number; D: number; master: boolean }) {
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;
  // clear room width (allow for wall thickness on both sides)
  const clearW = r.w - 2 * WALL_T;
  // a bedroom narrower than ~3.0 m clear can't sit a double with circulation,
  // so show a single bed; otherwise a real double/queen (1.5–1.8 m), never the
  // ~2.1 m a naive r.w*0.62 could yield on a wide room.
  const single = clearW < 3.0;
  const bw = single
    ? Math.min(Math.max(clearW - 1.2, 0.9), 1.0) // single ~0.9–1.0 m
    : Math.min(Math.max(clearW * 0.45, 1.5), master ? 1.8 : 1.6); // double/queen 1.5–1.8 m
  const bl = Math.min(r.h * 0.7, single ? 1.9 : 2.05);
  // bed centred on the room, headboard against the low-Y wall
  const bx = r.x + r.w / 2;
  const bz = r.y + bl / 2 + 0.25;
  const pillowW = bw * 0.42;
  return (
    <group>
      {/* base */}
      <mesh position={[X(bx), FLOOR_Y + 0.18, Z(bz)]} castShadow receiveShadow>
        <boxGeometry args={[bw + 0.12, 0.36, bl + 0.1]} />
        <TeakMat color="#5c4730" />
      </mesh>
      {/* mattress */}
      <mesh position={[X(bx), FLOOR_Y + 0.45, Z(bz)]} castShadow receiveShadow>
        <boxGeometry args={[bw, 0.22, bl]} />
        <meshStandardMaterial color={FABRIC_COL} roughness={0.85} />
      </mesh>
      {/* headboard against low-Y wall */}
      <mesh position={[X(bx), FLOOR_Y + 0.62, Z(bz - bl / 2 - 0.06)]} castShadow>
        <boxGeometry args={[bw + 0.2, 0.78, 0.1]} />
        <TeakMat color="#5c4730" />
      </mesh>
      {/* two pillows */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[X(bx + s * pillowW * 0.6), FLOOR_Y + 0.58, Z(bz - bl / 2 + 0.28)]} castShadow>
          <boxGeometry args={[pillowW, 0.1, 0.34]} />
          <meshStandardMaterial color="#f3eee2" roughness={0.9} />
        </mesh>
      ))}
      {/* side tables flanking the headboard — only the sides that fit inside the
          room. A single bed in a tight room keeps just one nightstand. */}
      {(single ? [-1] : [-1, 1]).map((s) => {
        const tw = single ? 0.34 : 0.42;
        const tx = bx + s * (bw / 2 + tw / 2 + 0.06);
        // drop the table if its outer edge would cross the room wall
        if (tx - tw / 2 < r.x + WALL_T || tx + tw / 2 > r.x + r.w - WALL_T) return null;
        return (
          <mesh key={s} position={[X(tx), FLOOR_Y + 0.26, Z(bz - bl / 2 + 0.2)]} castShadow receiveShadow>
            <boxGeometry args={[tw, 0.5, 0.4]} />
            <TeakMat color="#6e5337" />
          </mesh>
        );
      })}
      {/* wardrobe along the high-Y wall (clamped to the clear room width) */}
      <mesh position={[X(r.x + r.w - 0.35), FLOOR_Y + 1.05, Z(r.y + r.h - 0.32)]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(clearW * 0.5, 1.4), 2.1, 0.55]} />
        <TeakMat color="#7a5c3c" />
      </mesh>
    </group>
  );
}

/** Living: an L-sofa (two arms) + coffee table + a low TV console. */
function LivingSet({ r, W, D }: { r: Rect; W: number; D: number }) {
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;
  const cx = r.x + r.w / 2;
  const cz = r.y + r.h / 2;
  const armL = Math.min(r.w * 0.6, 2.2);
  const armS = Math.min(r.h * 0.5, 1.7);
  return (
    <group>
      {/* main sofa run (along X, back to low-Y) */}
      <mesh position={[X(cx), FLOOR_Y + 0.22, Z(cz + 0.3)]} castShadow receiveShadow>
        <boxGeometry args={[armL, 0.4, 0.8]} />
        <meshStandardMaterial color={SOFA_COL} roughness={0.92} />
      </mesh>
      <mesh position={[X(cx), FLOOR_Y + 0.5, Z(cz + 0.62)]} castShadow>
        <boxGeometry args={[armL, 0.5, 0.18]} />
        <meshStandardMaterial color={SOFA_COL} roughness={0.92} />
      </mesh>
      {/* return arm (along Z) making the L */}
      <mesh position={[X(cx - armL / 2 + 0.4), FLOOR_Y + 0.22, Z(cz - armS / 2 + 0.4)]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.4, armS]} />
        <meshStandardMaterial color={SOFA_COL} roughness={0.92} />
      </mesh>
      {/* coffee table */}
      <mesh position={[X(cx), FLOOR_Y + 0.2, Z(cz - 0.2)]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(armL * 0.45, 1.0), 0.08, 0.55]} />
        <TeakMat color="#5c4730" />
      </mesh>
      {/* TV console against the high-Y wall + screen */}
      <mesh position={[X(cx), FLOOR_Y + 0.22, Z(r.y + r.h - 0.28)]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(r.w * 0.55, 1.6), 0.44, 0.4]} />
        <TeakMat color="#4f3c28" />
      </mesh>
      <mesh position={[X(cx), FLOOR_Y + 0.95, Z(r.y + r.h - 0.18)]} castShadow>
        <boxGeometry args={[Math.min(r.w * 0.5, 1.4), 0.62, 0.05]} />
        <meshStandardMaterial color="#141414" roughness={0.4} metalness={0.2} />
      </mesh>
    </group>
  );
}

/** Dining: a table + 4 chair blocks around it. */
function DiningSet({ r, W, D }: { r: Rect; W: number; D: number }) {
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;
  const cx = r.x + r.w / 2;
  const cz = r.y + r.h / 2;
  const tw = Math.min(r.w * 0.5, 1.3);
  const td = Math.min(r.h * 0.42, 0.85);
  const seats: [number, number][] = [
    [0, td / 2 + 0.3], [0, -td / 2 - 0.3],
    [tw / 2 + 0.28, 0], [-tw / 2 - 0.28, 0],
  ];
  return (
    <group>
      {/* table top + a central pedestal */}
      <mesh position={[X(cx), FLOOR_Y + 0.74, Z(cz)]} castShadow receiveShadow>
        <boxGeometry args={[tw, 0.06, td]} />
        <TeakMat color="#6e5337" />
      </mesh>
      <mesh position={[X(cx), FLOOR_Y + 0.36, Z(cz)]} castShadow>
        <boxGeometry args={[tw * 0.3, 0.72, td * 0.3]} />
        <TeakMat color="#5c4730" />
      </mesh>
      {seats.map(([dx, dz], i) => (
        <group key={i}>
          <mesh position={[X(cx + dx), FLOOR_Y + 0.24, Z(cz + dz)]} castShadow receiveShadow>
            <boxGeometry args={[0.42, 0.46, 0.42]} />
            <meshStandardMaterial color={SOFA_COL} roughness={0.9} />
          </mesh>
          <mesh position={[X(cx + dx + (dz === 0 ? Math.sign(dx) * 0.2 : 0)), FLOOR_Y + 0.6, Z(cz + dz + (dz !== 0 ? Math.sign(dz) * 0.2 : 0))]} castShadow>
            <boxGeometry args={[dz === 0 ? 0.06 : 0.42, 0.5, dz === 0 ? 0.42 : 0.06]} />
            <meshStandardMaterial color={SOFA_COL} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Kitchen: an L-counter (along two walls) + hob + sink + a strip of upper cabinets. */
function KitchenSet({ r, W, D }: { r: Rect; W: number; D: number }) {
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;
  const cDepth = 0.6;
  const cH = 0.85;
  // base run along the low-Y wall, plus a return run along the low-X wall
  const runX = r.w - 0.1;
  const runZ = r.h - cDepth - 0.1;
  return (
    <group>
      {/* base counter — run along low-Y wall */}
      <mesh position={[X(r.x + r.w / 2), FLOOR_Y + cH / 2, Z(r.y + cDepth / 2 + 0.05)]} castShadow receiveShadow>
        <boxGeometry args={[runX, cH, cDepth]} />
        <meshPhysicalMaterial color="#b9bec7" roughness={0.4} metalness={0.05} clearcoat={0.4} />
      </mesh>
      {/* return run along low-X wall */}
      <mesh position={[X(r.x + cDepth / 2 + 0.05), FLOOR_Y + cH / 2, Z(r.y + cDepth + runZ / 2 + 0.05)]} castShadow receiveShadow>
        <boxGeometry args={[cDepth, cH, runZ]} />
        <meshPhysicalMaterial color="#b9bec7" roughness={0.4} metalness={0.05} clearcoat={0.4} />
      </mesh>
      {/* stone counter-top strip */}
      <mesh position={[X(r.x + r.w / 2), FLOOR_Y + cH + 0.02, Z(r.y + cDepth / 2 + 0.05)]} castShadow>
        <boxGeometry args={[runX, 0.04, cDepth + 0.02]} />
        <MarbleMat color="#3c4047" />
      </mesh>
      {/* hob (recessed dark) */}
      <mesh position={[X(r.x + r.w * 0.35), FLOOR_Y + cH + 0.05, Z(r.y + cDepth / 2 + 0.05)]} castShadow>
        <boxGeometry args={[0.55, 0.04, 0.45]} />
        <meshStandardMaterial color="#1c1c1f" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* sink (steel) */}
      <mesh position={[X(r.x + r.w * 0.7), FLOOR_Y + cH + 0.03, Z(r.y + cDepth / 2 + 0.05)]} castShadow>
        <boxGeometry args={[0.5, 0.08, 0.4]} />
        <meshPhysicalMaterial color={STEEL_COL} metalness={0.8} roughness={0.25} />
      </mesh>
      {/* strip of upper cabinets above the low-Y wall */}
      <mesh position={[X(r.x + r.w / 2), FLOOR_Y + 1.85, Z(r.y + 0.22)]} castShadow receiveShadow>
        <boxGeometry args={[runX * 0.9, 0.6, 0.35]} />
        <TeakMat color="#6e5337" />
      </mesh>
    </group>
  );
}

/** Pooja shrine: a stepped wooden mandir with a small canopy/kalash. */
function PoojaShrine({ r, W, D }: { r: Rect; W: number; D: number }) {
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;
  const cx = r.x + r.w / 2;
  const bz = r.y + r.h - 0.35; // against the far wall
  const bw = Math.min(r.w * 0.6, 0.9);
  return (
    <group>
      {/* base cabinet */}
      <mesh position={[X(cx), FLOOR_Y + 0.3, Z(bz)]} castShadow receiveShadow>
        <boxGeometry args={[bw, 0.6, 0.4]} />
        <TeakMat color="#5c4730" />
      </mesh>
      {/* shrine box */}
      <mesh position={[X(cx), FLOOR_Y + 0.9, Z(bz)]} castShadow>
        <boxGeometry args={[bw * 0.8, 0.6, 0.35]} />
        <TeakMat color="#7a5c3c" />
      </mesh>
      {/* gilded canopy */}
      <mesh position={[X(cx), FLOOR_Y + 1.28, Z(bz)]} castShadow>
        <boxGeometry args={[bw * 0.9, 0.1, 0.42]} />
        <meshPhysicalMaterial color="#caa15a" metalness={0.6} roughness={0.35} />
      </mesh>
      {/* kalash finial */}
      <mesh position={[X(cx), FLOOR_Y + 1.42, Z(bz)]} castShadow>
        <sphereGeometry args={[0.08, 12, 10]} />
        <meshPhysicalMaterial color="#d8b45e" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
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
  mepMode = false,
}: {
  plan: Plan;
  floor: number;
  W: number;
  D: number;
  openings: PlacedOpening[];
  entranceId: string | null;
  mepMode?: boolean;
}) {
  const rooms = plan.rooms.filter((r) => !VIRTUAL.has(r.type) && (r.floor ?? 0) === floor);
  const fp = buildingFootprint(plan, floor);
  const exterior = floor === 0; // plinth + exterior render only on ground storey faces
  const allFloors = floorsOf(plan);
  const isTopFloor = floor === allFloors[allFloors.length - 1]; // no slab void above
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
        const fcol = floorColor(room.type);
        const wet = WET.test(room.type);
        return (
          <group key={room.id}>
            <mesh position={[cx, FLOOR_Y, cz]} receiveShadow>
              <boxGeometry args={[r.w - 0.04, 0.05, r.h - 0.04]} />
              {isMarbleFloor(room.type) ? (
                <MarbleMat color={fcol} />
              ) : wet ? (
                <TileMat color={fcol} />
              ) : (
                <meshStandardMaterial color={fcol} roughness={0.85} />
              )}
            </mesh>
            {walls.map((w, i) => (
              <mesh key={`w${i}`} position={w.pos} castShadow={!mepMode} receiveShadow={!mepMode}>
                <boxGeometry args={w.size} />
                {mepMode ? (
                  <meshPhysicalMaterial color={wallCol} transmission={0.8} opacity={0.3} transparent roughness={0.3} />
                ) : (
                  <meshStandardMaterial color={wallCol} roughness={0.92} bumpScale={0.01} />
                )}
              </mesh>
            ))}
            {glass.map((g, i) => (
              <Window3D key={`g${i}`} part={g} W={W} D={D} />
            ))}
            {doors.map((d, i) => (
              <Door3D key={`d${i}`} part={d} W={W} D={D} />
            ))}
            <Furniture3D room={room} W={W} D={D} isTopFloor={isTopFloor} />
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
          <meshPhysicalMaterial color={PLINTH_COL} roughness={0.8} metalness={0.1} clearcoat={0.2} />
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
      {/* intermediate floor slabs — each cut with a stairwell void over the
          staircase footprint of the floor BELOW, so the stair is visible rising
          from the lower living up into the upper living. */}
      {floors.filter((f) => f > 0).map((f) => {
        const y = f * FLOOR_TO_FLOOR - SLAB / 2 + FLOOR_Y;
        const slabW = fp.w + 0.3;
        const slabH = fp.h + 0.3;
        const sx0 = fp.x - 0.15; // slab extent in plan coords
        const sy0 = fp.y - 0.15;
        const sx1 = fp.x + fp.w + 0.15;
        const sy1 = fp.y + fp.h + 0.15;
        // staircase room on the floor below defines the hole
        const below = plan.rooms.find(
          (rm) => rm.type === "staircase" && (rm.floor ?? 0) === f - 1,
        );
        if (!below) {
          return (
            <mesh key={f} position={[cx, y, cz]} receiveShadow castShadow>
              <boxGeometry args={[slabW, SLAB, slabH]} />
              <ConcreteMat color={concrete} />
            </mesh>
          );
        }
        // void = staircase rect, trimmed slightly so the slab edge laps the wall
        const vr = bounds(below.polygon);
        const margin = 0.04;
        const hx0 = Math.max(sx0, vr.x + margin);
        const hy0 = Math.max(sy0, vr.y + margin);
        const hx1 = Math.min(sx1, vr.x + vr.w - margin);
        const hy1 = Math.min(sy1, vr.y + vr.h - margin);
        // frame the hole with 4 strips: S (low-y), N (high-y) span full width;
        // W and E fill the remaining sides between them.
        const strips: Box[] = [];
        const pushStrip = (px0: number, px1: number, py0: number, py1: number) => {
          const w = px1 - px0;
          const h = py1 - py0;
          if (w <= 0.02 || h <= 0.02) return;
          strips.push({
            pos: [(px0 + px1) / 2 - W / 2, y, D / 2 - (py0 + py1) / 2],
            size: [w, SLAB, h],
          });
        };
        pushStrip(sx0, sx1, sy0, hy0); // south strip (full width)
        pushStrip(sx0, sx1, hy1, sy1); // north strip (full width)
        pushStrip(sx0, hx0, hy0, hy1); // west strip (between)
        pushStrip(hx1, sx1, hy0, hy1); // east strip (between)
        return (
          <group key={f}>
            {strips.map((s, i) => (
              <mesh key={i} position={s.pos} receiveShadow castShadow>
                <boxGeometry args={s.size} />
                <ConcreteMat color={concrete} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* roof slab */}
      <mesh position={[cx, roofY, cz]} receiveShadow castShadow>
        <boxGeometry args={[fp.w + 0.4, SLAB, fp.h + 0.4]} />
        <ConcreteMat color={concrete} />
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

/** Trunk + layered canopy spheres — reads as a small ornamental tree. */
function Tree({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  const trunkH = 0.9 * scale;
  const rad = 0.7 * scale;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, trunkH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.08 * scale, 0.12 * scale, trunkH, 8]} />
        <meshStandardMaterial color="#6b4f2a" roughness={0.95} />
      </mesh>
      <mesh position={[0, trunkH + rad * 0.7, 0]} castShadow receiveShadow>
        <sphereGeometry args={[rad, 14, 12]} />
        <meshStandardMaterial color="#4d7c2f" roughness={0.95} />
      </mesh>
      <mesh position={[rad * 0.4, trunkH + rad * 1.2, 0]} castShadow>
        <sphereGeometry args={[rad * 0.7, 12, 10]} />
        <meshStandardMaterial color="#5b8f38" roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Site/landscaping: a paved approach path from the gate to the entrance, lawn
 *  inside the compound, low planting along the wall, and a few corner trees.
 *  Everything is procedural so it always renders offline. */
function SiteLandscape({ plan, W, D }: { plan: Plan; W: number; D: number }) {
  const fp = footprint(plan.rooms);
  const hx = W / 2;
  const hz = D / 2;
  // lawn fills the plot inside the compound, just above the yard slab
  // approach path: a paved strip from the East gate toward the building front
  const fpEast = fp ? fp.x + fp.w : W * 0.7; // building's East face (plan-x)
  const pathPlanX0 = fpEast; // from building face
  const pathPlanX1 = W; // to the East boundary (gate)
  const pathCx = (pathPlanX0 + pathPlanX1) / 2 - hx;
  const pathLen = Math.max(pathPlanX1 - pathPlanX0, 0.5);

  // Greenery scaled to plot area so it isn't out of proportion on small plots:
  //  < 110 m²  → 1–2 small trees
  //  110–300 m² → 3–4 medium trees
  //  > 300 m²   → a few larger trees
  const area = W * D;
  const treeCfg =
    area < 110
      ? { count: Math.min(2, Math.max(1, Math.round(area / 70))), scale: 0.7 }
      : area <= 300
        ? { count: area < 200 ? 3 : 4, scale: 1.0 }
        : { count: 5, scale: 1.35 };
  // candidate spots along the back/side strips, away from the front approach;
  // take only as many as the band calls for.
  const treeSpots: [number, number][] = [
    [-hx + 0.9, -hz + 1.0],
    [-hx + 0.9, hz - 1.0],
    [hx - 1.1, -hz + 1.1],
    [-hx + 0.9, 0],
    [hx - 1.1, hz - 1.1],
  ];
  const trees = treeSpots.slice(0, treeCfg.count);

  // shrubs scale with the back-wall length (one roughly every ~1.8 m), capped.
  const nShrub = Math.max(2, Math.min(7, Math.round((D - 0.8) / 1.8)));
  const plantZs = Array.from({ length: nShrub }).map(
    (_, i) => -hz + 0.4 + ((i + 0.5) * (D - 0.8)) / nShrub,
  );

  return (
    <group>
      {/* lawn */}
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <boxGeometry args={[W - 0.1, 0.04, D - 0.1]} />
        <meshStandardMaterial color={GRASS_COL} roughness={1} />
      </mesh>
      {/* paved approach path to the entrance */}
      <mesh position={[pathCx, 0.03, 0]} receiveShadow>
        <boxGeometry args={[pathLen, 0.06, Math.min(D * 0.22, 2.0)]} />
        <meshPhysicalMaterial color={PATH_COL} roughness={0.7} metalness={0} clearcoat={0.2} />
      </mesh>
      {/* trees scaled + counted to the plot area */}
      {trees.map(([tx, tz], i) => (
        <Tree key={i} x={tx} z={tz} scale={treeCfg.scale * (i % 2 ? 0.9 : 1)} />
      ))}
      {/* low shrubs along the West wall */}
      {plantZs.map((z, i) => (
        <mesh key={i} position={[-hx + 0.4, 0.22, z]} castShadow receiveShadow>
          <sphereGeometry args={[0.26, 10, 8]} />
          <meshStandardMaterial color="#5b8f38" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Swallows render/loader errors from a child subtree so an unreachable CDN asset
 *  (e.g. the HDRI when offline) can never crash the whole canvas — it just renders
 *  the fallback (here: nothing, leaving the baseline lights in charge). */
class SafeBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* asset failed (offline / blocked) — silently fall back */
  }
  render() {
    if (this.state.failed) return <>{this.props.fallback ?? null}</>;
    return <>{this.props.children}</>;
  }
}

/** Fits the camera to the whole scene once, then yields control to OrbitControls. */
function AutoFrame({ children }: { children: React.ReactNode }) {
  const api = useBounds();
  React.useEffect(() => {
    // wait a frame so children have mounted/measured, then fit + clip
    const id = requestAnimationFrame(() => api.refresh().clip().fit());
    return () => cancelAnimationFrame(id);
  }, [api]);
  return <>{children}</>;
}

function StructuralGrid({ structure, plan, W, D, mepMode }: { structure: StructureReport; plan: Plan; W: number; D: number; mepMode?: boolean }) {
  if (!structure.grid_x || !structure.grid_y) return null;
  const fp = footprint(plan.rooms);
  if (!fp) return null;
  
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;
  const colSize = 0.23; // 9 inches
  const floors = floorsOf(plan);
  const maxFloor = floors[floors.length - 1] ?? 0;
  const colH = (maxFloor + 1) * FLOOR_TO_FLOOR + PARAPET;

  const cols = [];
  for (const x of structure.grid_x) {
    for (const y of structure.grid_y) {
      if (x >= fp.x - 0.5 && x <= fp.x + fp.w + 0.5 && y >= fp.y - 0.5 && y <= fp.y + fp.h + 0.5) {
        cols.push({ x, y });
      }
    }
  }

  return (
    <group>
      {cols.map((c, i) => (
        <mesh key={i} position={[X(c.x), colH / 2, Z(c.y)]} castShadow={!mepMode} receiveShadow={!mepMode}>
          <boxGeometry args={[colSize, colH, colSize]} />
          {mepMode ? (
            <meshPhysicalMaterial color={CONCRETE} transmission={0.8} opacity={0.3} transparent roughness={0.3} />
          ) : (
            <ConcreteMat color={CONCRETE} />
          )}
        </mesh>
      ))}
    </group>
  );
}

function MepPipes({ plan, W, D }: { plan: Plan; W: number; D: number }) {
  const model = React.useMemo(() => buildMepModel(plan), [plan]);
  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;

  return (
    <group>
      {/* Plumbing Pipes */}
      {model.pipes.map(p => {
        const height = p.service === "soil" || p.service === "waste" ? FLOOR_Y + 0.1 : LINTEL + 0.2;
        const v3pts = p.points.map(pt => new THREE.Vector3(X(pt[0]), height, Z(pt[1])));
        if (v3pts.length < 2) return null;
        // sharp corners for pipes
        const curve = new THREE.CatmullRomCurve3(v3pts, false, 'chordal', 0);
        let color = "#9ca3af";
        if (p.service === "hot") color = "#dc2626";
        else if (p.service === "cold") color = "#2563eb";
        else if (p.service === "soil") color = "#7c4a1e";
        else if (p.service === "waste") color = "#15803d";
        
        return (
          <mesh key={p.id} castShadow>
            <tubeGeometry args={[curve, 64, (p.sizeMm / 1000) * 0.5, 8, false]} />
            <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
          </mesh>
        );
      })}
      
      {/* Conduits */}
      {model.conduits.map((c, i) => {
        const height = LINTEL + 0.4;
        const v3pts = c.points.map(pt => new THREE.Vector3(X(pt[0]), height, Z(pt[1])));
        if (v3pts.length < 2) return null;
        // smooth corners for conduit
        const curve = new THREE.CatmullRomCurve3(v3pts, false, 'catmullrom', 0.2);
        return (
          <mesh key={`cond-${i}`} castShadow>
            <tubeGeometry args={[curve, 64, 0.015, 8, false]} />
            <meshStandardMaterial color="#ca8a04" roughness={0.3} metalness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

function Scene({ plan, structure, mepMode, finishTier }: { plan: Plan; structure?: StructureReport; mepMode?: boolean; finishTier?: 'economy' | 'standard' | 'premium' }) {
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const openings = React.useMemo(() => placeOpenings(plan), [plan]);
  const floors = floorsOf(plan);
  const entranceId = React.useMemo(() => {
    const e = plan.rooms.find((r) => r.type === "entrance") ?? plan.rooms.find((r) => r.type === "sitout");
    return e?.id ?? null;
  }, [plan]);

  const span = Math.max(W, D);
  const isPremium = finishTier === 'premium';
  return (
    <>
      {/* perceptually-soft contact shadows from the directional sun */}
      <SoftShadows size={isPremium ? 50 : 30} samples={isPremium ? 24 : 16} focus={0.5} />

      {/* procedural sky — premium gets dramatic sunset, standard/basic get daylight */}
      {isPremium ? (
        <Sky distance={450000} sunPosition={[W * 0.8, 3, -D * 1.2]} turbidity={6} rayleigh={2.5} mieCoefficient={0.015} mieDirectionalG={0.92} />
      ) : (
        <Sky distance={450000} sunPosition={[W * 1.5, 12, -D * 0.8]} turbidity={8} rayleigh={1.5} mieCoefficient={0.008} mieDirectionalG={0.8} />
      )}

      {/* image-based lighting — premium uses sunset HDRI for rich glass reflections */}
      <SafeBoundary fallback={null}>
        <Suspense fallback={null}>
          <Environment
            preset={isPremium ? 'sunset' : 'apartment'}
            background={false}
            environmentIntensity={isPremium ? 1.2 : 0.55}
            resolution={isPremium ? 512 : 256}
          />
        </Suspense>
      </SafeBoundary>

      {/* baseline lights */}
      {isPremium ? (
        <>
          <hemisphereLight args={["#ffecd2", "#1a2a4a", 0.35]} />
          <ambientLight intensity={0.3} />
          {/* Golden-hour sun from low angle for maximum glass drama */}
          <directionalLight
            position={[W * 0.8, 8, -D * 1.2]}
            intensity={2.8}
            color="#ff9d4a"
            castShadow
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-camera-left={-W * 1.5}
            shadow-camera-right={W * 1.5}
            shadow-camera-top={D * 1.5}
            shadow-camera-bottom={-D * 1.5}
            shadow-camera-near={0.5}
            shadow-camera-far={120}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
          />
          {/* Cool fill from opposite side */}
          <directionalLight position={[-W, 6, D * 0.5]} intensity={0.6} color="#a0c8ff" />
          {/* Warm bounce from ground */}
          <pointLight position={[0, 0.5, 0]} intensity={0.8} color="#ffd080" distance={W * 3} decay={2} />
        </>
      ) : (
        <>
          <hemisphereLight args={["#fdf6e8", "#b8bdc8", 0.45]} />
          <ambientLight intensity={0.18} />
          <directionalLight
            position={[W * 1.5, 12, -D * 0.8]}
            intensity={2.2}
            color="#ffd7a0"
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
            shadow-normalBias={0.02}
          />
        </>
      )}

      {/* earth slab under the lawn (kept thin; lawn sits just above it) */}
      {!isPremium && (
        <mesh position={[0, -0.05, 0]} receiveShadow>
          <boxGeometry args={[W + 0.3, 0.12, D + 0.3]} />
          <meshStandardMaterial color="#b7a98f" roughness={1} />
        </mesh>
      )}
      {!isPremium && <SiteLandscape plan={plan} W={W} D={D} />}

      {/* auto-fit the building + site on first mount, then hand off to OrbitControls */}
      <Bounds clip margin={1.2}>
        <AutoFrame>
          {isPremium ? (
            <PremiumGlassHouseScene plan={plan} />
          ) : (
            <>
              {floors.map((f) => (
                <FloorGroup key={f} plan={plan} floor={f} W={W} D={D} openings={openings} entranceId={entranceId} mepMode={mepMode} />
              ))}
              <Slabs plan={plan} W={W} D={D} />
              {structure && <StructuralGrid structure={structure} plan={plan} W={W} D={D} mepMode={mepMode} />}
              <EntrancePorch plan={plan} W={W} D={D} />
              <CompoundWall W={W} D={D} />
              {mepMode && <MepPipes plan={plan} W={W} D={D} />}
            </>
          )}
        </AutoFrame>
      </Bounds>

      <ContactShadows position={[0, 0.04, 0]} scale={span * 1.6} blur={isPremium ? 3.5 : 2.4} opacity={isPremium ? 0.6 : 0.45} far={isPremium ? 12 : 8} resolution={1024} color={isPremium ? '#1a1a2e' : '#3b352c'} />
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

export function FloorPlan3D({ plan, structure, className, mepMode: controlledMepMode, finishTier }: { plan: Plan; structure?: StructureReport; className?: string; mepMode?: boolean; finishTier?: 'economy' | 'standard' | 'premium' }) {
  const [localMepMode, setLocalMepMode] = React.useState(false);
  const mepMode = controlledMepMode ?? localMepMode;
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const floors = Math.max(1, new Set(plan.rooms.map((r) => r.floor ?? 0)).size);
  const dist = Math.max(W, D);
  const h = floors * FLOOR_TO_FLOOR;
  return (
    <div className={cn("relative group", className)}>
      {controlledMepMode === undefined && (
        <button
          onClick={() => setLocalMepMode(m => !m)}
          className="absolute top-4 right-4 z-10 rounded-md bg-background/80 backdrop-blur px-3 py-1.5 text-xs font-semibold shadow border hover:bg-background transition"
        >
          {mepMode ? "Exit MEP X-Ray" : "MEP X-Ray"}
        </button>
      )}
      <Canvas
        shadows
        dpr={[1, 1.8]}
        camera={{ position: [W * 0.85, dist * 1.0 + h, D * 1.2 + h * 0.4], fov: 38, near: 0.1, far: 240 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
        style={{ background: finishTier === 'premium' ? "linear-gradient(180deg,#0a0a1a 0%,#1a1a2e 40%,#2d1a0a 100%)" : "linear-gradient(180deg,#cfe0f2 0%,#e8edf3 100%)" }}
      >
        <Scene plan={plan} structure={structure} mepMode={mepMode} finishTier={finishTier} />
      </Canvas>
    </div>
  );
}
