import type { City, Facing, FinishTier, GenerateRequest } from "@gharplan/shared";
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
};

export const FT_PER_M = 3.28084;
export const toM = (ft: number) => ft / FT_PER_M;
export const toFt = (m: number) => m * FT_PER_M;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function briefToRequest(b: BriefForm): GenerateRequest {
  return {
    bhk: b.bhk,
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
