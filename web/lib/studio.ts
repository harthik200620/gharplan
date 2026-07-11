import type { City, Facing, FinishTier, GenerateRequest, Point, SoilType } from "@gharplan/shared";
import { STATE_BY_CITY } from "@gharplan/shared";
import type { RefineRequest } from "@/lib/engine";

export type BriefForm = {
  projectName: string;
  clientName: string;
  city: City;
  widthFt: number;
  depthFt: number;
  facing: Facing;
  bhk: number;
  floors: number;
  budgetTier: FinishTier;
  vastuPriority: boolean;
  notes: string;
  family_persona?: string;
  // ── Site v2 (wizard "Site" section) ──
  /** Display district from fixtures/jurisdictions.json (UI-only; not sent to the engine). */
  district?: string;
  /** Jurisdiction packId sent as ulbHint when the real ULB city isn't in the City enum. */
  ulbHint?: string;
  /** Abutting road width (metres) — drives setback bands & height caps. */
  roadWidthM?: number;
  cornerPlot?: boolean;
  soilType?: SoilType;
  slopeNote?: string;
  /** Optional true boundary ring (metres, SW origin); null/undefined = plain rectangle. */
  polygon?: Point[] | null;
};

export const DEFAULT_BRIEF: BriefForm = {
  projectName: "My Home",
  clientName: "",
  city: "Bengaluru",
  widthFt: 30,
  depthFt: 40,
  facing: "E",
  bhk: 3,
  floors: 1,
  budgetTier: "standard",
  vastuPriority: true,
  notes: "",
  family_persona: "",
  roadWidthM: 9,
  cornerPlot: false,
  soilType: "medium_clay",
  slopeNote: "",
  polygon: null,
};

export const FT_PER_M = 3.28084;
export const toM = (ft: number) => ft / FT_PER_M;
export const toFt = (m: number) => m * FT_PER_M;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The plot edge that carries the abutting road for a facing (diagonals fold NE/SE→E, NW/SW→W). */
export function facingRoadEdge(f: Facing): "N" | "S" | "E" | "W" {
  if (f === "N" || f === "S" || f === "E" || f === "W") return f;
  return f === "NE" || f === "SE" ? "E" : "W";
}

export function briefToRequest(b: BriefForm, seed?: number): GenerateRequest {
  return {
    bhk: b.bhk,
    seed: seed && seed > 0 ? seed : undefined,
    plotWidthM: r3(toM(b.widthFt)),
    plotDepthM: r3(toM(b.depthFt)),
    facing: b.facing,
    state: STATE_BY_CITY[b.city],
    city: b.city,
    floors: b.floors,
    vastuPriority: b.vastuPriority,
    budgetTier: b.budgetTier,
    projectName: b.projectName || undefined,
    clientName: b.clientName || undefined,
    notes: b.notes || undefined,
    family_persona: b.family_persona || undefined,
    // ── Site v2 (all optional; the engine treats omission as the legacy rectangle) ──
    roadWidthsM:
      b.roadWidthM && b.roadWidthM > 0 ? { [facingRoadEdge(b.facing)]: b.roadWidthM } : undefined,
    cornerPlot: b.cornerPlot || undefined,
    soilType: b.soilType,
    slopeNote: b.slopeNote?.trim() ? b.slopeNote.trim() : undefined,
    polygon: b.polygon && b.polygon.length >= 3 ? b.polygon : undefined,
    ulbHint: b.ulbHint || undefined,
  };
}

/** Build a /plan/refine body: the brief request plus the full edit history and selected scheme. */
export function refineRequest(
  brief: BriefForm,
  instructions: string[],
  variantId?: string,
): RefineRequest {
  return { ...briefToRequest(brief), instructions, variantId };
}

export const FACINGS: Facing[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// 3×3 compass layout (North up) → grid cell for the facing picker
export const COMPASS_GRID: (Facing | null)[] = ["NW", "N", "NE", "W", null, "E", "SW", "S", "SE"];

export const FACING_LABELS: Record<Facing, string> = {
  N: "North",
  NE: "North-East",
  E: "East",
  SE: "South-East",
  S: "South",
  SW: "South-West",
  W: "West",
  NW: "North-West",
};

/** Soil / bearing-stratum options for the Site section (mirrors the engine's SoilType literal). */
export const SOIL_OPTIONS: { value: SoilType; label: string }[] = [
  { value: "hard_rock", label: "Hard rock" },
  { value: "soft_rock", label: "Soft / weathered rock" },
  { value: "dense_sand", label: "Dense sand / gravel" },
  { value: "medium_clay", label: "Medium clay (default)" },
  { value: "soft_clay", label: "Soft clay / silt" },
  { value: "filled", label: "Filled-up / made ground" },
];
