"use client";

import * as React from "react";
import type { CodeReport, Opening, Plan, RoomType } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";

const SQM_TO_SQFT = 10.7639;

/** metres → masonry-opening size in mm, e.g. 0.9 → "900". Rounded to nearest 5 mm. */
function toMm(m: number): number {
  return Math.round((m * 1000) / 5) * 5;
}

function sqft(sqm: number): string {
  return (sqm * SQM_TO_SQFT).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Door & Window schedule
// ---------------------------------------------------------------------------

type OpeningGroup = {
  mark: string;
  kind: "door" | "window";
  isVent: boolean;
  widthM: number;
  heightM: number;
  qty: number;
  description: string;
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

/** Group raw openings by (kind, width, height) and assign D#/W#/V# marks. */
function buildOpeningSchedule(plan: Plan): OpeningGroup[] {
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
    }),
  );
  return out;
}

function typeLabel(g: OpeningGroup): string {
  if (g.isVent) return "Ventilator";
  return g.kind === "door" ? "Door" : "Window";
}

// ---------------------------------------------------------------------------
// Finishes schedule
// ---------------------------------------------------------------------------

type Finish = { floor: string; dado: string; walls: string; ceiling: string };

const FINISH_DEFAULT: Finish = {
  floor: "Vitrified tiles",
  dado: "100 mm skirting",
  walls: "Putty + emulsion",
  ceiling: "POP + paint",
};

const FINISHES: Partial<Record<RoomType, Finish>> = {
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

function finishFor(type: RoomType): Finish {
  return FINISHES[type] ?? FINISH_DEFAULT;
}

/** Distinct room types present, in first-seen order. */
function presentTypes(plan: Plan): RoomType[] {
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

function floorName(f: number): string {
  if (f === 0) return "Ground floor";
  if (f === 1) return "First floor";
  if (f === 2) return "Second floor";
  if (f === 3) return "Third floor";
  return `Floor ${f}`;
}

/** Built-up area (sqm) per distinct floor from room areas, or null if single-floor. */
function perFloorBuiltUp(plan: Plan): { floor: number; sqm: number }[] | null {
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

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

function Section({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 shadow-soft print:shadow-none">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <h3 className="font-display text-lg font-bold tracking-tight">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const TH = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-3 py-2 align-top text-foreground";

export function Schedules({ plan, code }: { plan: Plan; code: CodeReport }) {
  const openings = React.useMemo(() => buildOpeningSchedule(plan), [plan]);
  const types = React.useMemo(() => presentTypes(plan), [plan]);
  const floors = React.useMemo(perFloorBuiltUp.bind(null, plan), [plan]);

  const m = code.metrics;
  const floorCount =
    plan.plot?.floors || new Set((plan.rooms ?? []).map((r) => r.floor ?? 0)).size || 1;

  const areaRows: { label: string; metric: string; imperial: string }[] = [
    { label: "Plot area", metric: `${m.plotAreaSqm.toFixed(1)} m²`, imperial: `${sqft(m.plotAreaSqm)} ft²` },
    { label: "Built-up area", metric: `${m.builtUpSqm.toFixed(1)} m²`, imperial: `${sqft(m.builtUpSqm)} ft²` },
    { label: "Ground coverage", metric: `${m.groundCoveragePct.toFixed(1)}%`, imperial: `${m.footprintSqm.toFixed(1)} m² footprint` },
    { label: "FAR (used / allowed)", metric: `${m.farUsed.toFixed(2)} / ${m.farAllowed.toFixed(2)}`, imperial: "—" },
    { label: "Number of floors", metric: String(floorCount), imperial: "G" + (floorCount > 1 ? `+${floorCount - 1}` : "") },
  ];

  return (
    <div className="space-y-4">
      {/* Door & Window schedule */}
      <Section label="Working drawings" title="Door &amp; Window Schedule">
        {openings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No openings defined for this plan yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className={TH}>Mark</th>
                    <th className={TH}>Size (W × H, mm)</th>
                    <th className={TH}>Type</th>
                    <th className={`${TH} text-right`}>Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {openings.map((g) => (
                    <tr key={g.mark} className="odd:bg-background even:bg-muted/20">
                      <td className={`${TD} font-mono font-medium`}>{g.mark}</td>
                      <td className={`${TD} font-mono`}>
                        {toMm(g.widthM)} × {toMm(g.heightM)}
                      </td>
                      <td className={TD}>
                        <span className="font-medium">{typeLabel(g)}</span>
                        <span className="text-muted-foreground"> · {g.description}</span>
                      </td>
                      <td className={`${TD} text-right font-mono`}>{g.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Sizes are masonry openings (mm). Verify on site before fabrication.
            </p>
          </>
        )}
      </Section>

      {/* Finishes schedule */}
      <Section label="Specifications" title="Finishes Schedule">
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms defined for this plan yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className={TH}>Space</th>
                  <th className={TH}>Floor</th>
                  <th className={TH}>Skirting / Dado</th>
                  <th className={TH}>Walls</th>
                  <th className={TH}>Ceiling</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {types.map((t) => {
                  const f = finishFor(t);
                  return (
                    <tr key={t} className="odd:bg-background even:bg-muted/20">
                      <td className={`${TD} font-medium`}>{ROOM_LABELS[t]}</td>
                      <td className={TD}>{f.floor}</td>
                      <td className={TD}>{f.dado}</td>
                      <td className={TD}>{f.walls}</td>
                      <td className={TD}>{f.ceiling}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Area statement */}
      <Section label="Statutory" title="Area Statement">
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <tbody className="divide-y">
              {areaRows.map((row) => (
                <tr key={row.label} className="odd:bg-background even:bg-muted/20">
                  <td className={`${TD} font-medium`}>{row.label}</td>
                  <td className={`${TD} text-right font-mono`}>{row.metric}</td>
                  <td className={`${TD} text-right font-mono text-muted-foreground`}>{row.imperial}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {floors && (
          <div className="mt-3">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Built-up by floor
            </div>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <tbody className="divide-y">
                  {floors.map((fl) => (
                    <tr key={fl.floor} className="odd:bg-background even:bg-muted/20">
                      <td className={`${TD} font-medium`}>{floorName(fl.floor)}</td>
                      <td className={`${TD} text-right font-mono`}>{fl.sqm.toFixed(1)} m²</td>
                      <td className={`${TD} text-right font-mono text-muted-foreground`}>{sqft(fl.sqm)} ft²</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          Areas are indicative; confirm against sanctioned drawings for {code.state}.
        </p>
      </Section>
    </div>
  );
}
