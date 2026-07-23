// Door/Window schedule, Finishes schedule and Area statement — the DATA layer.
// A faithful TS mirror of the Python source of truth in
// engine/app/services/schedules.py. Only data derivation lives here; JSX
// presentation stays in the components that use it (schedules.tsx, the GFC
// panel's joinery card).
// Keep this in lock-step with engine/app/services/schedules.py.

import type { FinishTier, Opening, Plan, RoomType } from "@gharplan/shared";

const SQM_TO_SQFT = 10.7639;

/** metres → masonry-opening size in mm, e.g. 0.9 → "900". Rounded to nearest 5 mm. */
export function toMm(m: number): number {
  return Math.round((m * 1000) / 5) * 5;
}

export function sqft(sqm: number): string {
  return (sqm * SQM_TO_SQFT).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Door & Window schedule
// ---------------------------------------------------------------------------

export type OpeningGroup = {
  mark: string;
  kind: "door" | "window";
  isVent: boolean;
  widthM: number;
  heightM: number;
  qty: number;
  description: string;
  typeDetail: string;
  frameMaterial: string;
  hardware: string;
  glazing: string;
  uValue: string;
  shgc: string;
  remarks: string;
};

/** Default leaf height (m) when an opening omits it. */
function defaultHeight(o: Opening): number {
  if (o.kind === "door") return 2.1;
  // Windows: sill 0.9 + a ~1.2 m vent ≈ 1.2 m typical; ventilators are short.
  return o.widthM <= 0.6 ? 0.45 : 1.2;
}

function doorDescription(widthM: number): string {
  if (widthM >= 1.0) return "Main entrance door";
  if (widthM >= 0.75) return "Flush door";
  return "Bathroom door";
}

function windowDescription(widthM: number, isVent: boolean): string {
  if (isVent) return "Ventilator";
  if (widthM >= 1.8) return "Large window";
  if (widthM >= 1.2) return "Window";
  return "Small window";
}

type OpeningFields = Pick<OpeningGroup, "typeDetail" | "frameMaterial" | "hardware" | "glazing" | "uValue" | "shgc" | "remarks">;

// Frame material / hardware / glazing by finish tier — standard Indian residential
// convention. "standard" strings are byte-identical to the pre-tier defaults, so
// buildOpeningSchedule(plan) with no tier argument is unchanged.
function doorFields(widthM: number, tier: FinishTier): OpeningFields {
  if (tier === "economy") {
    return {
      typeDetail: "Flush (factory laminate)",
      frameMaterial: "Country wood / flush shutter",
      hardware: "Standard mortise lock, 2 hinges",
      glazing: "",
      uValue: "",
      shgc: "",
      remarks: "Ensure 5mm bottom clearance.",
    };
  }
  if (tier === "premium") {
    return {
      typeDetail: "Panel/Teak veneer",
      frameMaterial: "Teak wood frame + veneered/panel shutter",
      hardware: "Premium mortise lock (brass), 4 hinges, concealed door closer",
      glazing: "",
      uValue: "",
      shgc: "",
      remarks: "Ensure 5mm bottom clearance.",
    };
  }
  return {
    typeDetail: widthM >= 1.0 ? "Panel/Teak" : "Flush",
    frameMaterial: "Sal wood / WPC",
    hardware: "SS Mortise lock, 3 hinges, door stopper",
    glazing: "",
    uValue: "",
    shgc: "",
    remarks: "Ensure 5mm bottom clearance.",
  };
}

function windowFields(tier: FinishTier): OpeningFields {
  if (tier === "economy") {
    return {
      typeDetail: "Sliding (2-track)",
      frameMaterial: "Powder-coated aluminum (sliding)",
      hardware: "",
      glazing: "4mm plain glass",
      uValue: "~5.0 W/m²K",
      shgc: "",
      remarks: "Include mosquito mesh.",
    };
  }
  if (tier === "premium") {
    return {
      typeDetail: "Casement, thermal break",
      frameMaterial: "UPVC/aluminum thermal-break (casement)",
      hardware: "",
      glazing: "6mm toughened DGU (double-glazed)",
      uValue: "< 2.0 W/m²K",
      shgc: "< 0.3",
      remarks: "Include mosquito mesh; concealed hinges.",
    };
  }
  return {
    typeDetail: "Sliding (2.5 track)",
    frameMaterial: "UPVC / Aluminum",
    hardware: "",
    glazing: "6mm toughened clear",
    uValue: "< 3.0 W/m²K",
    shgc: "< 0.4",
    remarks: "Include mosquito mesh.",
  };
}

const NO_FIELDS: OpeningFields = { typeDetail: "", frameMaterial: "", hardware: "", glazing: "", uValue: "", shgc: "", remarks: "" };

/** Group raw openings by (kind, width, height) and assign D#/W#/V# marks.
 *  `tier` selects the frame material / hardware / glazing spec shown per mark;
 *  "standard" (the default) is byte-identical to the pre-tier defaults. */
export function buildOpeningSchedule(plan: Plan, tier: FinishTier = "standard"): OpeningGroup[] {
  type Acc = { kind: "door" | "window"; isVent: boolean; widthM: number; heightM: number; qty: number };
  const groups = new Map<string, Acc>();

  const collect = (list: Opening[]) => {
    for (const o of list) {
      const widthM = o.widthM;
      const heightM = o.heightM && o.heightM > 0 ? o.heightM : defaultHeight(o);
      const isVent = o.kind === "window" && widthM <= 0.6 && heightM <= 0.6;
      const key = `${o.kind}|${toMm(widthM)}|${toMm(heightM)}|${isVent ? "v" : ""}`;
      const prev = groups.get(key);
      const count = o.count && o.count > 0 ? o.count : 1;
      if (prev) prev.qty += count;
      else groups.set(key, { kind: o.kind, isVent, widthM, heightM, qty: count });
    }
  };
  collect(plan.doors ?? []);
  collect(plan.windows ?? []);

  const all = Array.from(groups.values());
  const byWidthDesc = (a: Acc, b: Acc) => b.widthM - a.widthM || b.heightM - a.heightM;

  const doors = all.filter((g) => g.kind === "door").sort(byWidthDesc);
  const windows = all.filter((g) => g.kind === "window" && !g.isVent).sort(byWidthDesc);
  const vents = all.filter((g) => g.kind === "window" && g.isVent).sort(byWidthDesc);

  const out: OpeningGroup[] = [];
  doors.forEach((g, i) =>
    out.push({
      mark: `D${i + 1}`,
      kind: g.kind,
      isVent: g.isVent,
      widthM: g.widthM,
      heightM: g.heightM,
      qty: g.qty,
      description: doorDescription(g.widthM),
      ...doorFields(g.widthM, tier),
    }),
  );
  windows.forEach((g, i) =>
    out.push({
      mark: `W${i + 1}`,
      kind: g.kind,
      isVent: g.isVent,
      widthM: g.widthM,
      heightM: g.heightM,
      qty: g.qty,
      description: windowDescription(g.widthM, false),
      ...windowFields(tier),
    }),
  );
  vents.forEach((g, i) =>
    out.push({
      mark: `V${i + 1}`,
      kind: g.kind,
      isVent: g.isVent,
      widthM: g.widthM,
      heightM: g.heightM,
      qty: g.qty,
      description: "Ventilator",
      ...NO_FIELDS,
    }),
  );
  return out;
}

export function typeLabel(g: OpeningGroup): string {
  if (g.isVent) return "Ventilator";
  return g.kind === "door" ? "Door" : "Window";
}

// ---------------------------------------------------------------------------
// Finishes schedule
// ---------------------------------------------------------------------------

export type Finish = { floor: string; dado: string; walls: string; ceiling: string };

export const FINISH_DEFAULT: Finish = {
  floor: "Vitrified tiles",
  dado: "100 mm skirting",
  walls: "Putty + emulsion",
  ceiling: "POP + paint",
};

export const FINISHES: Partial<Record<RoomType, Finish>> = {
  living: { floor: "Vitrified tiles", dado: "100 mm skirting", walls: "Putty + emulsion", ceiling: "POP + paint" },
  dining: { floor: "Vitrified tiles", dado: "100 mm skirting", walls: "Putty + emulsion", ceiling: "POP + paint" },
  bedroom: { floor: "Vitrified tiles", dado: "100 mm skirting", walls: "Putty + emulsion", ceiling: "POP + paint" },
  master_bedroom: { floor: "Vitrified tiles", dado: "100 mm skirting", walls: "Putty + emulsion", ceiling: "POP + paint" },
  childrens_bedroom: { floor: "Vitrified tiles", dado: "100 mm skirting", walls: "Putty + emulsion", ceiling: "POP + paint" },
  study: { floor: "Vitrified tiles", dado: "100 mm skirting", walls: "Putty + emulsion", ceiling: "POP + paint" },
  kitchen: { floor: "Anti-skid tiles", dado: "600 mm dado tiles", walls: "Emulsion", ceiling: "POP + paint" },
  toilet: { floor: "Anti-skid tiles", dado: "2100 mm full-height dado", walls: "Waterproof emulsion", ceiling: "Grid ceiling" },
  bathroom: { floor: "Anti-skid tiles", dado: "2100 mm full-height dado", walls: "Waterproof emulsion", ceiling: "Grid ceiling" },
  pooja: { floor: "Vitrified / marble", dado: "100 mm skirting", walls: "Emulsion", ceiling: "POP" },
  staircase: { floor: "Granite / Kota", dado: "100 mm skirting", walls: "Emulsion", ceiling: "Paint" },
  balcony: { floor: "Anti-skid tiles", dado: "150 mm skirting", walls: "Exterior emulsion", ceiling: "Exterior paint" },
  sitout: { floor: "Anti-skid tiles", dado: "150 mm skirting", walls: "Exterior emulsion", ceiling: "Exterior paint" },
  utility: { floor: "Anti-skid tiles", dado: "150 mm skirting", walls: "Exterior emulsion", ceiling: "Exterior paint" },
  parking: { floor: "Paver / Tremix", dado: "—", walls: "Cement paint", ceiling: "—" },
};

export function finishFor(type: RoomType): Finish {
  return FINISHES[type] ?? FINISH_DEFAULT;
}

// ---------------------------------------------------------------------------
// Ceiling treatment (RCP — GFC-08)
// ---------------------------------------------------------------------------

export type CeilingTreatment = { kind: "gypsum" | "grid" | "none"; dropMm: number; label: string };

/** False-ceiling category + typical drop height for a room, from the SAME
 *  per-room-type ceiling text `finishFor` already carries (no new material
 *  system) — "Grid ceiling" (wet rooms) -> grid/PVC; "POP..." -> gypsum;
 *  else ("Paint"/"Exterior paint"/"—") -> no false ceiling. Drop height is a
 *  tier-aware standard Indian residential assumption, not a per-project
 *  computed value. */
export function ceilingTreatmentFor(type: RoomType, tier: FinishTier): CeilingTreatment {
  const ceiling = finishFor(type).ceiling.toLowerCase();
  if (ceiling.includes("grid")) return { kind: "grid", dropMm: 200, label: "Grid / PVC ceiling" };
  if (ceiling.includes("pop")) {
    const dropMm = tier === "economy" ? 225 : tier === "premium" ? 450 : 300;
    return { kind: "gypsum", dropMm, label: "Gypsum false ceiling" };
  }
  return { kind: "none", dropMm: 0, label: "Exposed painted slab" };
}

/** Distinct room types present, in first-seen order. */
export function presentTypes(plan: Plan): RoomType[] {
  const seen = new Set<RoomType>();
  const out: RoomType[] = [];
  for (const r of plan.rooms ?? []) {
    if (!seen.has(r.type)) {
      seen.add(r.type);
      out.push(r.type);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Area statement
// ---------------------------------------------------------------------------

export function floorName(f: number): string {
  if (f === 0) return "Ground floor";
  if (f === 1) return "First floor";
  if (f === 2) return "Second floor";
  if (f === 3) return "Third floor";
  return `Floor ${f}`;
}

/** Built-up area (sqm) per distinct floor from room areas, or null if single-floor. */
export function perFloorBuiltUp(plan: Plan): { floor: number; sqm: number }[] | null {
  const byFloor = new Map<number, number>();
  for (const r of plan.rooms ?? []) {
    const f = r.floor ?? 0;
    byFloor.set(f, (byFloor.get(f) ?? 0) + (r.areaSqm ?? 0));
  }
  if (byFloor.size <= 1) return null;
  return Array.from(byFloor.entries())
    .map(([floor, sqm]) => ({ floor, sqm }))
    .sort((a, b) => a.floor - b.floor);
}
