"use client";

import * as React from "react";
import { AlertTriangle, BookOpen, Grid3X3, Hammer, Layers, Loader2 } from "lucide-react";
import type { Plan } from "@gharplan/shared";
import { engine } from "@/lib/engine";
import { cn } from "@/lib/utils";

/* ---- Wire types for POST /plan/structural (StructuralDesign, camelCase) ---- */

interface GridLineT {
  axis: "x" | "y";
  label: string;
  offsetM: number;
}
interface MemberT {
  id: string;
  kind: "column" | "beam" | "slab" | "footing" | "plinth_beam" | "lintel";
  floor: number;
  sizeMm: [number, number];
  thicknessMm?: number | null;
  rebar: string;
  designForces: Record<string, number>;
  utilization: number;
  clauseRefs: string[];
  xM?: number | null;
  yM?: number | null;
}
interface BarRowT {
  mark: string;
  memberId: string;
  barDiaMm: number;
  shape: string;
  count: number;
  cutLengthM: number;
  totalKg: number;
}
interface DesignBasisSectionT {
  title: string;
  body: string;
  clauseRefs: string[];
  assumptions: string[];
}
interface StructuralDesignT {
  schemaVersion: string;
  concreteGrade: string;
  steelGrade: string;
  seismic: Record<string, unknown>;
  sbcKpa: number;
  soilType: string;
  grid: GridLineT[];
  members: MemberT[];
  bbs: BarRowT[];
  futureFloorProvision: boolean;
  designBasis: DesignBasisSectionT[];
  disclaimer: string;
}

const KIND_ORDER: MemberT["kind"][] = ["column", "beam", "slab", "footing", "plinth_beam", "lintel"];
const KIND_LABEL: Record<MemberT["kind"], string> = {
  column: "Columns",
  beam: "Beams",
  slab: "Slabs",
  footing: "Footings",
  plinth_beam: "Plinth beams",
  lintel: "Lintels",
};

function utilTone(u: number): string {
  if (u <= 0.7) return "bg-emerald-500";
  if (u <= 0.9) return "bg-amber-500";
  return "bg-rose-500";
}

function sizeLabel(m: MemberT): string {
  const [a, b] = m.sizeMm;
  const base = `${a} × ${b}`;
  return m.thicknessMm ? `${base} · ${m.thicknessMm} thk` : base;
}

function forceLabel(m: MemberT): string {
  const f = m.designForces || {};
  if (m.kind === "column") return f.Pu_kN != null ? `Pu ${f.Pu_kN} kN` : "";
  if (m.kind === "beam") return f.Mu_kNm != null ? `Mu ${f.Mu_kNm} kNm · Vu ${f.Vu_kN} kN` : "";
  if (m.kind === "slab") return f.wu_kN_m2 != null ? `wu ${f.wu_kN_m2} kN/m²` : "";
  if (m.kind === "footing") return f.P_service_kN != null ? `P ${f.P_service_kN} kN (service)` : "";
  const first = Object.entries(f)[0];
  return first ? `${first[0].replace(/_/g, " ")} ${first[1]}` : "";
}

function Chip({ label, value, tone = "slate" }: { label: string; value: string; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-800 ring-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-500/30",
    amber: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30",
    emerald:
      "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30",
    violet:
      "bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:ring-violet-500/30",
  };
  return (
    <div className={cn("rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-1", tones[tone] || tones.slate)}>
      <span className="opacity-70">{label}</span> {value}
    </div>
  );
}

/** Column-layout plan: grid lines + designed column positions (metres, N up). */
function ColumnLayoutSvg({ grid, columns }: { grid: GridLineT[]; columns: MemberT[] }) {
  const xs = grid.filter((g) => g.axis === "x").map((g) => g.offsetM);
  const ys = grid.filter((g) => g.axis === "y").map((g) => g.offsetM);
  if (xs.length === 0 || ys.length === 0) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const flip = (y: number) => minY + maxY - y; // plan +y = North; SVG y runs down
  const pad = Math.max(maxX - minX, maxY - minY) * 0.14 + 0.5;

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      className="h-56 w-full text-slate-800 dark:text-slate-200"
    >
      {grid.map((g, i) =>
        g.axis === "x" ? (
          <g key={i}>
            <line
              x1={g.offsetM} y1={minY - pad / 2} x2={g.offsetM} y2={maxY + pad / 2}
              stroke="currentColor" strokeWidth="0.03" strokeOpacity="0.3" strokeDasharray="0.25 0.15"
            />
            <text x={g.offsetM} y={flip(maxY) - pad / 2 - 0.15} textAnchor="middle" fontSize="0.55" className="fill-current opacity-60">
              {g.label}
            </text>
          </g>
        ) : (
          <g key={i}>
            <line
              x1={minX - pad / 2} y1={flip(g.offsetM)} x2={maxX + pad / 2} y2={flip(g.offsetM)}
              stroke="currentColor" strokeWidth="0.03" strokeOpacity="0.3" strokeDasharray="0.25 0.15"
            />
            <text x={minX - pad / 2 - 0.2} y={flip(g.offsetM) + 0.18} textAnchor="end" fontSize="0.55" className="fill-current opacity-60">
              {g.label}
            </text>
          </g>
        ),
      )}
      {columns.map(
        (c, i) =>
          c.xM != null &&
          c.yM != null && (
            <g key={`c-${i}`}>
              <rect x={c.xM - 0.22} y={flip(c.yM) - 0.22} width="0.44" height="0.44" className="fill-current" rx="0.05">
                <title>{`${c.id} · ${sizeLabel(c)} · ${c.rebar}`}</title>
              </rect>
            </g>
          ),
      )}
    </svg>
  );
}

export function StructurePanel({ plan }: { plan: Plan }) {
  const [data, setData] = React.useState<StructuralDesignT | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ac = new AbortController();
    setData(null);
    setError(null);
    engine
      .structural(plan, ac.signal)
      .then((d) => setData(d as StructuralDesignT))
      .catch((err) => {
        if (!ac.signal.aborted) setError(err instanceof Error ? err.message : "Engine unreachable");
      });
    return () => ac.abort();
  }, [plan]);

  if (error) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        <p>Couldn&apos;t run the structural design: {error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Running preliminary member design…
      </div>
    );
  }

  const seismic = data.seismic as Record<string, string | number>;
  const columns = data.members.filter((m) => m.kind === "column");
  const byKind = KIND_ORDER.map((k) => [k, data.members.filter((m) => m.kind === k)] as const).filter(
    ([, list]) => list.length > 0,
  );
  const steelByDia = data.bbs.reduce<Record<number, number>>((acc, r) => {
    acc[r.barDiaMm] = (acc[r.barDiaMm] || 0) + r.totalKg;
    return acc;
  }, {});
  const totalSteel = Object.values(steelByDia).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      {/* header chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="Concrete" value={data.concreteGrade} tone="slate" />
        <Chip label="Steel" value={data.steelGrade} tone="slate" />
        <Chip
          label={`Seismic Zone ${seismic.zone}`}
          value={`Vb ≈ ${seismic.baseShear_kN} kN (${seismic.baseShearPctW}% W)`}
          tone="violet"
        />
        <Chip label="SBC" value={`${data.sbcKpa} kPa · ${String(data.soilType).replace(/_/g, " ")}`} tone="amber" />
        {data.futureFloorProvision && <Chip label="Provision" value="+1 future floor" tone="emerald" />}
      </div>

      {/* disclaimer — prominent */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{data.disclaimer}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* column layout */}
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <h4 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <Grid3X3 className="h-4 w-4 text-primary" /> Column layout
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {columns.length} columns · grid {data.grid.filter((g) => g.axis === "x").length}×
              {data.grid.filter((g) => g.axis === "y").length}
            </span>
          </h4>
          <div className="mt-3 rounded-lg border border-dashed bg-muted/20 p-3">
            <ColumnLayoutSvg grid={data.grid} columns={columns} />
          </div>
        </div>

        {/* BBS summary */}
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <h4 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <Hammer className="h-4 w-4 text-primary" /> Reinforcement summary
            <span className="ml-auto text-xs font-normal text-muted-foreground">≈ {Math.round(totalSteel)} kg total</span>
          </h4>
          <div className="mt-3 divide-y rounded-lg border">
            <div className="grid grid-cols-3 bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Bar dia</span>
              <span>Weight</span>
              <span>Share</span>
            </div>
            {Object.entries(steelByDia)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([dia, kg]) => (
                <div key={dia} className="grid grid-cols-3 items-center px-3 py-2 text-sm">
                  <span className="font-medium">{dia} mm</span>
                  <span className="text-muted-foreground">{Math.round(kg)} kg</span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(3, (kg / Math.max(totalSteel, 1)) * 100)}%` }}
                      />
                    </span>
                    <span className="w-9 text-right text-xs text-muted-foreground">
                      {Math.round((kg / Math.max(totalSteel, 1)) * 100)}%
                    </span>
                  </span>
                </div>
              ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Approximate bar-bending quantities ({data.bbs.length} schedule rows) for budgeting only.
          </p>
        </div>
      </div>

      {/* member schedule grouped by kind */}
      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <h4 className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <Layers className="h-4 w-4 text-primary" /> Member schedule
        </h4>
        <div className="mt-3 space-y-2">
          {byKind.map(([kind, list]) => {
            const maxU = Math.max(...list.map((m) => m.utilization));
            return (
              <details key={kind} className="group rounded-lg border" open={kind === "column"}>
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-semibold">
                  <span>
                    {KIND_LABEL[kind]} <span className="font-normal text-muted-foreground">({list.length})</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    peak {Math.round(maxU * 100)}%
                    <span className="transition group-open:rotate-180">▾</span>
                  </span>
                </summary>
                <div className="divide-y border-t">
                  {list.map((m) => (
                    <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_10rem]">
                      <div className="text-sm font-medium">
                        {m.id}
                        <div className="font-mono text-xs text-muted-foreground">{sizeLabel(m)}</div>
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <div className="truncate text-sm text-muted-foreground" title={m.rebar}>
                          {m.rebar}
                        </div>
                        <div className="text-xs text-muted-foreground/80">{forceLabel(m)}</div>
                      </div>
                      <div className="flex items-center gap-2 justify-self-end sm:w-40 sm:justify-self-stretch">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn("block h-full rounded-full", utilTone(m.utilization))}
                            style={{ width: `${Math.min(100, Math.round(m.utilization * 100))}%` }}
                          />
                        </span>
                        <span className="w-9 text-right font-mono text-xs text-muted-foreground">
                          {Math.round(m.utilization * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* design basis */}
      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <h4 className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <BookOpen className="h-4 w-4 text-primary" /> Design basis
        </h4>
        <div className="mt-3 space-y-2">
          {data.designBasis.map((s, i) => (
            <details key={i} className="group rounded-lg border">
              <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-semibold">
                {s.title}
                <span className="text-xs text-muted-foreground transition group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-2 border-t px-3 py-2">
                <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                {s.clauseRefs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {s.clauseRefs.map((c, j) => (
                      <span key={j} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {s.assumptions.length > 0 && (
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                    {s.assumptions.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
