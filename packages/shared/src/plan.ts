// Canonical Plan contract — TypeScript mirror of the pydantic models in
// /engine/app/models. Kept in sync by hand; the authoritative JSON Schema is
// generated from the pydantic models:
//   cd engine && python scripts/export_schema.py
// Regenerate these types from that schema with:
//   npx json-schema-to-typescript packages/shared/plan.schema.json -o packages/shared/src/plan.ts
//
// Coordinates are in METRES. Origin = plot SW corner. +x = East, +y = North.

export type RoomType =
  | "pooja"
  | "kitchen"
  | "master_bedroom"
  | "bedroom"
  | "childrens_bedroom"
  | "living"
  | "dining"
  | "toilet"
  | "bathroom"
  | "staircase"
  | "entrance"
  | "study"
  | "store"
  | "utility"
  | "balcony"
  | "parking"
  | "sitout"
  | "courtyard"
  | "garden"
  | "service_shaft"
  | "future_expansion"
  | "overhead_tank"
  | "borewell"
  | "brahmasthan";

export type Compass = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "CENTER";
export type Facing = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type StateCode = "KA" | "MH" | "TG" | "AP";
export type City = "Bengaluru" | "Hyderabad" | "Pune" | "Tirupati";
export type FinishTier = "economy" | "standard" | "premium";

/** A 2D point [x, y] in metres. */
export type Point = [number, number];

export interface Project {
  id: string;
  name: string;
  clientName?: string | null;
  createdAt?: string | null;
}

export interface Plot {
  widthM: number;
  depthM: number;
  /** Computed = widthM * depthM. */
  areaSqm: number;
  facing: Facing;
  state: StateCode;
  city: City;
  floors: number;
}

export interface Opening {
  id: string;
  roomId: string;
  kind: "door" | "window";
  widthM: number;
  heightM: number;
  count: number;
}

export interface Room {
  id: string;
  type: RoomType;
  /** Closed ring of [x,y] metre vertices. */
  polygon: Point[];
  /** Computed fields (filled by /plan/validate). */
  areaSqm: number;
  perimeterM: number;
  centroid?: Point | null;
  zone?: Compass | null;
  ceilingHeightM: number;
  /** 0 = ground floor, 1 = first floor, … */
  floor?: number;
}

export interface Plan {
  schemaVersion: "1.0";
  project: Project;
  plot: Plot;
  rooms: Room[];
  doors: Opening[];
  windows: Opening[];
}

export interface ValidateResponse {
  plan: Plan;
  warnings: string[];
}

/** A natural-language / structured brief for AI plan generation. */
export interface GenerateRequest {
  /** Number of bedrooms (1–4 supported). */
  bhk: number;
  plotWidthM: number;
  plotDepthM: number;
  facing: Facing;
  state: StateCode;
  city: City;
  floors: number;
  /** Prioritise Vastu compliance when packing rooms. */
  vastuPriority: boolean;
  /** Drives default finish assumptions in the estimate. */
  budgetTier: FinishTier;
  projectName?: string;
  clientName?: string;
  /** Optional free-text wishes ("home office", "pooja room", "parking"). */
  notes?: string;
}
