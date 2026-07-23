"use client";

import * as React from "react";
import type { CodeReport, Plan } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";
import { buildOpeningSchedule, finishFor, floorName, perFloorBuiltUp, presentTypes, sqft, toMm, typeLabel } from "@/lib/schedules";

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
