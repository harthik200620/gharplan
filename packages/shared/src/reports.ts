// Vastu + Code report types â€” mirror /engine/app/models/reports.py.

import type { Plan } from "./plan";

export type Status = "pass" | "warn" | "fail";

export interface VastuRoomResult {
  roomId?: string | null;
  roomType: string;
  roomLabel: string;
  zone: string;
  status: Status;
  weight: number;
  message: string;
  suggestedZones: string[];
}

export interface VastuSummary {
  evaluated: number;
  passCount: number;
  warnCount: number;
  failCount: number;
}

export interface VastuReport {
  score: number;
  grade: string;
  rooms: VastuRoomResult[];
  brahmasthan: VastuRoomResult;
  fixes: VastuRoomResult[];
  summary: VastuSummary;
  disclaimer: string;
}

export interface CodeCheck {
  ruleId: string;
  label: string;
  roomId?: string | null;
  roomLabel?: string | null;
  status: Status;
  actual?: string | null;
  required?: string | null;
  message: string;
  /** GO/clause/IS reference this check derives from. */
  citation?: string | null;
  /** Whether the cited rule has been verified against the authoritative source. */
  confidence?: "verified" | "needs_verification";
}

export interface CodeMetrics {
  plotAreaSqm: number;
  footprintSqm: number;
  builtUpSqm: number;
  groundCoveragePct: number;
  maxGroundCoveragePct: number;
  farUsed: number;
  farAllowed: number;
}

export interface CodeSummary {
  total: number;
  passCount: number;
  warnCount: number;
  failCount: number;
}

export interface CodeReport {
  state: string;
  status: Status;
  metrics: CodeMetrics;
  checks: CodeCheck[];
  summary: CodeSummary;
  disclaimer: string;
}

export interface Branding {
  studioName: string;
  address: string;
  gstin: string;
  phone: string;
  email: string;
  website: string;
  logoDataUrl?: string | null;
  terms: string;
}

export interface GenerateMeta {
  vastuScore: number;
  vastuGrade: string;
  codeFails: number;
  tier?: string;
  requestedBhk?: number;
  downscaled?: boolean;
  note?: string;
  footprintSqm?: number;
  siteZoneCount?: number;
  siteZoneTypes?: string[];
  siteOpenAreaSqm?: number;
  plotUsePct?: number;
  droppedRooms?: string[];
  attempts?: number;
  strategy?: string;
  floorsGenerated?: number;
  coverageRatio?: number;
  /** Design-variant identity (set on options from /plan/options). */
  variantId?: string;
  variantName?: string;
  variantTagline?: string;
  courtyard?: boolean;
  openKitchen?: boolean;
  /** Set on responses from /plan/refine. */
  appliedEdits?: string[];
  unmatchedEdits?: string[];
  editVariantId?: string | null;
  narrative?: string;
  highlights?: string[];
  inspiredBy?: string;
}

export interface GenerateResponse {
  plan: Plan;
  vastu: VastuReport;
  code: CodeReport;
  meta?: GenerateMeta;
  warnings?: string[];
  note?: string;
  templateId?: string;
  climate?: ClimateReport;
  structure?: StructureReport;
}

/** One design scheme in a five-option set (POST /plan/options). */
export interface GeneratedOption {
  variantId: string;
  variantName: string;
  variantTagline: string;
  plan: Plan;
  vastu: VastuReport;
  code: CodeReport;
  meta: GenerateMeta;
  climate?: ClimateReport;
  structure?: StructureReport;
}

export interface GenerateOptionsResponse {
  options: GeneratedOption[];
  count: number;
}

export interface ClimateReport {
  zoneName: string;
  orientationScore: number;
  passiveStrategies: string[];
  windDirection: string;
  solarRisk: Record<"N"|"S"|"E"|"W", number>;
}

export interface StructureReport {
  foundationType: string;
  foundationReason: string;
  structuralNote: string;
  beams: { name: string; size: string }[];
  columns: { x: number; y: number }[];
  grid_x?: number[];
  grid_y?: number[];
}





