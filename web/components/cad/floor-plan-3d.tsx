"use client";

import * as React from "react";
import { Suspense } from "react";
import * as THREE from "three";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  ContactShadows,
  Sky,
  Environment,
  SoftShadows,
  Bounds,
  useBounds,
} from "@react-three/drei";
import type { Plan as SharedPlan, Room, StructureReport } from "@gharplan/shared";
type Plan = SharedPlan & { variantId?: string; variant?: string; id?: string };

function getCleanVariant(variant?: string, plan?: Plan): string {
  const vStr = variant || plan?.variantId || plan?.variant || '';
  if (!vStr) return '';
  const v = vStr.toLowerCase();
  if (v === 'vastu' || v === 'vastu_first') return 'vastu';
  if (v === 'courtyard') return 'courtyard';
  if (v === 'climate' || v === 'climate_first') return 'climate';
  if (v === 'modern' || v === 'modern_open') return 'modern';
  if (v === 'multigen' || v === 'multi_gen') return 'multigen';
  return v;
}
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

// material colours — authentic luxury Indian architecture palette (research-verified)
const PLASTER_EXT  = "#F5F0E8"; // warm lime white — exterior lime plaster
const PLASTER_INT  = "#F2EDE4"; // interior warm ivory
const PLINTH_COL   = "#B5652A"; // Kerala laterite stone
const STONE_BAND   = "#C9A97A"; // buff sandstone cladding / band courses
const CONCRETE     = "#BEBFBE"; // RCC slabs / chajja (cool grey)
const FRAME_COL    = "#4A2810"; // dark teak window/door frame
const GLASS_COL    = "#1A3A4A"; // deep tinted glazing (luxury Indian villa)
const DOOR_MAIN    = "#3D1C02"; // carved teak main door
const DOOR_INT     = "#8B6535"; // interior door warm teak
const TANK_COL     = "#1a1a1e"; // black Sintex tank
const MARBLE_COL   = "#F0EDE8"; // polished Calacatta marble — living/dining
const TEAK_COL     = "#4A2810"; // dark oiled teak joinery
const SOFA_COL     = "#5C6B7A"; // upholstered blue-grey
const FABRIC_COL   = "#D4C8B0"; // bed linen / soft furnishing
const STEEL_COL    = "#C8CDD4"; // appliances / steel
const TILE_WET     = "#8A8C7A"; // Kota stone — wet room
const GRASS_COL    = "#3A7D2C"; // lush tropical manicured lawn
const PATH_COL     = "#9A9A92"; // grey granite driveway paving
const TERRA_COL    = "#C1440E"; // Mangalore terracotta tile (authentic)
const TERRA_DARK   = "#8B3A2A"; // deep terracotta — ridge / shadow side
const LATERITE     = "#B5652A"; // laterite stone block courses
const COLUMN_COL   = "#F5F0E8"; // lime-washed column shaft (will show detail separately)
const BRASS_GOLD   = "#CFB53B"; // polished brass — Kalash, hardware, lanterns
const SANDSTONE    = "#C9A97A"; // Jodhpur sandstone for pillars / jharokha


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
const PremiumGlassMat = () => (
  <meshPhysicalMaterial color={PREMIUM_GLASS} roughness={0.0} metalness={0.1} transmission={0.92} thickness={0.08} ior={1.5} clearcoat={1.0} clearcoatRoughness={0.02} transparent opacity={0.85} envMapIntensity={2.0} reflectivity={0.9} />
);

const PremiumSteelMat = () => (
  <meshPhysicalMaterial color={PREMIUM_STEEL} roughness={0.1} metalness={0.95} clearcoat={0.8} clearcoatRoughness={0.05} envMapIntensity={2.0} />
);

const PremiumMarbleMat = () => (
  <meshPhysicalMaterial color={PREMIUM_MARBLE} roughness={0.05} metalness={0} clearcoat={1.0} clearcoatRoughness={0.05} envMapIntensity={1.5} />
);

const PremiumWoodMat = () => (
  <meshPhysicalMaterial color={PREMIUM_WOOD} roughness={0.3} metalness={0} clearcoat={0.6} clearcoatRoughness={0.2} envMapIntensity={0.8} />
);

const PremiumConcreteMat = () => (
  <meshPhysicalMaterial color={PREMIUM_CONCRETE} roughness={0.3} metalness={0.05} clearcoat={0.2} clearcoatRoughness={0.5} envMapIntensity={0.5} />
);

const PremiumGoldMat = () => (
  <meshPhysicalMaterial color={PREMIUM_GOLD} roughness={0.15} metalness={0.9} clearcoat={0.9} clearcoatRoughness={0.1} envMapIntensity={2.0} />
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
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const openings = React.useMemo(() => placeOpenings(plan), [plan]);
  const floors = floorsOf(plan);
  const entranceId = React.useMemo(() => {
    const e = plan.rooms.find((r) => r.type === "entrance") ?? plan.rooms.find((r) => r.type === "sitout");
    return e?.id ?? null;
  }, [plan]);

  const fp = footprint(plan.rooms);
  if (!fp) return null;

  const bW = fp.w;
  const bD = fp.h;
  const cx = fp.x + fp.w / 2 - W / 2;
  const cz = D / 2 - (fp.y + fp.h / 2);
  const toX = (px: number) => px - W / 2;
  const toZ = (py: number) => D / 2 - py;

  const isTraditional = getCleanVariant(plan.variant) === 'vastu' || getCleanVariant(plan.variant) === 'courtyard';
  const totalH = floors.length * FLOOR_TO_FLOOR;

  return (
    <group>
      {/* === 1. BASE LANDSCAPING === */}
      {isTraditional ? (
        <>
          <mesh receiveShadow position={[cx, 0.01, cz]}>
            <boxGeometry args={[bW + 6, 0.02, bD + 6]} />
            <meshStandardMaterial color="#302a24" roughness={0.9} />
          </mesh>
          <mesh receiveShadow position={[0, -0.01, 0]}>
            <boxGeometry args={[W + 20, 0.04, D + 20]} />
            <meshStandardMaterial color="#3d5e2d" roughness={0.95} />
          </mesh>
        </>
      ) : (
        <>
          <mesh receiveShadow position={[cx, 0.01, cz]}>
            <boxGeometry args={[bW + 4, 0.02, bD + 4]} />
            <meshStandardMaterial color="#22252a" roughness={0.9} />
          </mesh>
          <mesh receiveShadow position={[0, -0.01, 0]}>
            <boxGeometry args={[W + 20, 0.04, D + 20]} />
            <meshStandardMaterial color="#2d5c28" roughness={0.9} />
          </mesh>
          <mesh receiveShadow position={[toX(fp.x + fp.w) + 2.0, 0.11, cz]}>
            <boxGeometry args={[3.2, 0.08, bD + 2]} />
            <PremiumWoodMat />
          </mesh>
          <group position={[toX(fp.x + fp.w) + 2.0, 0.05, cz]}>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[2.4, 0.02, bD - 1]} />
              <meshPhysicalMaterial color="#0ea5e9" roughness={0.05} transmission={0.8} transparent opacity={0.8} />
            </mesh>
            <mesh position={[0, 0.062, 0]}>
              <boxGeometry args={[2.6, 0.01, bD - 0.8]} />
              <PremiumGoldMat />
            </mesh>
          </group>
        </>
      )}

      {/* Main Plinth */}
      <mesh receiveShadow castShadow position={[cx, 0.1, cz]}>
        <boxGeometry args={[bW + 1.2, 0.2, bD + 1.2]} />
        <PremiumConcreteMat />
      </mesh>

      {/* === 2. WATER FEATURE / ENTRY REFLECTING POND === */}
      <group position={[cx, 0.05, toZ(fp.y) + 3.2]}>
        <mesh receiveShadow position={[0, 0.05, 0]}>
          <boxGeometry args={[bW, 0.02, 2.5]} />
          <meshPhysicalMaterial
            color={isTraditional ? "#14b8a6" : "#0e7490"}
            roughness={0.01}
            transmission={0.9}
            transparent
            opacity={0.85}
            envMapIntensity={2.2}
          />
        </mesh>
        {[-1.5, 0, 1.5].map((offsetX, idx) => (
          <mesh key={`pond-step-${idx}`} castShadow receiveShadow position={[offsetX, 0.08, 0]}>
            <boxGeometry args={[0.8, 0.05, 1.2]} />
            <PremiumConcreteMat />
          </mesh>
        ))}
      </group>

      {/* === 3. CORE ARCHITECTURAL ROOMS & WALLS === */}
      {floors.map((f) => (
        <group key={`floor-${f}`} position={[0, f * FLOOR_TO_FLOOR, 0]}>
          {plan.rooms.filter((r) => !VIRTUAL.has(r.type) && (r.floor ?? 0) === f).map((room) => {
            const r = bounds(room.polygon);
            const rcx = r.x + r.w / 2 - W / 2;
            const rcz = D / 2 - (r.y + r.h / 2);
            const isEntry = room.id === entranceId;
            const { walls, glass, doors } = buildWallParts(room, openings, W, D, fp, isEntry);
            const wallCol = isTraditional ? "#eedfc2" : (f % 2 === 0 ? "#cbd5e1" : "#ebebeb");

            return (
              <group key={room.id}>
                {/* Room Floor slab */}
                <mesh position={[rcx, FLOOR_Y, rcz]} receiveShadow>
                  <boxGeometry args={[r.w - 0.04, 0.05, r.h - 0.04]} />
                  {isTraditional ? (
                    <meshStandardMaterial color={room.type === "pooja" ? "#e8d6a8" : (isMarbleFloor(room.type) ? "#8b2635" : "#ca8a04")} roughness={0.2} />
                  ) : (
                    <meshPhysicalMaterial color={isMarbleFloor(room.type) ? "#f8fafc" : "#cbd5e1"} roughness={0.05} clearcoat={1.0} />
                  )}
                </mesh>

                {/* Room Walls */}
                {walls.map((w, idx) => (
                  <mesh key={`w-${room.id}-${idx}`} position={w.pos} castShadow receiveShadow>
                    <boxGeometry args={w.size} />
                    <meshStandardMaterial color={wallCol} roughness={isTraditional ? 0.95 : 0.4} />
                  </mesh>
                ))}

                {/* Room Windows / Screens */}
                {glass.map((g, idx) => {
                  const isWestOrSouth = g.fixed === fp.y || g.fixed === fp.x || g.fixed === fp.y + fp.h || g.fixed === fp.x + fp.w;
                  const useJaali = isTraditional && isWestOrSouth && room.type !== "living";

                  return (
                    <group key={`g-${room.id}-${idx}`}>
                      {useJaali ? (
                        <group position={g.pos}>
                          <mesh castShadow>
                            <boxGeometry args={g.size} />
                            <meshStandardMaterial color="#b2533e" roughness={0.9} />
                          </mesh>
                        </group>
                      ) : (
                        <Window3D part={g} W={W} D={D} variant={plan.variantId} />
                      )}
                    </group>
                  );
                })}

                {/* Room Doors */}
                {doors.map((d, idx) => (
                  <Door3D key={`d-${room.id}-${idx}`} part={d} W={W} D={D} />
                ))}

                {/* Furniture */}
                <Furniture3D room={room} W={W} D={D} isTopFloor={f === floors[floors.length - 1]} variant={plan.variantId} />

                {/* Wooden pillars for balconies/porches */}
                {isTraditional && (room.type === "sitout" || room.type === "balcony" || room.type === "entrance") && (
                  <group position={[rcx, 0, rcz]}>
                    {[
                      [-r.w / 2 + 0.1, -r.h / 2 + 0.1],
                      [r.w / 2 - 0.1, -r.h / 2 + 0.1],
                      [-r.w / 2 + 0.1, r.h / 2 - 0.1],
                      [r.w / 2 - 0.1, r.h / 2 - 0.1],
                    ].map(([px, pz], pIdx) => (
                      <group key={`pillar-${pIdx}`} position={[px, 0, pz]}>
                        <mesh position={[0, 0.15, 0]} castShadow>
                          <cylinderGeometry args={[0.08, 0.1, 0.3, 8]} />
                          <meshStandardMaterial color="#3b3530" roughness={0.8} />
                        </mesh>
                        <mesh position={[0, WALL_H / 2 + 0.05, 0]} castShadow>
                          <cylinderGeometry args={[0.05, 0.06, WALL_H - 0.3, 8]} />
                          <PremiumWoodMat />
                        </mesh>
                        <mesh position={[0, WALL_H - 0.05, 0]}>
                          <boxGeometry args={[0.15, 0.1, 0.15]} />
                          <PremiumGoldMat />
                        </mesh>
                      </group>
                    ))}
                  </group>
                )}

                {/* Traditional Courtyard water fountain */}
                {room.type === "courtyard" && (
                  <group position={[rcx, 0.1, rcz]}>
                    <mesh position={[0, 0.05, 0]} castShadow>
                      <cylinderGeometry args={[0.7, 0.8, 0.15, 8]} />
                      <meshStandardMaterial color="#3b3530" roughness={0.9} />
                    </mesh>
                    <mesh position={[0, 0.12, 0]}>
                      <cylinderGeometry args={[0.66, 0.66, 0.02, 8]} />
                      <meshPhysicalMaterial color="#14b8a6" roughness={0.05} transmission={0.9} transparent opacity={0.8} />
                    </mesh>
                    <mesh position={[0, 0.25, 0]}>
                      <cylinderGeometry args={[0.05, 0.08, 0.3, 8]} />
                      <PremiumGoldMat />
                    </mesh>
                  </group>
                )}
              </group>
            );
          })}
        </group>
      ))}

      {/* === 4. ROOFING & SLABS SYSTEM === */}
      {isTraditional ? (
        <group position={[cx, totalH + 0.15, cz]}>
          <group rotation={[0, 0, 0.32]}>
            <mesh castShadow receiveShadow position={[-bW * 0.27, 0.45, 0]}>
              <boxGeometry args={[bW * 0.62, 0.08, bD + 1.2]} />
              <meshStandardMaterial color="#b2533e" roughness={0.85} />
            </mesh>
          </group>
          <group rotation={[0, 0, -0.32]}>
            <mesh castShadow receiveShadow position={[bW * 0.27, 0.45, 0]}>
              <boxGeometry args={[bW * 0.62, 0.08, bD + 1.2]} />
              <meshStandardMaterial color="#b2533e" roughness={0.85} />
            </mesh>
          </group>
          <mesh position={[0, 0.45 + bW * 0.088, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.11, bD + 1.28, 8]} />
            <meshStandardMaterial color="#943422" roughness={0.9} />
          </mesh>
        </group>
      ) : (
        <group position={[cx, totalH + 0.15, cz]}>
          <mesh receiveShadow castShadow position={[0, 0, 0]}>
            <boxGeometry args={[bW + 1.4, 0.15, bD + 1.4]} />
            <PremiumConcreteMat />
          </mesh>
          <mesh position={[0, 0.07, 0]}>
            <boxGeometry args={[bW + 1.43, 0.03, bD + 1.43]} />
            <PremiumGoldMat />
          </mesh>
          <group position={[0, 0.15, 0]}>
            <mesh castShadow>
              <boxGeometry args={[bW * 0.35, 0.2, bD * 0.35]} />
              <PremiumGlassMat />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[bW * 0.37, 0.04, bD * 0.37]} />
              <PremiumSteelMat />
            </mesh>
          </group>
        </group>
      )}

      {/* Slabs */}
      {floors.filter((f) => f > 0).map((f) => (
        <mesh key={`slab-${f}`} receiveShadow castShadow
          position={[cx, f * FLOOR_TO_FLOOR + 0.1, cz]}>
          <boxGeometry args={[bW + 0.6, 0.12, bD + 0.6]} />
          <PremiumMarbleMat />
        </mesh>
      ))}

      {/* === 5. PREMIUM SCULPTURAL LANDSCAPING === */}
      {([
        [toX(fp.x) - 3, 0.1, toZ(fp.y) + 1],
        [toX(fp.x + fp.w) + 3.5, 0.1, toZ(fp.y) + 2],
        [toX(fp.x) - 4, 0.1, cz],
        [toX(fp.x + fp.w) + 4, 0.1, cz],
        [toX(fp.x) - 3, 0.1, toZ(fp.y + fp.h) - 2],
        [toX(fp.x + fp.w) + 3, 0.1, toZ(fp.y + fp.h) - 1],
      ] as [number, number, number][]).map(([tx, ty, tz], i) => (
        <group key={`tree-${i}`} position={[tx, ty, tz]}>
          <mesh castShadow position={[0, 1.0, 0]}>
            <cylinderGeometry args={[0.08, 0.14, 2.0, 8]} />
            <meshStandardMaterial color="#2d1f18" roughness={0.95} />
          </mesh>
          <mesh castShadow position={[0.3, 2.1, 0.2]} rotation={[0.3, 0, 0.4]}>
            <cylinderGeometry args={[0.04, 0.07, 1.1, 6]} />
            <meshStandardMaterial color="#2d1f18" roughness={0.95} />
          </mesh>
          <mesh castShadow position={[-0.4, 2.2, -0.3]} rotation={[-0.4, 0, -0.5]}>
            <cylinderGeometry args={[0.04, 0.07, 1.2, 6]} />
            <meshStandardMaterial color="#2d1f18" roughness={0.95} />
          </mesh>
          <mesh castShadow position={[0, 2.7, 0]}>
            <dodecahedronGeometry args={[1.1, 1]} />
            <meshStandardMaterial color={isTraditional ? "#3b5c23" : "#224c1e"} roughness={0.85} />
          </mesh>
          <mesh castShadow position={[0.4, 2.8, 0.3]}>
            <dodecahedronGeometry args={[0.75, 1]} />
            <meshStandardMaterial color={isTraditional ? "#4a7431" : "#305f28"} roughness={0.8} />
          </mesh>
          <mesh castShadow position={[-0.5, 3.0, -0.4]}>
            <dodecahedronGeometry args={[0.85, 1]} />
            <meshStandardMaterial color={isTraditional ? "#2b4618" : "#1a3915"} roughness={0.9} />
          </mesh>
          <group position={[0, 0.02, 0.2]}>
            <mesh>
              <cylinderGeometry args={[0.04, 0.06, 0.1, 8]} />
              <PremiumGoldMat />
            </mesh>
            <spotLight
              position={[0, 0.08, 0]}
              angle={Math.PI / 5}
              penumbra={0.5}
              intensity={4.5}
              color="#ffdca0"
              distance={6}
              castShadow
            />
          </group>
        </group>
      ))}

      {/* === 6. FLOATING GOLD LED OUTLINE STRIPS === */}
      {floors.map((fl) => (
        <mesh key={`led-${fl}`}
          position={[cx, fl * FLOOR_TO_FLOOR + FLOOR_TO_FLOOR + 0.1, toZ(fp.y + fp.h) - 0.02]}>
          <boxGeometry args={[bW + 0.8, 0.02, 0.02]} />
          <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={2.5} />
        </mesh>
      ))}
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

// Traditional, Climate, Modern and Multigen window shading Chajjas — each
// variant gets a distinct sunshade language rather than one shared "modern" look.
function Chajja3D({ part, variant, px, headY, pz, span }: { part: GlassPart; variant?: string; px: number; headY: number; pz: number; span: number }) {
  const cv = getCleanVariant(variant);
  const isTraditional = cv === 'vastu' || cv === 'courtyard';
  const isClimate = cv === 'climate';
  const isModern = cv === 'modern';
  const outDir = part.horiz ? Math.sign(pz) || 1 : Math.sign(px) || 1;
  const hingeOff = WALL_T / 2;

  // Hinge position on the wall face
  const hx = part.horiz ? px : px + outDir * hingeOff;
  const hz = part.horiz ? pz + outDir * hingeOff : pz;

  const angle = 0.22; // ~12 degrees slope

  if (isTraditional) {
    // Traditional: sloped clay-tiled chajja with wooden brackets
    return (
      <group position={[hx, headY, hz]}>
        <group rotation={part.horiz ? [outDir * angle, 0, 0] : [0, 0, -outDir * angle]}>
          {/* Terracotta tile slab */}
          <mesh position={part.horiz ? [0, -CHAJJA_T / 2, outDir * CHAJJA_PROJ / 2] : [outDir * CHAJJA_PROJ / 2, -CHAJJA_T / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={part.horiz ? [span + 0.3, CHAJJA_T, CHAJJA_PROJ] : [CHAJJA_PROJ, CHAJJA_T, span + 0.3]} />
            <meshStandardMaterial color="#c86446" roughness={0.8} />
          </mesh>
          {/* Terracotta ridge tile cap */}
          <mesh position={part.horiz ? [0, 0, outDir * CHAJJA_PROJ] : [outDir * CHAJJA_PROJ, 0, 0]}>
            <boxGeometry args={part.horiz ? [span + 0.34, CHAJJA_T * 1.5, 0.04] : [0.04, CHAJJA_T * 1.5, span + 0.34]} />
            <meshStandardMaterial color="#943422" roughness={0.9} />
          </mesh>
        </group>
        {/* Teak bracket supports */}
        {[-span / 2 + 0.1, span / 2 - 0.1].map((offset, idx) => {
          const bPos: [number, number, number] = part.horiz
            ? [offset, -0.15, outDir * (CHAJJA_PROJ * 0.25)]
            : [outDir * (CHAJJA_PROJ * 0.25), -0.15, offset];
          return (
            <mesh key={idx} position={bPos} castShadow>
              <boxGeometry args={part.horiz ? [0.04, 0.3, CHAJJA_PROJ * 0.4] : [CHAJJA_PROJ * 0.4, 0.3, 0.04]} />
              <TeakMat />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (isClimate) {
    // Climate-Optimized Passive Design: a deep brise-soleil sunshade — nearly
    // double the baseline projection — plus angled louver fins that cut direct
    // high-sun while keeping diffuse daylight, in a pale heat-reflective tone
    // (never dark terracotta, which absorbs heat).
    const proj = CHAJJA_PROJ * 1.9;
    const louverCount = Math.max(3, Math.round(span / 0.5));
    return (
      <group position={[hx, headY, hz]}>
        {/* pale reflective RCC sunshade slab, deep projection */}
        <mesh position={part.horiz ? [0, CHAJJA_T / 2, outDir * proj / 2] : [outDir * proj / 2, CHAJJA_T / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={part.horiz ? [span + 0.3, CHAJJA_T, proj] : [proj, CHAJJA_T, span + 0.3]} />
          <meshStandardMaterial color="#e4e0d0" roughness={0.7} />
        </mesh>
        {/* fascia drip edge */}
        <mesh position={part.horiz ? [0, -0.03, outDir * proj] : [outDir * proj, -0.03, 0]} castShadow>
          <boxGeometry args={part.horiz ? [span + 0.3, 0.06, 0.03] : [0.03, 0.06, span + 0.3]} />
          <meshStandardMaterial color="#c8c2ae" roughness={0.65} />
        </mesh>
        {/* angled brise-soleil louver fins hung beneath the slab */}
        {Array.from({ length: louverCount }).map((_, idx) => {
          const t = louverCount === 1 ? 0.5 : idx / (louverCount - 1);
          const off = (t - 0.5) * (span - 0.25);
          const finPos: [number, number, number] = part.horiz
            ? [off, -0.16, outDir * proj * 0.55]
            : [outDir * proj * 0.55, -0.16, off];
          return (
            <mesh
              key={idx}
              position={finPos}
              rotation={part.horiz ? [outDir * 0.55, 0, 0] : [0, 0, -outDir * 0.55]}
              castShadow
            >
              <boxGeometry args={part.horiz ? [0.05, 0.22, proj * 0.7] : [proj * 0.7, 0.22, 0.05]} />
              <meshStandardMaterial color="#b8c2b0" roughness={0.55} metalness={0.1} />
            </mesh>
          );
        })}
        {/* slim support struts */}
        {[-span / 2 + 0.12, span / 2 - 0.12].map((offset, idx) => {
          const sPos: [number, number, number] = part.horiz
            ? [offset, -0.18, outDir * (proj * 0.35)]
            : [outDir * (proj * 0.35), -0.18, offset];
          return (
            <mesh key={idx} position={sPos} castShadow>
              <boxGeometry args={part.horiz ? [0.03, 0.32, proj * 0.6] : [proj * 0.6, 0.32, 0.03]} />
              <meshStandardMaterial color="#8a8f86" metalness={0.5} roughness={0.3} />
            </mesh>
          );
        })}
      </group>
    );
  }

  if (isModern) {
    // Modern Open-Plan: minimal drip-edge only, no deep overhang — the large
    // glazing (see Window3D) reads as the signature, not the shade.
    const proj = CHAJJA_PROJ * 0.32;
    return (
      <group position={[hx, headY, hz]}>
        <mesh position={part.horiz ? [0, -0.01, outDir * proj / 2] : [outDir * proj / 2, -0.01, 0]} castShadow receiveShadow>
          <boxGeometry args={part.horiz ? [span + 0.06, CHAJJA_T * 0.6, proj] : [proj, CHAJJA_T * 0.6, span + 0.06]} />
          <ConcreteMat color="#d8d4cf" />
        </mesh>
      </group>
    );
  }

  // Multigen (and any other/unknown variant): flat concrete slab with steel struts
  return (
    <group position={[hx, headY, hz]}>
      <mesh position={part.horiz ? [0, CHAJJA_T / 2, outDir * CHAJJA_PROJ / 2] : [outDir * CHAJJA_PROJ / 2, CHAJJA_T / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={part.horiz ? [span + 0.2, CHAJJA_T, CHAJJA_PROJ] : [CHAJJA_PROJ, CHAJJA_T, span + 0.2]} />
        <ConcreteMat />
      </mesh>
      {[-span / 2 + 0.15, span / 2 - 0.15].map((offset, idx) => {
        const sPos: [number, number, number] = part.horiz
          ? [offset, -0.12, outDir * (CHAJJA_PROJ * 0.3)]
          : [outDir * (CHAJJA_PROJ * 0.3), -0.12, offset];
        return (
          <mesh key={idx} position={sPos} castShadow>
            <boxGeometry args={part.horiz ? [0.02, 0.24, CHAJJA_PROJ * 0.5] : [CHAJJA_PROJ * 0.5, 0.24, 0.02]} />
            <meshStandardMaterial color="#5a5550" metalness={0.8} roughness={0.2} />
          </mesh>
        );
      })}
    </group>
  );
}

// Parapet wall - traditional jaali screen or modern sleek concrete band
function ParapetSide({
  start,
  end,
  yBase,
  isTraditional,
  horiz,
}: {
  start: [number, number];
  end: [number, number];
  yBase: number;
  isTraditional: boolean;
  horiz: boolean;
}) {
  const len = horiz ? end[0] - start[0] : end[1] - start[1];
  const cx = (start[0] + end[0]) / 2;
  const cz = (start[1] + end[1]) / 2;
  
  if (isTraditional) {
    const baseH = 0.35;
    const jaaliH = 0.45;
    const copingH = 0.04;
    
    const brickW = 0.15;
    const gapW = 0.15;
    const pitch = brickW + gapW;
    const count = Math.max(1, Math.floor(len / pitch));
    const startOffset = -((count - 1) * pitch) / 2;
    
    return (
      <group>
        {/* Solid base plaster wall */}
        <mesh position={[cx, yBase + baseH / 2, cz]} castShadow receiveShadow>
          <boxGeometry args={horiz ? [len, baseH, WALL_T] : [WALL_T, baseH, len]} />
          <meshStandardMaterial color={PLASTER_EXT} roughness={0.92} />
        </mesh>
        
        {/* Jaali brick screen */}
        {Array.from({ length: count }).map((_, i) => {
          const offset = startOffset + i * pitch;
          const bx = horiz ? cx + offset : cx;
          const bz = horiz ? cz : cz + offset;
          return (
            <mesh key={i} position={[bx, yBase + baseH + jaaliH / 2, bz]} castShadow receiveShadow>
              <boxGeometry args={horiz ? [brickW, jaaliH, WALL_T - 0.01] : [WALL_T - 0.01, jaaliH, brickW]} />
              <meshStandardMaterial color="#b2533e" roughness={0.85} />
            </mesh>
          );
        })}
        
        {/* Terracotta tiled coping on top */}
        <mesh position={[cx, yBase + baseH + jaaliH + copingH / 2, cz]} castShadow receiveShadow>
          <boxGeometry args={horiz ? [len + 0.1, copingH, WALL_T + 0.04] : [WALL_T + 0.04, copingH, len + 0.1]} />
          <meshStandardMaterial color="#943422" roughness={0.9} />
        </mesh>
      </group>
    );
  } else {
    // Modern: solid plaster parapet with concrete coping cap
    return (
      <group>
        <mesh position={[cx, yBase + PARAPET / 2, cz]} castShadow receiveShadow>
          <boxGeometry args={horiz ? [len, PARAPET, WALL_T] : [WALL_T, PARAPET, len]} />
          <meshStandardMaterial color={PLASTER_EXT} roughness={0.92} />
        </mesh>
        <mesh position={[cx, yBase + PARAPET + 0.02, cz]} castShadow>
          <boxGeometry args={horiz ? [len + 0.04, 0.04, WALL_T + 0.02] : [WALL_T + 0.02, 0.04, len + 0.04]} />
          <ConcreteMat />
        </mesh>
      </group>
    );
  }
}

const WET = /toilet|bath|kitchen|utility|wash/;
const VIRTUAL = new Set(["overhead_tank", "borewell", "brahmasthan"]);
const SITE_TYPES = new Set(["parking", "sitout", "courtyard", "garden", "service_shaft", "future_expansion", "balcony"]);

// professional, muted material palette by room family
function floorColor(type: string): string {
  if (type === "parking") return "#cbd5e1";
  if (type === "sitout" || type === "balcony") return "#f4d7a1";
  // Courtyard reads as a paved, lived-in open court (Furniture3D adds the paved
  // border + centerpiece); garden stays a green lawn — the two shouldn't look
  // like the same leftover void.
  if (type === "courtyard") return "#b8ab8c";
  if (type === "garden") return "#a7d8aa";
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
function Window3D({ part, W, D, variant }: { part: GlassPart; W: number; D: number; variant?: string }) {
  const [px, py, pz] = part.pos;
  const [sx, sy, sz] = part.size;
  // span/up = the two in-plane dimensions of the window; depth runs through the wall
  const span = part.horiz ? sx : sz;
  const up = sy;
  const isModern = getCleanVariant(variant) === 'modern';
  // Modern Open-Plan: a slimmer frame + no cross mullions reads as one large
  // picture-window sheet — a bigger glazing ratio within the same structural
  // opening (other variants keep the divided, traditionally-proportioned sash).
  const F = isModern ? 0.03 : 0.05; // frame / mullion thickness
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
    // modern: skip the cross mullions entirely — a single uninterrupted pane
    ...(isModern
      ? []
      : [
          { pos: inPlane(0, 0), size: inPlaneSize(span, F) }, // horizontal mullion
          { pos: inPlane(0, 0), size: inPlaneSize(F, up) }, // vertical mullion
        ]),
  ];

  const headY = FLOOR_Y + part.sill + up; // top of the glazed band (lintel)

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
      {part.exterior && (
        <Chajja3D part={part} variant={variant} px={px} headY={headY} pz={pz} span={span} />
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

function Furniture3D({ room, W, D, isTopFloor = false, variant }: { room: Room; W: number; D: number; isTopFloor?: boolean; variant?: string }) {
  const r = bounds(room.polygon);
  const cx = r.x + r.w / 2 - W / 2;
  const cz = D / 2 - (r.y + r.h / 2);
  const t = room.type;

  // a top-floor stair has no slab void above it (only the terrace + mumty), so it
  // lands on the roof surface rather than rising into the solid roof soffit.
  if (t === "staircase") return <StairSteps room={room} W={W} D={D} toRoof={isTopFloor} />;

  if (t === "parking") return <Car cx={cx} cz={cz} along={r.h >= r.w} />;
  
  // Courtyard room: a genuine reserved open-to-sky void (walls already leave it
  // unenclosed — see SITE_TYPES/exteriorEdges), not a token green rectangle.
  // Every variant gets a real paved surround; the centerpiece differs by variant.
  if (t === "courtyard") {
    const cv = getCleanVariant(variant);
    const paveInset = Math.min(0.4, Math.min(r.w, r.h) * 0.22);
    const paveBorder = (
      <>
        {([
          { pos: [0, 0.02, -r.h / 2 + paveInset / 2], size: [r.w - 0.08, 0.03, paveInset] },
          { pos: [0, 0.02, r.h / 2 - paveInset / 2], size: [r.w - 0.08, 0.03, paveInset] },
          { pos: [-r.w / 2 + paveInset / 2, 0.02, 0], size: [paveInset, 0.03, r.h - 0.08] },
          { pos: [r.w / 2 - paveInset / 2, 0.02, 0], size: [paveInset, 0.03, r.h - 0.08] },
        ] as { pos: [number, number, number]; size: [number, number, number] }[]).map((b, i) => (
          <mesh key={`cypv${i}`} position={b.pos} receiveShadow>
            <boxGeometry args={b.size} />
            <meshStandardMaterial color="#b0a58c" roughness={0.85} />
          </mesh>
        ))}
      </>
    );

    // Vastu-First: private household Tulsi Vrindavan shrine (baseline look, unchanged)
    if (cv === "vastu") {
      return (
        <group position={[cx, FLOOR_Y, cz]}>
          {paveBorder}
          {/* Plinth Base */}
          <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.5, 0.3, 0.5]} />
            <meshStandardMaterial color="#b2533e" roughness={0.85} />
          </mesh>
          {/* Molded cap */}
          <mesh position={[0, 0.32, 0]} castShadow>
            <boxGeometry args={[0.54, 0.04, 0.54]} />
            <meshStandardMaterial color="#8b2635" roughness={0.9} />
          </mesh>
          {/* Soil top */}
          <mesh position={[0, 0.345, 0]}>
            <boxGeometry args={[0.44, 0.01, 0.44]} />
            <meshStandardMaterial color="#403024" roughness={1.0} />
          </mesh>
          {/* Tulsi Plant */}
          <group position={[0, 0.35, 0]}>
            <mesh position={[0, 0.1, 0]} castShadow>
              <cylinderGeometry args={[0.015, 0.02, 0.2, 5]} />
              <meshStandardMaterial color="#4a3018" />
            </mesh>
            {[-1, 1].map((dir, idx) => (
              <group key={idx} position={[dir * 0.05, 0.15, 0]} rotation={[0, 0, dir * 0.5]}>
                <mesh position={[0, 0.06, 0]} castShadow>
                  <cylinderGeometry args={[0.008, 0.012, 0.12, 4]} />
                  <meshStandardMaterial color="#4a3018" />
                </mesh>
                <mesh position={[0, 0.12, 0]}>
                  <dodecahedronGeometry args={[0.08, 1]} />
                  <meshStandardMaterial color="#1e5e2e" roughness={0.9} />
                </mesh>
              </group>
            ))}
            <mesh position={[0, 0.22, 0]} castShadow>
              <dodecahedronGeometry args={[0.1, 1]} />
              <meshStandardMaterial color="#2d7c3e" roughness={0.85} />
            </mesh>
          </group>
        </group>
      );
    }

    // Courtyard-Centered Indian Vernacular: this room IS the star feature — a
    // proper paved court with a central brass-finial fountain + corner planters,
    // scaled to whatever size the reserved void ends up (robust to a small or
    // generous court, since the engine now guarantees a real one for this variant).
    if (cv === "courtyard") {
      const rad = Math.min(r.w, r.h);
      const scale = Math.min(Math.max(rad * 0.32, 0.7), 1.35);
      return (
        <group position={[cx, FLOOR_Y, cz]}>
          {paveBorder}
          {/* fountain basin */}
          <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.75 * scale, 0.85 * scale, 0.15, 16]} />
            <meshStandardMaterial color="#3b3530" roughness={0.9} />
          </mesh>
          {/* water surface */}
          <mesh position={[0, 0.13, 0]}>
            <cylinderGeometry args={[0.7 * scale, 0.7 * scale, 0.03, 16]} />
            <meshPhysicalMaterial color="#14b8a6" roughness={0.05} transmission={0.85} transparent opacity={0.85} envMapIntensity={1.5} />
          </mesh>
          {/* brass spout column + finial */}
          <mesh position={[0, 0.13 + 0.16 * scale, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.09, 0.32 * scale, 8]} />
            <meshStandardMaterial color={BRASS_GOLD} roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.13 + 0.34 * scale, 0]} castShadow>
            <sphereGeometry args={[0.09, 10, 8]} />
            <meshStandardMaterial color={BRASS_GOLD} roughness={0.25} metalness={0.85} />
          </mesh>
          {/* corner potted plants — only when the court is roomy enough to take them */}
          {rad > 1.8 && ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]).map(([sx, sz], i) => (
            <group key={`cypot${i}`} position={[sx * (r.w / 2 - 0.42), 0, sz * (r.h / 2 - 0.42)]}>
              <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.16, 0.12, 0.24, 8]} />
                <meshStandardMaterial color="#8b4a2a" roughness={0.9} />
              </mesh>
              <mesh position={[0, 0.34, 0]} castShadow>
                <dodecahedronGeometry args={[0.22, 0]} />
                <meshStandardMaterial color="#2d7c3e" roughness={0.85} />
              </mesh>
            </group>
          ))}
        </group>
      );
    }

    // Climate / Modern / Multigen (or any other variant) that ends up with a real
    // courtyard room: still a genuine paved court, with a simple shade tree —
    // never just a bare green rectangle.
    const rad = Math.min(r.w, r.h);
    const scale = Math.min(Math.max(rad * 0.35, 0.6), 1.1);
    const trunkH = 1.2 * scale;
    return (
      <group position={[cx, FLOOR_Y, cz]}>
        {paveBorder}
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[0.04 * scale, 0.06 * scale, trunkH, 8]} />
          <meshStandardMaterial color="#4b3524" roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0.12 * scale, trunkH * 0.9, 0.08 * scale]} rotation={[0.3, 0, 0.4]}>
          <cylinderGeometry args={[0.02 * scale, 0.03 * scale, trunkH * 0.5, 6]} />
          <meshStandardMaterial color="#4b3524" roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0, trunkH * 1.15, 0]}>
          <dodecahedronGeometry args={[0.5 * scale, 1]} />
          <meshStandardMaterial color="#224c1e" roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0.2 * scale, trunkH * 1.2, 0.15 * scale]}>
          <dodecahedronGeometry args={[0.36 * scale, 1]} />
          <meshStandardMaterial color="#305f28" roughness={0.8} />
        </mesh>
      </group>
    );
  }

  if (t === "garden") {
    // Beautiful branching tree scaled to fit
    const rad = Math.min(r.w, r.h);
    const scale = Math.min(Math.max(rad * 0.35, 0.6), 1.1);
    const trunkH = 1.2 * scale;
    const isTraditional = getCleanVariant(variant) === "vastu" || getCleanVariant(variant) === "courtyard";
    return (
      <group position={[cx, FLOOR_Y, cz]}>
        <mesh castShadow position={[0, trunkH / 2, 0]}>
          <cylinderGeometry args={[0.04 * scale, 0.06 * scale, trunkH, 8]} />
          <meshStandardMaterial color="#4b3524" roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0.15 * scale, trunkH * 0.85, 0.1 * scale]} rotation={[0.3, 0, 0.4]}>
          <cylinderGeometry args={[0.02 * scale, 0.03 * scale, trunkH * 0.5, 6]} />
          <meshStandardMaterial color="#4b3524" roughness={0.95} />
        </mesh>
        <mesh castShadow position={[-0.18 * scale, trunkH * 0.9, -0.12 * scale]} rotation={[-0.4, 0, -0.5]}>
          <cylinderGeometry args={[0.02 * scale, 0.03 * scale, trunkH * 0.55, 6]} />
          <meshStandardMaterial color="#4b3524" roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0, trunkH * 1.15, 0]}>
          <dodecahedronGeometry args={[0.55 * scale, 1]} />
          <meshStandardMaterial color={isTraditional ? "#3b5c23" : "#224c1e"} roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0.2 * scale, trunkH * 1.2, 0.15 * scale]}>
          <dodecahedronGeometry args={[0.4 * scale, 1]} />
          <meshStandardMaterial color={isTraditional ? "#4a7431" : "#305f28"} roughness={0.8} />
        </mesh>
        <mesh castShadow position={[-0.25 * scale, trunkH * 1.25, -0.2 * scale]}>
          <dodecahedronGeometry args={[0.45 * scale, 1]} />
          <meshStandardMaterial color={isTraditional ? "#2b4618" : "#1a3915"} roughness={0.9} />
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
  const cv = getCleanVariant(undefined, plan);
  const isTraditional = cv === 'vastu' || cv === 'courtyard';

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
        
        // Dynamic style colors based on variant — each of the 5 gets its own tone
        // rather than climate/modern sharing one grey.
        let wallCol = hasExt ? PLASTER_EXT : PLASTER_INT;
        if (hasExt) {
          if (cv === 'vastu' || cv === 'courtyard') {
            wallCol = '#eedfc2'; // warm mud-plaster yellow
          } else if (cv === 'climate') {
            wallCol = '#eef1e6'; // pale cool lime-wash — heat-reflective, passive-cooling cue
          } else if (cv === 'modern') {
            wallCol = '#cbd5e1'; // raw concrete/slate grey — sleek open-plan
          } else if (cv === 'multigen') {
            // grounded stone-plaster on the elders' ground floor, lighter above —
            // signals the ground/upper generational split visually.
            wallCol = floor === 0 ? '#c9bfa4' : '#eae5db';
          }
        }

        let fcol = floorColor(room.type);
        if (isTraditional) {
          if (room.type === "living" || room.type === "dining" || room.type === "entrance") {
            fcol = "#8b2635"; // Athangudi red tile color
          } else if (room.type.includes("bedroom")) {
            fcol = "#d6ae5c"; // Jaisalmer yellow stone color
          } else if (room.type === "pooja") {
            fcol = "#e8c87e"; // bright yellow marigold pooja floor
          }
        }

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
              <Window3D key={`g${i}`} part={g} W={W} D={D} variant={plan.variantId} />
            ))}
            {doors.map((d, i) => (
              <Door3D key={`d${i}`} part={d} W={W} D={D} />
            ))}
            <Furniture3D room={room} W={W} D={D} isTopFloor={isTopFloor} variant={plan.variantId} />
            {isTraditional && (room.type === "sitout" || room.type === "balcony" || room.type === "entrance") && (
              <group position={[cx, 0, cz]}>
                {[
                  [-r.w / 2 + 0.1, -r.h / 2 + 0.1],
                  [r.w / 2 - 0.1, -r.h / 2 + 0.1],
                  [-r.w / 2 + 0.1, r.h / 2 - 0.1],
                  [r.w / 2 - 0.1, r.h / 2 - 0.1],
                ].map(([px, pz], pIdx) => (
                  <group key={`pillar-${pIdx}`} position={[px, 0, pz]}>
                    <mesh position={[0, 0.15, 0]} castShadow>
                      <cylinderGeometry args={[0.08, 0.1, 0.3, 8]} />
                      <meshStandardMaterial color="#3b3530" roughness={0.8} />
                    </mesh>
                    <mesh position={[0, WALL_H / 2 + 0.05, 0]} castShadow>
                      <cylinderGeometry args={[0.05, 0.06, WALL_H - 0.3, 8]} />
                      <TeakMat />
                    </mesh>
                    <mesh position={[0, WALL_H - 0.05, 0]}>
                      <boxGeometry args={[0.15, 0.1, 0.15]} />
                      <meshStandardMaterial color="#caa15a" metalness={0.5} roughness={0.2} />
                    </mesh>
                  </group>
                ))}
              </group>
            )}
            {room.type === "balcony" && <Railing room={room} W={W} D={D} />}
          </group>
        );
      })}
      {/* darker projecting plinth course around the ground-floor footprint */}
      {exterior && <Plinth fp={fp} W={W} D={D} variant={cv} />}
      {/* Sandstone band molding at lintel height — runs around the exterior footprint
          This is a signature Indian architectural element (Chettinad / Kerala / North Indian) */}
      {fp && (() => {
        const fcx = fp.x + fp.w / 2 - W / 2;
        const fcz = D / 2 - (fp.y + fp.h / 2);
        const out = 0.06;
        const bT = WALL_T + 2 * out; // band thickness (projects slightly)
        const bH = 0.08; // band height
        const bandY = FLOOR_Y + LINTEL + 0.04; // just above lintel
        const bandBands: Box[] = [
          { pos: [fcx, bandY, D / 2 - fp.y], size: [fp.w + 2 * out, bH, bT] },
          { pos: [fcx, bandY, D / 2 - (fp.y + fp.h)], size: [fp.w + 2 * out, bH, bT] },
          { pos: [fp.x - W / 2, bandY, fcz], size: [bT, bH, fp.h + 2 * out] },
          { pos: [fp.x + fp.w - W / 2, bandY, fcz], size: [bT, bH, fp.h + 2 * out] },
        ];
        return (
          <>
            {bandBands.map((b, i) => (
              <mesh key={`band${i}`} position={b.pos} castShadow receiveShadow>
                <boxGeometry args={b.size} />
                <meshStandardMaterial color={STONE_BAND} roughness={0.8} />
              </mesh>
            ))}
          </>
        );
      })()}
    </group>

  );
}

/** Laterite stone plinth with a sandstone molding cap band — authentic South Indian base. */
function Plinth({ fp, W, D, variant }: { fp: Rect; W: number; D: number; variant?: string }) {
  const cv = getCleanVariant(variant);
  // Base course + cap tone read per variant — this band only ever renders on the
  // ground floor (see the `exterior` gate at the call site), so for Multigen it
  // doubles as the "grounded" visual cue for the elders'-floor / family-floor split.
  const baseCol =
    cv === 'multigen' ? '#4a4238' // dark basalt-toned stone — deliberately grounded
    : cv === 'climate' ? '#c9bfa0' // pale limestone — cooler than laterite
    : cv === 'modern' ? '#aab0b8' // sleek grey concrete plinth
    : LATERITE; // vastu / courtyard — laterite stone (unchanged baseline)
  const capCol = cv === 'multigen' ? '#332d26' : cv === 'modern' ? CONCRETE : STONE_BAND;
  const baseRough = cv === 'modern' ? 0.5 : 0.95;
  const cx = fp.x + fp.w / 2 - W / 2;
  const cz = D / 2 - (fp.y + fp.h / 2);
  const out = 0.08; // projection past the wall face — wider for Indian plinth
  const t = WALL_T + 2 * out;
  const baseCourse = PLINTH_H * 0.65;
  const topMold = PLINTH_H * 0.35;
  // Four sides of base laterite plinth
  const baseBands: Box[] = [
    { pos: [cx, FLOOR_Y + baseCourse / 2, D / 2 - fp.y], size: [fp.w + 2 * out, baseCourse, t] },
    { pos: [cx, FLOOR_Y + baseCourse / 2, D / 2 - (fp.y + fp.h)], size: [fp.w + 2 * out, baseCourse, t] },
    { pos: [fp.x - W / 2, FLOOR_Y + baseCourse / 2, cz], size: [t, baseCourse, fp.h + 2 * out] },
    { pos: [fp.x + fp.w - W / 2, FLOOR_Y + baseCourse / 2, cz], size: [t, baseCourse, fp.h + 2 * out] },
  ];
  // Sandstone molding cap band above plinth
  const capOut = out + 0.025;
  const capT = WALL_T + 2 * capOut;
  const capBands: Box[] = [
    { pos: [cx, FLOOR_Y + baseCourse + topMold / 2, D / 2 - fp.y], size: [fp.w + 2 * capOut, topMold, capT] },
    { pos: [cx, FLOOR_Y + baseCourse + topMold / 2, D / 2 - (fp.y + fp.h)], size: [fp.w + 2 * capOut, topMold, capT] },
    { pos: [fp.x - W / 2, FLOOR_Y + baseCourse + topMold / 2, cz], size: [capT, topMold, fp.h + 2 * capOut] },
    { pos: [fp.x + fp.w - W / 2, FLOOR_Y + baseCourse + topMold / 2, cz], size: [capT, topMold, fp.h + 2 * capOut] },
  ];
  return (
    <>
      {baseBands.map((b, i) => (
        <mesh key={`bp${i}`} position={b.pos} castShadow receiveShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={baseCol} roughness={baseRough} />
        </mesh>
      ))}
      {capBands.map((b, i) => (
        <mesh key={`cp${i}`} position={b.pos} castShadow receiveShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={capCol} roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

/** Ornate Indian entrance porch (Poomukham) with authentic Kerala-style teak columns
 *  resting on stone plinths, a proper 35° pitched hip roof canopy with terracotta tiles,
 *  and an auspicious 3-step dark granite approach. */
function EntrancePorch({ plan, W, D }: { plan: Plan; W: number; D: number }) {
  const fp = buildingFootprint(plan, 0);
  const entry =
    plan.rooms.find((r) => r.type === "entrance" && (r.floor ?? 0) === 0) ??
    plan.rooms.find((r) => r.type === "sitout" && (r.floor ?? 0) === 0);
  if (!entry) return null;
  const r = bounds(entry.polygon);
  const ext = exteriorEdges(r, fp);
  const face: Edge | null = ext.E ? "E" : ext.S ? "S" : ext.W ? "W" : ext.N ? "N" : null;
  if (!face) return null;

  const X = (px: number) => px - W / 2;
  const Z = (py: number) => D / 2 - py;
  const proj = 2.2; // Generous 2.2m deep luxury porch
  const w = Math.min(face === "N" || face === "S" ? r.w : r.h, 4.0);
  
  const colH = LINTEL + 0.35; // taller columns
  const canopyBaseY = FLOOR_Y + colH;
  const along = face === "N" || face === "S";

  let wallCx: number, wallCz: number, dx = 0, dz = 0;
  if (face === "S") { wallCx = r.x + r.w / 2; wallCz = r.y; dz = -1; }
  else if (face === "N") { wallCx = r.x + r.w / 2; wallCz = r.y + r.h; dz = 1; }
  else if (face === "W") { wallCx = r.x; wallCz = r.y + r.h / 2; dx = -1; }
  else { wallCx = r.x + r.w; wallCz = r.y + r.h / 2; dx = 1; }

  const outAt = (d: number): [number, number] => [X(wallCx + dx * d), Z(wallCz + dz * d)];
  const [slabX, slabZ] = outAt(proj / 2);
  const colInset = w / 2 - 0.3;
  const [colCx, colCz] = outAt(proj - 0.2);

  // Helper for true hip roof canopy slopes
  const buildSlope = (verts: [number,number,number][]): THREE.BufferGeometry => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([...verts[0], ...verts[1], ...verts[2], ...verts[0], ...verts[2], ...verts[3]]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const buildTri = (verts: [number,number,number][]): THREE.BufferGeometry => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([...verts[0], ...verts[1], ...verts[2]]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  };

  // Porch roof parameters (Pitch 35°)
  const pOverhang = 0.5;
  const pW = w + pOverhang * 2;
  const pD = proj + pOverhang; // flush with wall on one side
  const pitch = Math.tan(35 * Math.PI / 180); // ~0.7
  const shortH = Math.min(pW, pD) / 2;
  const pRise = shortH * pitch;
  const pRidgeLen = Math.max(0.1, Math.max(pW, pD) - Math.min(pW, pD));
  
  // Orient canopy ridge
  const ridgeAlongZ = along ? false : true;
  const rL = (ridgeAlongZ ? pD : pW) / 2;
  const rS = (ridgeAlongZ ? pW : pD) / 2;
  const rR = pRidgeLen / 2;

  // Authentic Kerala carved teak column
  const OrnateColumn = ({ px, pz }: { px: number; pz: number }) => (
    <group position={[px, FLOOR_Y, pz]}>
      {/* Stone Pedestal */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.2, 0.32]} />
        <meshStandardMaterial color={SANDSTONE} roughness={0.9} />
      </mesh>
      {/* Brass decorative band at base */}
      <mesh position={[0, 0.23, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.15, 0.06, 12]} />
        <meshStandardMaterial color={BRASS_GOLD} roughness={0.3} metalness={0.8} />
      </mesh>
      {/* Main Teak Shaft - Octagonal */}
      <mesh position={[0, colH * 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.12, colH - 0.5, 8]} />
        <meshStandardMaterial color={TEAK_COL} roughness={0.8} />
      </mesh>
      {/* Carved teak rings (Thadam) */}
      <mesh position={[0, colH * 0.75, 0]} castShadow>
        <torusGeometry args={[0.12, 0.02, 8, 8]} />
        <meshStandardMaterial color={TEAK_COL} roughness={0.8} />
      </mesh>
      <mesh position={[0, colH * 0.85, 0]} castShadow>
        <torusGeometry args={[0.12, 0.02, 8, 8]} />
        <meshStandardMaterial color={TEAK_COL} roughness={0.8} />
      </mesh>
      {/* Capital Block (Pothigai corbel) */}
      <mesh position={[0, colH - 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.11, 0.12, 8]} />
        <meshStandardMaterial color={TEAK_COL} roughness={0.8} />
      </mesh>
      <mesh position={[0, colH, 0]} castShadow>
        <boxGeometry args={[0.35, 0.08, 0.35]} />
        <meshStandardMaterial color={TEAK_COL} roughness={0.8} />
      </mesh>
    </group>
  );

  return (
    <group>
      {/* Three auspicious entrance steps (Dark Granite) */}
      {[1, 2, 3].map((step) => {
        const d = proj + 0.3 * step;
        const sh = 0.12;
        const sy = FLOOR_Y + 0.15 - (step - 1) * sh;
        const [sx, sz] = outAt(d);
        const sw = w + 0.4 - step * 0.1;
        return (
          <mesh key={step} position={[sx, sy, sz]} castShadow receiveShadow>
            <boxGeometry args={along ? [sw, sh, 0.3] : [0.3, sh, sw]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.6} />
          </mesh>
        );
      })}

      {/* Ornate columns at outer corners */}
      {[-colInset, colInset].map((off, i) => {
        const px = along ? colCx + off : colCx;
        const pz = along ? colCz : colCz + off;
        return <OrnateColumn key={i} px={px} pz={pz} />;
      })}

      {/* Canopy Roof Group */}
      <group position={[slabX, canopyBaseY, slabZ]}>
        {/* Flat teak ceiling plane under the canopy */}
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={along ? [w + 0.2, 0.04, proj + 0.2] : [proj + 0.2, 0.04, w + 0.2]} />
          <meshStandardMaterial color={TEAK_COL} roughness={0.9} />
        </mesh>
        
        {/* Hip roof slopes */}
        <mesh castShadow receiveShadow>
          {ridgeAlongZ ? (
            <group>
              <mesh geometry={buildSlope([[-rS, 0, rL], [-rS, 0, -rL], [0, pRise, -rR], [0, pRise, rR]])}><meshStandardMaterial color={TERRA_COL} roughness={0.88} side={THREE.DoubleSide} /></mesh>
              <mesh geometry={buildSlope([[rS, 0, -rL], [rS, 0, rL], [0, pRise, rR], [0, pRise, -rR]])}><meshStandardMaterial color={TERRA_DARK} roughness={0.88} side={THREE.DoubleSide} /></mesh>
              <mesh geometry={buildTri([[-rS, 0, -rL], [rS, 0, -rL], [0, pRise, -rR]])}><meshStandardMaterial color="#b84820" roughness={0.88} side={THREE.DoubleSide} /></mesh>
              <mesh geometry={buildTri([[rS, 0, rL], [-rS, 0, rL], [0, pRise, rR]])}><meshStandardMaterial color="#b84820" roughness={0.88} side={THREE.DoubleSide} /></mesh>
            </group>
          ) : (
            <group>
              <mesh geometry={buildSlope([[-rL, 0, -rS], [rL, 0, -rS], [rR, pRise, 0], [-rR, pRise, 0]])}><meshStandardMaterial color={TERRA_COL} roughness={0.88} side={THREE.DoubleSide} /></mesh>
              <mesh geometry={buildSlope([[rL, 0, rS], [-rL, 0, rS], [-rR, pRise, 0], [rR, pRise, 0]])}><meshStandardMaterial color={TERRA_DARK} roughness={0.88} side={THREE.DoubleSide} /></mesh>
              <mesh geometry={buildTri([[rL, 0, -rS], [rL, 0, rS], [rR, pRise, 0]])}><meshStandardMaterial color="#b84820" roughness={0.88} side={THREE.DoubleSide} /></mesh>
              <mesh geometry={buildTri([[-rL, 0, rS], [-rL, 0, -rS], [-rR, pRise, 0]])}><meshStandardMaterial color="#b84820" roughness={0.88} side={THREE.DoubleSide} /></mesh>
            </group>
          )}
        </mesh>
        
        {/* Ridge beam & cap */}
        <mesh position={[0, pRise + 0.05, 0]} rotation={ridgeAlongZ ? [Math.PI/2, 0, 0] : [0, 0, Math.PI/2]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, pRidgeLen + 0.1, 8]} />
          <meshStandardMaterial color={TERRA_DARK} roughness={0.9} />
        </mesh>

        {/* Teak fascia board running around the perimeter */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={ridgeAlongZ ? [pW+0.05, 0.15, pD+0.05] : [pD+0.05, 0.15, pW+0.05]} />
          <meshStandardMaterial color={TEAK_COL} roughness={0.9} />
        </mesh>
      </group>
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
  const roofCv = getCleanVariant(undefined, plan);
  const isVastuFirst = roofCv === 'vastu';
  const isCourtyard = roofCv === 'courtyard';
  const isTraditional = isVastuFirst || isCourtyard;
  const isClimateRoof = roofCv === 'climate';
  const bW = fp.w;
  const bD = fp.h;

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
      {/* Roof slab — flat RCC base for all types; Climate gets a pale reflective
          "cool roof" coating instead of the neutral grey (deep chajja overhangs
          + this pale deck are the passive-cooling signature). */}
      <mesh position={[cx, roofY, cz]} receiveShadow castShadow>
        <boxGeometry args={[fp.w + 0.4, SLAB, fp.h + 0.4]} />
        <ConcreteMat color={isClimateRoof ? '#e8e6da' : concrete} />
      </mesh>

      {/* ===== AUTHENTIC MANGALORE HIP ROOF for Vastu/Traditional ===== */}
      {isTraditional ? (() => {
        // True hip roof using BufferGeometry — no rotated boxes.
        // A hip roof has: 4 trapezoidal/triangular slopes, a ridge beam at top.
        // Pitch: 38° (tan ≈ 0.78) — authentic Kerala monsoon pitch
        const eave = 1.0;            // 1.0m eave overhang — very generous, traditional
        const rW  = bW + eave * 2;   // total roof width incl. overhangs
        const rD  = bD + eave * 2;   // total roof depth incl. overhangs
        const pitch = Math.tan((38 * Math.PI) / 180); // 0.781
        // On a hip roof the ridge length = building_long_axis - 2 * hip_setback
        // Hip setback = half_width / pitch_ratio (where pitch_ratio = rise/run = pitch)
        // Actually for a standard hip: ridge_length = long_side - short_side
        const longAxis  = Math.max(rW, rD);
        const shortAxis = Math.min(rW, rD);
        const ridgeLen  = Math.max(0.4, longAxis - shortAxis); // how long the ridge is
        const riseH     = (shortAxis / 2) * pitch;             // height of ridge above eave

        // Orient ridge along the longer plot axis
        const ridgeAlongZ = rD >= rW; // if depth>=width, ridge runs N-S

        const halfL = (ridgeAlongZ ? rD : rW) / 2; // half of long axis
        const halfS = (ridgeAlongZ ? rW : rD) / 2; // half of short axis
        const halfR = ridgeLen / 2;

        // Helper to build one quad slope (4 verts, 2 triangles) as BufferGeometry
        // verts: [v0, v1, v2, v3] clockwise from outside
        const buildSlope = (verts: [number,number,number][]): THREE.BufferGeometry => {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array([
            ...verts[0], ...verts[1], ...verts[2], // tri 1
            ...verts[0], ...verts[2], ...verts[3], // tri 2
          ]);
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.computeVertexNormals();
          return geo;
        };

        // Build triangle hip slope (end slopes) — 3 verts
        const buildTriSlope = (verts: [number,number,number][]): THREE.BufferGeometry => {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array([...verts[0], ...verts[1], ...verts[2]]);
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          geo.computeVertexNormals();
          return geo;
        };

        // Eave corners (all at y=0 relative to roofTop):
        // ridgeAlongZ: long axis = Z, short axis = X
        // Ridge runs along Z at y=riseH, from (-ridgeLen/2) to (ridgeLen/2)

        let slopeGeoms: { geo: THREE.BufferGeometry; color: string }[] = [];

        if (ridgeAlongZ) {
          // West slope (x = -halfS, to x = 0, y = riseH)
          slopeGeoms.push({
            color: TERRA_COL,
            geo: buildSlope([
              [-halfS, 0,  halfL], // SW corner
              [-halfS, 0, -halfL], // NW corner
              [     0, riseH, -halfR], // NW ridge end
              [     0, riseH,  halfR], // SW ridge end
            ])
          });
          // East slope
          slopeGeoms.push({
            color: TERRA_DARK,
            geo: buildSlope([
              [halfS, 0, -halfL], // NE corner
              [halfS, 0,  halfL], // SE corner
              [    0, riseH,  halfR], // SE ridge end
              [    0, riseH, -halfR], // NE ridge end
            ])
          });
          // North hip (triangle)
          slopeGeoms.push({
            color: '#b84820',
            geo: buildTriSlope([
              [-halfS, 0, -halfL], // NW corner
              [ halfS, 0, -halfL], // NE corner
              [     0, riseH, -halfR], // ridge N end
            ])
          });
          // South hip (triangle)
          slopeGeoms.push({
            color: '#b84820',
            geo: buildTriSlope([
              [ halfS, 0,  halfL], // SE corner
              [-halfS, 0,  halfL], // SW corner
              [     0, riseH,  halfR], // ridge S end
            ])
          });
        } else {
          // Ridge along X — swap roles
          slopeGeoms.push({
            color: TERRA_COL,
            geo: buildSlope([
              [-halfL, 0, -halfS], // NW corner
              [ halfL, 0, -halfS], // NE corner
              [ halfR, riseH, 0],  // ridge E end
              [-halfR, riseH, 0],  // ridge W end
            ])
          });
          slopeGeoms.push({
            color: TERRA_DARK,
            geo: buildSlope([
              [ halfL, 0,  halfS], // SE corner
              [-halfL, 0,  halfS], // SW corner
              [-halfR, riseH, 0],  // ridge W end
              [ halfR, riseH, 0],  // ridge E end
            ])
          });
          slopeGeoms.push({
            color: '#b84820',
            geo: buildTriSlope([
              [ halfL, 0, -halfS], // NE
              [ halfL, 0,  halfS], // SE
              [ halfR, riseH, 0],  // ridge E
            ])
          });
          slopeGeoms.push({
            color: '#b84820',
            geo: buildTriSlope([
              [-halfL, 0,  halfS], // SW
              [-halfL, 0, -halfS], // NW
              [-halfR, riseH, 0],  // ridge W
            ])
          });
        }

        // Eave fascia boards (decorative teak board along each eave)
        const fasciaH = 0.22;
        const fasciaT = 0.08;
        const eaveBoards = ridgeAlongZ ? [
          { pos: [-halfS - fasciaT/2, -fasciaH/2, 0] as [number,number,number], size: [fasciaT, fasciaH, rD + 0.1] as [number,number,number] },
          { pos: [ halfS + fasciaT/2, -fasciaH/2, 0] as [number,number,number], size: [fasciaT, fasciaH, rD + 0.1] as [number,number,number] },
          { pos: [0, -fasciaH/2, -halfL - fasciaT/2] as [number,number,number], size: [rW + 0.1, fasciaH, fasciaT] as [number,number,number] },
          { pos: [0, -fasciaH/2,  halfL + fasciaT/2] as [number,number,number], size: [rW + 0.1, fasciaH, fasciaT] as [number,number,number] },
        ] : [
          { pos: [0, -fasciaH/2, -halfS - fasciaT/2] as [number,number,number], size: [rW + 0.1, fasciaH, fasciaT] as [number,number,number] },
          { pos: [0, -fasciaH/2,  halfS + fasciaT/2] as [number,number,number], size: [rW + 0.1, fasciaH, fasciaT] as [number,number,number] },
          { pos: [-halfL - fasciaT/2, -fasciaH/2, 0] as [number,number,number], size: [fasciaT, fasciaH, rD + 0.1] as [number,number,number] },
          { pos: [ halfL + fasciaT/2, -fasciaH/2, 0] as [number,number,number], size: [fasciaT, fasciaH, rD + 0.1] as [number,number,number] },
        ];

        // Wooden rafters — visible under eaves, authentic South Indian detail
        const rafterCount = Math.max(4, Math.round((ridgeAlongZ ? rD : rW) / 1.2));

        return (
          <group position={[cx, roofTop, cz]}>
            {/* Tile slopes */}
            {slopeGeoms.map((s, i) => (
              <mesh key={`slope${i}`} geometry={s.geo} castShadow receiveShadow>
                <meshStandardMaterial color={s.color} roughness={0.88} side={THREE.DoubleSide} />
              </mesh>
            ))}
            {/* Ridge beam — thick teak timber */}
            <mesh position={[0, riseH + 0.05, 0]}
              rotation={ridgeAlongZ ? [0,0,0] : [0, Math.PI/2, 0]}
              castShadow>
              <boxGeometry args={[0.16, 0.14, ridgeLen + 0.1]} />
              <meshStandardMaterial color="#4a2e14" roughness={0.9} />
            </mesh>
            {/* Ridge cap round tiles (cylinder row) */}
            <mesh position={[0, riseH + 0.13, 0]}
              rotation={ridgeAlongZ ? [Math.PI/2, 0, 0] : [0, 0, Math.PI/2]}
              castShadow>
              <cylinderGeometry args={[0.09, 0.09, ridgeLen + 0.14, 10]} />
              <meshStandardMaterial color={TERRA_DARK} roughness={0.9} />
            </mesh>
            {/* Eave fascia boards */}
            {eaveBoards.map((b, i) => (
              <mesh key={`fascia${i}`} position={b.pos} castShadow>
                <boxGeometry args={b.size} />
                <TeakMat />
              </mesh>
            ))}
            {/* Visible teak rafters — spaced evenly along the long axis */}
            {Array.from({ length: rafterCount }).map((_, idx) => {
              const t   = (idx + 0.5) / rafterCount;
              const off = (ridgeAlongZ ? rD : rW) * (t - 0.5);
              const rx  = ridgeAlongZ ? off : 0;
              const rz  = ridgeAlongZ ? 0 : off;
              return (
                <group key={`raft${idx}`} position={[rx, 0, rz]}>
                  {/* West/South rafter */}
                  <mesh castShadow
                    position={ridgeAlongZ ? [-halfS/2, riseH/2, 0] : [0, riseH/2, -halfS/2]}
                    rotation={ridgeAlongZ ? [0, 0, Math.atan2(riseH, halfS)] : [Math.atan2(riseH, halfS), 0, 0]}>
                    <boxGeometry args={[Math.sqrt(halfS*halfS+riseH*riseH)+0.05, 0.07, 0.09]} />
                    <TeakMat />
                  </mesh>
                  {/* East/North rafter */}
                  <mesh castShadow
                    position={ridgeAlongZ ? [halfS/2, riseH/2, 0] : [0, riseH/2, halfS/2]}
                    rotation={ridgeAlongZ ? [0, 0, -Math.atan2(riseH, halfS)] : [-Math.atan2(riseH, halfS), 0, 0]}>
                    <boxGeometry args={[Math.sqrt(halfS*halfS+riseH*riseH)+0.05, 0.07, 0.09]} />
                    <TeakMat />
                  </mesh>
                </group>
              );
            })}
            {/* Decorative carved teak eave brackets at corners */}
            {(ridgeAlongZ
              ? [[-halfS,  halfL], [-halfS, -halfL], [halfS,  halfL], [halfS, -halfL]]
              : [[-halfL,  halfS], [-halfL, -halfS], [halfL,  halfS], [halfL, -halfS]]
            ).map(([bx, bz], bi) => (
              <group key={`brk${bi}`} position={[bx, -0.08, bz]}>
                <mesh castShadow>
                  <boxGeometry args={[0.18, 0.28, 0.12]} />
                  <TeakMat />
                </mesh>
                {/* Decorative notch */}
                <mesh position={[0, 0.12, 0]} castShadow>
                  <boxGeometry args={[0.14, 0.06, 0.14]} />
                  <meshStandardMaterial color={STONE_BAND} roughness={0.8} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })() : (

        /* Modern flat roof with jaali (Courtyard) or sleek parapet (modern/other) */
        <group>
          <ParapetSide start={[cx - (fp.w + 0.4) / 2, D / 2 - fp.y]} end={[cx + (fp.w + 0.4) / 2, D / 2 - fp.y]} yBase={roofTop} isTraditional={isCourtyard} horiz={true} />
          <ParapetSide start={[cx - (fp.w + 0.4) / 2, D / 2 - (fp.y + fp.h)]} end={[cx + (fp.w + 0.4) / 2, D / 2 - (fp.y + fp.h)]} yBase={roofTop} isTraditional={isCourtyard} horiz={true} />
          <ParapetSide start={[fp.x - W / 2, cz - (fp.h + 0.4) / 2]} end={[fp.x - W / 2, cz + (fp.h + 0.4) / 2]} yBase={roofTop} isTraditional={isCourtyard} horiz={false} />
          <ParapetSide start={[fp.x + fp.w - W / 2, cz - (fp.h + 0.4) / 2]} end={[fp.x + fp.w - W / 2, cz + (fp.h + 0.4) / 2]} yBase={roofTop} isTraditional={isCourtyard} horiz={false} />
        </group>
      )}
      
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

/** Ornate Indian compound wall with tall gate pillars capped with Kalash finials.
 *  The wall has laterite base, plastered body, and stone coping.
 *  Four corner pillars + two gate pillars. Gate on the East side. */
function CompoundWall({ W, D }: { W: number; D: number }) {
  const WallH = 1.2;
  const T = 0.18;
  const hx = W / 2;
  const hz = D / 2;
  const gate = Math.min(D * 0.32, 3.2); // gate opening
  const segLen = (D - gate) / 2;

  // Three-layer wall: laterite base + plaster body + sandstone coping
  const baseH = 0.35; const bodyH = WallH - baseH - 0.08; const copingH = 0.08;

  const wallSegs: [number, number, number, number][] = [
    // [cx, cz, sx, sz] for each segment
    [-hx, 0, T, D],                            // West full
    [0, -hz, W, T],                            // North full
    [0, hz, W, T],                             // South full
    [hx, -(gate / 2 + segLen / 2), T, segLen], // East N half
    [hx, gate / 2 + segLen / 2, T, segLen],    // East S half
  ];


  // Ornate gate pillar with stepped body, cap, and Kalash finial
  const GatePillar = ({ px, pz }: { px: number; pz: number }) => {
    const PH = WallH * 1.9; // gate pillar much taller than wall
    return (
      <group position={[px, 0, pz]}>
        {/* Laterite base block */}
        <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.52, baseH, 0.52]} />
          <meshStandardMaterial color={LATERITE} roughness={0.95} />
        </mesh>
        {/* Sandstone transition molding */}
        <mesh position={[0, baseH + 0.035, 0]} castShadow>
          <boxGeometry args={[0.48, 0.07, 0.48]} />
          <meshStandardMaterial color={STONE_BAND} roughness={0.8} />
        </mesh>
        {/* Plastered pillar body */}
        <mesh position={[0, baseH + 0.07 + (PH - baseH - 0.07 - 0.18) / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.42, PH - baseH - 0.07 - 0.18, 0.42]} />
          <meshStandardMaterial color={PLASTER_EXT} roughness={0.88} />
        </mesh>
        {/* Cap molding block */}
        <mesh position={[0, PH - 0.15, 0]} castShadow>
          <boxGeometry args={[0.5, 0.12, 0.5]} />
          <meshStandardMaterial color={STONE_BAND} roughness={0.8} />
        </mesh>
        {/* Pyramidal cap — terracotta tile color */}
        <mesh position={[0, PH - 0.03, 0]} castShadow>
          <coneGeometry args={[0.3, 0.22, 4]} />
          <meshStandardMaterial color={TERRA_COL} roughness={0.88} />
        </mesh>
        {/* ── KALASH FINIAL (auspicious pot) ── */}
        {/* Kumbha (pot body) — brass gold sphere */}
        <mesh position={[0, PH + 0.16, 0]} castShadow>
          <sphereGeometry args={[0.12, 14, 10]} />
          <meshStandardMaterial color={BRASS_GOLD} metalness={0.9} roughness={0.18} />
        </mesh>
        {/* Neck (narrow connector below pot) */}
        <mesh position={[0, PH + 0.04, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.12, 10]} />
          <meshStandardMaterial color={BRASS_GOLD} metalness={0.9} roughness={0.18} />
        </mesh>
        {/* Mango leaf flare (wider disc above pot body) */}
        <mesh position={[0, PH + 0.26, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.08, 0.04, 12]} />
          <meshStandardMaterial color={BRASS_GOLD} metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Coconut top (small sphere on top) */}
        <mesh position={[0, PH + 0.36, 0]} castShadow>
          <sphereGeometry args={[0.065, 10, 8]} />
          <meshStandardMaterial color={BRASS_GOLD} metalness={0.88} roughness={0.22} />
        </mesh>
      </group>
    );
  };

  // Corner post (shorter, simpler)
  const CornerPost = ({ px, pz }: { px: number; pz: number }) => (
    <group position={[px, 0, pz]}>
      <mesh position={[0, WallH * 0.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.38, WallH * 1.2, 0.38]} />
        <meshStandardMaterial color={PLINTH_COL} roughness={0.9} />
      </mesh>
      <mesh position={[0, WallH * 1.25, 0]} castShadow>
        <boxGeometry args={[0.42, 0.08, 0.42]} />
        <meshStandardMaterial color={STONE_BAND} roughness={0.8} />
      </mesh>
      <mesh position={[0, WallH * 1.32, 0]} castShadow>
        <coneGeometry args={[0.22, 0.14, 4]} />
        <meshStandardMaterial color={TERRA_COL} roughness={0.88} />
      </mesh>
    </group>
  );

  return (
    <group>
      {wallSegs.map(([cx, cz, sx, sz], i) => (
        <group key={i}>
          {/* Laterite base */}
          <mesh position={[cx, baseH / 2, cz]} castShadow receiveShadow>
            <boxGeometry args={[sx, baseH, sz]} />
            <meshStandardMaterial color={LATERITE} roughness={0.95} />
          </mesh>
          {/* Plastered body */}
          <mesh position={[cx, baseH + bodyH / 2, cz]} castShadow receiveShadow>
            <boxGeometry args={[sx, bodyH, sz]} />
            <meshStandardMaterial color={PLASTER_EXT} roughness={0.9} />
          </mesh>
          {/* Stone coping cap */}
          <mesh position={[cx, baseH + bodyH + copingH / 2, cz]} castShadow>
            <boxGeometry args={[Number(sx) + 0.04, copingH, Number(sz) + 0.04]} />
            <meshStandardMaterial color={STONE_BAND} roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* Gate pillars */}
      <GatePillar px={hx} pz={-gate / 2} />
      <GatePillar px={hx} pz={gate / 2} />
      {/* Corner posts */}
      <CornerPost px={-hx} pz={-hz} />
      <CornerPost px={hx} pz={-hz} />
      <CornerPost px={-hx} pz={hz} />
    </group>
  );
}

/** Coconut Palm tree — tall, proud, with 10 arching fronds and ring scars.
 *  Authentic luxury South Indian garden element. Scale 1.0 = ~6.5m tall. */
function CoconutPalm({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  const trunkH = 6.5 * scale;
  const lean   = 0.25 * scale;
  const baseR  = 0.18 * scale;
  const topR   = 0.08 * scale;
  const frondLen = 2.2 * scale;
  return (
    <group position={[x, 0, z]}>
      {/* Main trunk — tapered */}
      <mesh castShadow receiveShadow position={[lean * 0.4, trunkH / 2, 0]}>
        <cylinderGeometry args={[topR, baseR, trunkH, 10]} />
        <meshStandardMaterial color="#8a6535" roughness={0.97} />
      </mesh>
      {/* Ring scars — classic palm detail */}
      {Array.from({ length: 9 }).map((_, i) => {
        const y = trunkH * (0.2 + i * 0.075);
        const r = baseR + (topR - baseR) * (y / trunkH);
        return (
          <mesh key={i} castShadow position={[lean * 0.4 * (y / trunkH), y, 0]}>
            <torusGeometry args={[r + 0.01, 0.015 * scale, 5, 14]} />
            <meshStandardMaterial color="#5a3e18" roughness={0.99} />
          </mesh>
        );
      })}
      {/* 10 arching fronds */}
      {Array.from({ length: 10 }).map((_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const tilt  = 0.52 + (i % 3) * 0.07;
        return (
          <group key={i} position={[lean, trunkH + 0.05, 0]} rotation={[tilt, angle, 0]}>
            <mesh castShadow position={[0, frondLen * 0.5, 0]}>
              <boxGeometry args={[0.035 * scale, frondLen, 0.022 * scale]} />
              <meshStandardMaterial color="#3a6818" roughness={0.9} />
            </mesh>
            {Array.from({ length: 6 }).map((_, j) => {
              const frac = (j + 1) / 7;
              const ly   = frondLen * frac;
              const lLen = frondLen * 0.32 * (1 - frac * 0.45);
              return (
                <group key={j} position={[0, ly, 0]}>
                  <mesh castShadow position={[lLen * 0.5, 0, 0]} rotation={[0, 0, -0.35]}>
                    <boxGeometry args={[lLen, 0.022 * scale, 0.015 * scale]} />
                    <meshStandardMaterial color="#4a8828" roughness={0.92} />
                  </mesh>
                  <mesh castShadow position={[-lLen * 0.5, 0, 0]} rotation={[0, 0, 0.35]}>
                    <boxGeometry args={[lLen, 0.022 * scale, 0.015 * scale]} />
                    <meshStandardMaterial color="#3a7818" roughness={0.92} />
                  </mesh>
                </group>
              );
            })}
          </group>
        );
      })}
      {/* Coconut cluster */}
      {[0, 1.1, 2.2, 3.3].map((ang, i) => (
        <mesh key={i} castShadow
          position={[lean + Math.cos(ang) * 0.18 * scale, trunkH - 0.35, Math.sin(ang) * 0.18 * scale]}>
          <sphereGeometry args={[0.19 * scale, 8, 6]} />
          <meshStandardMaterial color="#6a8830" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}


/** Mango tree — broad majestic canopy for luxury Indian bungalow garden.
 *  5 branches, 7 overlapping canopy spheres, ripe hanging mangoes. */
function MangoTree({ x, z, scale = 1, isTraditional = false }: { x: number; z: number; scale?: number; isTraditional?: boolean }) {
  const trunkH    = 2.2 * scale;
  const canopyBase = trunkH + 0.2;
  const dark  = isTraditional ? '#2e5814' : '#1e4a0c';
  const mid   = isTraditional ? '#3e7020' : '#2e6018';
  const light = isTraditional ? '#507a28' : '#3e7820';
  return (
    <group position={[x, 0, z]}>
      {/* Stout gnarled trunk */}
      <mesh castShadow receiveShadow position={[0, trunkH / 2, 0]}>
        <cylinderGeometry args={[0.12 * scale, 0.22 * scale, trunkH, 10]} />
        <meshStandardMaterial color="#3a2510" roughness={0.97} />
      </mesh>
      {/* 5 radiating main branches */}
      {[[0.55, 0.4, 0.3], [-0.45, 0.4, 0.25], [0.15, 0.45, -0.5],
        [-0.25, 0.35, -0.4], [0.5, 0.3, -0.25]].map(([bx, by, bz], i) => {
        const blen = (0.85 + (i % 3) * 0.2) * scale;
        const ang  = Math.atan2(bz, bx);
        const elev = Math.atan2(by, Math.sqrt(bx * bx + bz * bz));
        return (
          <mesh key={i} castShadow
            position={[bx * scale, canopyBase + by * scale, bz * scale]}
            rotation={[elev * 0.6, ang, 0]}>
            <cylinderGeometry args={[0.04 * scale, 0.08 * scale, blen, 6]} />
            <meshStandardMaterial color="#3a2510" roughness={0.95} />
          </mesh>
        );
      })}
      {/* 7 canopy spheres for realistic silhouette */}
      <mesh castShadow position={[0, canopyBase + 1.6 * scale, 0]}>
        <sphereGeometry args={[1.4 * scale, 10, 7]} />
        <meshStandardMaterial color={dark} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0.75 * scale, canopyBase + 1.7 * scale, 0.4 * scale]}>
        <sphereGeometry args={[1.05 * scale, 8, 6]} />
        <meshStandardMaterial color={mid} roughness={0.88} />
      </mesh>
      <mesh castShadow position={[-0.7 * scale, canopyBase + 1.55 * scale, -0.5 * scale]}>
        <sphereGeometry args={[1.1 * scale, 8, 6]} />
        <meshStandardMaterial color={dark} roughness={0.92} />
      </mesh>
      <mesh castShadow position={[0.3 * scale, canopyBase + 2.2 * scale, -0.45 * scale]}>
        <sphereGeometry args={[0.9 * scale, 8, 6]} />
        <meshStandardMaterial color={light} roughness={0.88} />
      </mesh>
      <mesh castShadow position={[-0.5 * scale, canopyBase + 1.9 * scale, 0.65 * scale]}>
        <sphereGeometry args={[0.95 * scale, 8, 6]} />
        <meshStandardMaterial color={mid} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0.9 * scale, canopyBase + 1.25 * scale, -0.3 * scale]}>
        <sphereGeometry args={[0.7 * scale, 8, 6]} />
        <meshStandardMaterial color={light} roughness={0.85} />
      </mesh>
      <mesh castShadow position={[-0.85 * scale, canopyBase + 1.35 * scale, 0.25 * scale]}>
        <sphereGeometry args={[0.75 * scale, 8, 6]} />
        <meshStandardMaterial color={dark} roughness={0.92} />
      </mesh>
      {/* Ripe mangoes in clusters */}
      {[[0.4, 0.8, 0.3], [-0.3, 0.9, -0.4], [0.2, 0.75, -0.3],
        [-0.5, 0.85, 0.3], [0.6, 0.7, -0.2]].map(([fx, fy, fz], i) => (
        <mesh key={i} castShadow
          position={[fx * scale, canopyBase + fy * scale, fz * scale]}>
          <sphereGeometry args={[0.07 * scale, 7, 5]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#e8a820' : '#d4881a'} roughness={0.65} />
        </mesh>
      ))}
    </group>
  );
}

/** Legacy alias — used in garden/courtyard furniture renderer. */
function Tree({ x, z, scale = 1, isTraditional = false }: { x: number; z: number; scale?: number; isTraditional?: boolean }) {
  return <MangoTree x={x} z={z} scale={scale} isTraditional={isTraditional} />;
}

/** Site/landscaping: a paved approach path from the gate to the entrance, rich tropical
 *  lawn inside the compound, flowering shrubs along the walls, coconut palms + mango
 *  trees in appropriate spots. Procedural so it always renders offline. */
function SiteLandscape({ plan, W, D }: { plan: Plan; W: number; D: number }) {
  const fp = footprint(plan.rooms);
  const hx = W / 2;
  const hz = D / 2;
  const fpEast = fp ? fp.x + fp.w : W * 0.7;
  const pathPlanX0 = fpEast;
  const pathPlanX1 = W;
  const pathCx = (pathPlanX0 + pathPlanX1) / 2 - hx;
  const pathLen = Math.max(pathPlanX1 - pathPlanX0, 0.5);

  const area = W * D;
  // Coconut palms in corners and sides
  const palmScale = area < 150 ? 0.65 : area < 300 ? 0.85 : 1.0;
  // Mango trees for the back/sides
  const mangoScale = area < 150 ? 0.7 : area < 300 ? 0.9 : 1.1;

  const isTraditional = getCleanVariant(undefined, plan) === 'vastu' || getCleanVariant(undefined, plan) === 'courtyard';

  // Tree spots (world coords). Coconut palms at front/corner; mango at back.
  const treeData: { type: 'coconut' | 'mango'; x: number; z: number }[] = [
    { type: 'coconut', x: -hx + 1.0, z: -hz + 1.2 },
    { type: 'coconut', x: -hx + 1.0, z:  hz - 1.2 },
    { type: 'mango',   x: -hx + 1.2, z:  0 },
    { type: 'mango',   x:  0,         z: -hz + 1.2 },
    { type: 'coconut', x:  0,         z:  hz - 1.2 },
    { type: 'mango',   x: -hx + 1.2, z: -hz / 2 },
    { type: 'coconut', x: -hx + 1.0, z:  hz / 2 },
  ];
  const maxTrees = area < 110 ? 2 : area < 200 ? 3 : area < 350 ? 4 : 6;

  // Filter out tree spots that collide with the building footprint (with a buffer)
  const validTrees = treeData.filter(({ x, z }) => {
    if (!fp) return true;
    const tpx = x + W / 2;
    const tpy = D / 2 - z;
    const buf = 2.0;
    const inX = tpx >= fp.x - buf && tpx <= fp.x + fp.w + buf;
    const inY = tpy >= fp.y - buf && tpy <= fp.y + fp.h + buf;
    return !(inX && inY);
  }).slice(0, maxTrees);

  // Flowering shrub Z positions along the West wall
  const nShrub = Math.max(2, Math.min(8, Math.round((D - 0.8) / 1.5)));
  const shrubZs = Array.from({ length: nShrub }).map(
    (_, i) => -hz + 0.5 + ((i + 0.5) * (D - 1.0)) / nShrub,
  );
  // Also along North wall
  const nShrubN = Math.max(1, Math.min(5, Math.round((W - 0.8) / 2.0)));
  const shrubNXs = Array.from({ length: nShrubN }).map(
    (_, i) => -hx + 0.5 + ((i + 0.5) * (W - 1.0)) / nShrubN,
  );

  // Paver pattern for approach path: alternating lighter/darker blocks
  const nPavers = Math.max(3, Math.round(pathLen / 0.55));
  const paverW = pathLen / nPavers;
  const pathWidth = Math.min(D * 0.22, 2.2);

  return (
    <group>
      {/* Rich tropical lawn — slightly textured dark green */}
      <mesh position={[0, 0.0, 0]} receiveShadow>
        <boxGeometry args={[W - 0.1, 0.04, D - 0.1]} />
        <meshStandardMaterial color={GRASS_COL} roughness={1} />
      </mesh>
      {/* Paved approach path with individual pavers */}
      <mesh position={[pathCx, 0.025, 0]} receiveShadow>
        <boxGeometry args={[pathLen, 0.05, pathWidth]} />
        <meshStandardMaterial color="#c4b090" roughness={0.85} />
      </mesh>
      {Array.from({ length: nPavers }).map((_, i) => (
        <mesh key={`pv${i}`} position={[pathCx - pathLen / 2 + paverW * (i + 0.5), 0.03, 0]} receiveShadow>
          <boxGeometry args={[paverW - 0.04, 0.04, pathWidth - 0.1]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#d4c8a8" : "#b8a880"} roughness={0.88} />
        </mesh>
      ))}
      {/* Trees: coconut palms + mango */}
      {validTrees.map(({ type, x, z }, i) =>
        type === 'coconut'
          ? <CoconutPalm key={i} x={x} z={z} scale={palmScale * (i % 2 ? 0.88 : 1)} />
          : <MangoTree   key={i} x={x} z={z} scale={mangoScale * (i % 2 ? 0.92 : 1)} isTraditional={isTraditional} />
      )}
      {/* Flowering shrubs along West wall — bouganvillea / hibiscus look */}
      {shrubZs.map((z, i) => (
        <group key={`sw${i}`} position={[-hx + 0.45, 0, z]}>
          <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
            <sphereGeometry args={[0.28, 8, 6]} />
            <meshStandardMaterial color="#5a8f30" roughness={0.95} />
          </mesh>
          {/* Flower clusters — alternate pink / white / red */}
          {[0, 1, 2].map((fi) => (
            <mesh key={fi} position={[Math.cos(fi * 2.1) * 0.18, 0.38, Math.sin(fi * 2.1) * 0.18]} castShadow>
              <sphereGeometry args={[0.10, 6, 5]} />
              <meshStandardMaterial color={["#e04878", "#f0d060", "#e83030"][fi % 3]} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Low shrubs along North wall */}
      {shrubNXs.map((x, i) => (
        <mesh key={`sn${i}`} position={[x, 0.22, -hz + 0.45]} castShadow receiveShadow>
          <sphereGeometry args={[0.24, 8, 6]} />
          <meshStandardMaterial color="#4a8028" roughness={0.95} />
        </mesh>
      ))}
      {/* Small water feature/kolam near entrance */}
      {fp && (
        <group position={[pathCx + pathLen * 0.3, 0, 0]}>
          <mesh position={[0, 0.04, 0]} receiveShadow>
            <cylinderGeometry args={[0.5, 0.55, 0.08, 12]} />
            <meshStandardMaterial color={STONE_BAND} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.42, 0.42, 0.02, 12]} />
            <meshPhysicalMaterial color="#1a90c8" roughness={0.08} transmission={0.85} transparent opacity={0.8} />
          </mesh>
        </group>
      )}
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
        // Standard/Basic — warm Indian midday sun + warm hemisphere
        <>
          {/* Warm sky above + warm earth below — authentic Indian sun quality */}
          <hemisphereLight args={["#fdf6e8", "#c4a878", 0.52]} />
          <ambientLight intensity={0.22} color="#ffe8c0" />
          <directionalLight
            position={[W * 1.5, 14, -D * 0.5]}
            intensity={2.6}
            color="#ffcc80"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={-W * 1.4}
            shadow-camera-right={W * 1.4}
            shadow-camera-top={D * 1.4}
            shadow-camera-bottom={-D * 1.4}
            shadow-camera-near={0.5}
            shadow-camera-far={90}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
          />
          {/* Warm fill from the front-left (simulates south-facing scatter) */}
          <directionalLight position={[-W * 0.8, 6, D * 0.6]} intensity={0.5} color="#ffecd8" />
        </>
      )}

      {/* earth slab — dark tropical Indian soil under the lawn */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[W + 0.3, 0.12, D + 0.3]} />
        <meshStandardMaterial color="#3B2309" roughness={1} />
      </mesh>
      <SiteLandscape plan={plan} W={W} D={D} />

      {/* auto-fit the building + site on first mount, then hand off to OrbitControls */}
      <Bounds clip margin={1.2}>
        <AutoFrame>
          {/* Ultimate tier renders the whole building through PremiumGlassHouseScene
              (floor-to-ceiling glazing, steel columns, marble slabs, infinity-pool-
              style roof deck, sculptural landscaping) instead of the standard
              FloorGroup/Slabs pass — a real geometry-level swap, not a lighting-only
              tweak. Structural grid, entrance porch, compound wall and MEP pipes
              stay unconditional: they're overlay/site elements independent of which
              building renderer produced the walls underneath them. */}
          {isPremium ? (
            <PremiumGlassHouseScene plan={plan} />
          ) : (
            <>
              {floors.map((f) => (
                <FloorGroup key={f} plan={plan} floor={f} W={W} D={D} openings={openings} entranceId={entranceId} mepMode={mepMode} />
              ))}
              <Slabs plan={plan} W={W} D={D} />
            </>
          )}
          {structure && <StructuralGrid structure={structure} plan={plan} W={W} D={D} mepMode={mepMode} />}
          <EntrancePorch plan={plan} W={W} D={D} />
          <CompoundWall W={W} D={D} />
          {mepMode && <MepPipes plan={plan} W={W} D={D} />}

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

/** Imperative export surface exposed by the live scene (GLB + 4K viewport capture). */
export type ThreeDExportApi = {
  exportGltf: () => Promise<Blob>;
  capture4k: () => Promise<Blob>;
};

/** Lives INSIDE the Canvas; wires the running gl/scene/camera to `apiRef`.
    Future photoreal seam: send the same GLB + camera pose to an external
    render API instead of capturing the WebGL viewport. */
function ExportBridge({ apiRef }: { apiRef: React.MutableRefObject<ThreeDExportApi | null> }) {
  const { gl, scene, camera } = useThree();
  React.useEffect(() => {
    apiRef.current = {
      async exportGltf() {
        const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
        return new Promise<Blob>((resolve, reject) => {
          new GLTFExporter().parse(
            scene,
            (result) => resolve(new Blob([result as ArrayBuffer], { type: "model/gltf-binary" })),
            (err) => reject(err instanceof Error ? err : new Error(String(err))),
            { binary: true },
          );
        });
      },
      async capture4k() {
        const prevSize = new THREE.Vector2();
        gl.getSize(prevSize);
        const prevRatio = gl.getPixelRatio();
        const cam = camera as THREE.PerspectiveCamera;
        const prevAspect = cam.aspect;
        const shoot = (w: number, h: number) =>
          new Promise<Blob>((resolve, reject) => {
            gl.setPixelRatio(1);
            gl.setSize(w, h, false);
            cam.aspect = w / h;
            cam.updateProjectionMatrix();
            gl.render(scene, camera);
            gl.domElement.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("viewport capture failed"))),
              "image/png",
            );
          });
        try {
          // 4K, then 1440p, then the live viewport — whatever the GPU allows.
          try {
            return await shoot(3840, 2160);
          } catch {
            try {
              return await shoot(2560, 1440);
            } catch {
              return await shoot(Math.round(prevSize.x), Math.round(prevSize.y));
            }
          }
        } finally {
          gl.setPixelRatio(prevRatio);
          gl.setSize(prevSize.x, prevSize.y, false);
          cam.aspect = prevAspect;
          cam.updateProjectionMatrix();
          gl.render(scene, camera);
        }
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [gl, scene, camera, apiRef]);
  return null;
}

export function FloorPlan3D({ plan, structure, className, mepMode: controlledMepMode, finishTier, exportApiRef }: { plan: Plan; structure?: StructureReport; className?: string; mepMode?: boolean; finishTier?: 'economy' | 'standard' | 'premium'; exportApiRef?: React.MutableRefObject<ThreeDExportApi | null> }) {
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
        style={{ background: finishTier === 'premium' ? "linear-gradient(180deg,#0a0a1a 0%,#1a1a2e 40%,#2d1a0a 100%)" : "linear-gradient(180deg,#5b8ec4 0%,#88b8d8 35%,#d8c090 70%,#c8a870 100%)" }}
      >
        <Scene plan={plan} structure={structure} mepMode={mepMode} finishTier={finishTier} />
        {exportApiRef && <ExportBridge apiRef={exportApiRef} />}
      </Canvas>
    </div>
  );
}
