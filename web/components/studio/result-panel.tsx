"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Home,
  IndianRupee,
  Info,
  Layers,
  Loader2,
  Pencil,
  FileText,
  MessageSquare,
  Ruler,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import type { BoqReport, GeneratedOption, GenerateResponse, Status } from "@gharplan/shared";
import { DISCLAIMERS } from "@gharplan/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { FloorPlanCad } from "@/components/cad/floor-plan-cad";
import { FloorPlan3D } from "@/components/cad/floor-plan-3d";
import { MepPlan } from "@/components/cad/mep-plan";
import { ElevationView } from "@/components/cad/elevation-view";
import { SectionView } from "@/components/cad/section-view";
import { Schedules } from "@/components/studio/schedules";
import { ScoreGauge, scoreColor } from "@/components/score-gauge";
import { ZONE_CAD } from "@/lib/cad";
import { cn, inr2 } from "@/lib/utils";

import { ClimatePanel } from "./climate-panel";
import { StructurePanel } from "./structure-panel";
import { Switch } from "@/components/ui/switch";


const STATUS_ICON: Record<Status, React.ReactNode> = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  fail: <XCircle className="h-4 w-4 text-rose-600" />,
};

export function ResultPanel({
  data,
  options,
  selectedOption,
  onSelectOption,
  boq,
  boqLoading,
  exporting,
  onExport,
  onOpenInEditor,
  onRefine,
  refining,
  editNote,
  subtitle,
}: {
  data: GenerateResponse;
  options: GeneratedOption[];
  selectedOption: number;
  onSelectOption: (i: number) => void;
  boq: BoqReport | null;
  boqLoading: boolean;
  exporting: string | null;
  onExport: (type: "pdf" | "dxf" | "xlsx") => void;
  onOpenInEditor: () => void;
  onRefine: (instruction: string) => void;
  refining: boolean;
  editNote: { applied: string[]; unmatched: string[] } | null;
  subtitle: string;
}) {
  const [colorBy, setColorBy] = React.useState<"zone" | "status">("zone");
  const [view, setView] = React.useState<"2d" | "3d" | "elevation" | "section" | "mep">("2d");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"overview" | "vastu" | "code" | "climate" | "structure" | "cost" | "documents">("overview");
  const [floor, setFloor] = React.useState(0);

  const floors = React.useMemo(
    () => Array.from(new Set(data.plan.rooms.map((r) => r.floor ?? 0))).sort((a, b) => a - b),
    [data],
  );
  React.useEffect(() => setFloor(0), [data]);

  const statusByRoom = React.useMemo(() => {
    const m: Record<string, Status> = {};
    for (const r of data.vastu.rooms) if (r.roomId) m[r.roomId] = r.status;
    return m;
  }, [data]);

  const code = data.code;
  const vastu = data.vastu;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold tracking-tight">{data.plan.project.name}</h2>
            {data.meta?.tier && <Badge variant="brand">{data.meta.tier}</Badge>}
            {data.meta?.variantName && <Badge variant="outline">{data.meta.variantName}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

      {/* SCORE DASHBOARD */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", vastu.score >= 70 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" : vastu.score >= 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300")}>
          Vastu Score: {Math.round(vastu.score)}/100 {vastu.score >= 70 ? "â—â—â—â—â—‹" : "â—â—â—â—‹â—‹"}
        </div>
        <div className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", code.status === "pass" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" : code.status === "warn" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300")}>
          Code: {code.status === "pass" ? "Pass âœ“" : code.status === "warn" ? "Warn !" : "Fail âœ—"}
        </div>
        {data.climate && (
          <div className="rounded-full bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300 px-2.5 py-1 text-xs font-semibold">
            Climate: {data.climate.orientationScore > 80 ? "A+" : data.climate.orientationScore > 60 ? "A" : "B"}
          </div>
        )}
        {boq && (
          <div className="rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300 px-2.5 py-1 text-xs font-semibold">
            Budget: {compactInr(boq.summary.grandTotal)}
          </div>
        )}
        <div className="rounded-full bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300 px-2.5 py-1 text-xs font-semibold">
          Efficiency: {Math.round((code.metrics.builtUpSqm / (code.metrics.plotAreaSqm || 1)) * 100)}%
        </div>
      </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenInEditor}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {(["pdf", "dxf", "xlsx"] as const).map((t) => (
            <Button
              key={t}
              variant={t === "pdf" ? "accent" : "outline"}
              size="sm"
              disabled={!!exporting}
              onClick={() => onExport(t)}
            >
              {exporting === t ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {data.meta?.downscaled && data.meta?.note && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Right-sized to {data.meta.tier}.</strong> {data.meta.note}
          </span>
        </div>
      )}

      {/* single-prompt refine â€” edits the selected scheme in place */}
      <RefinePanel onRefine={onRefine} refining={refining} editNote={editNote} />

      {/* the five schemes â€” pick one to drive the drawings + checks below */}
      <SchemeGallery options={options} selected={selectedOption} onSelect={onSelectOption} />

      {/* floor plan: 2D CAD / 3D */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Floor plan
            </span>
            <Segmented<"2d" | "3d" | "elevation" | "section" | "mep">
              value={view}
              onChange={setView}
              options={[
                { value: "2d", label: "2D CAD" },
                { value: "3d", label: "3D BIM" },
                { value: "elevation", label: "Elevations" },
                { value: "section", label: "Section" },
                { value: "mep", label: "MEP" },
              ]}
            />
            {floors.length > 1 && (
              <Segmented
                value={String(floor)}
                onChange={(v) => setFloor(Number(v))}
                options={floors.map((f) => ({
                  value: String(f),
                  label: f === 0 ? "Ground" : f === 1 ? "1st floor" : f === 2 ? "2nd floor" : `${f}th floor`,
                }))}
              />
            )}
          </div>
          {view === "2d" && (
            <Segmented<"zone" | "status">
              value={colorBy}
              onChange={setColorBy}
              options={[
                { value: "zone", label: "Vastu zones" },
                { value: "status", label: "Compliance" },
              ]}
            />
          )}
        </div>

        {view === "2d" ? (
          <>
            <FloorPlanCad
              plan={data.plan}
              floor={floors.length > 1 ? floor : undefined}
              colorBy={colorBy}
              statusByRoom={statusByRoom}
              selectedId={selected}
              onSelect={setSelected}
              className="h-[460px] shadow-soft"
            />
            {colorBy === "zone" && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
                {["NE", "E", "SE", "S", "SW", "W", "NW", "N", "CENTER"].map((z) => (
                  <span key={z} className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ZONE_CAD[z].fill, outline: `1px solid ${ZONE_CAD[z].ink}33` }} />
                    {ZONE_CAD[z].label}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : view === "3d" ? (
          <>
            <FloorPlan3D plan={data.plan} className="h-[460px] overflow-hidden rounded-xl border bg-card shadow-soft" />
            <p className="px-1 text-[11px] text-muted-foreground">
              Axonometric 3D Â· same geometry as the CAD drawing &amp; DXF
            </p>
          </>
        ) : view === "elevation" ? (
          <ElevationView plan={data.plan} />
        ) : view === "section" ? (
          <SectionView plan={data.plan} />
        ) : (
          <MepPlan plan={data.plan} floor={floors.length > 1 ? floor : undefined} />
        )}
      </div>

      


      {data.meta?.narrative && (
        <details className="group rounded-xl border bg-card p-4 shadow-soft [&_summary::-webkit-details-marker]:hidden" open>
          <summary className="flex cursor-pointer items-center justify-between font-bold text-sm tracking-tight text-foreground">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> WHY THIS DESIGN WORKS</span>
            <span className="transition group-open:rotate-180">â–¼</span>
          </summary>
          <div className="mt-3 space-y-3 border-t pt-3 text-sm text-muted-foreground">
            <p className="leading-relaxed">{data.meta.narrative}</p>
            {data.meta.highlights && data.meta.highlights.length > 0 && (
              <ul className="list-inside list-disc space-y-1 ml-1 text-xs">
                {data.meta.highlights.map((h, i) => <li key={i}>{h}</li>)}
              </ul>
            )}
            {data.meta.inspiredBy && (
              <p className="font-medium text-foreground text-xs bg-muted/30 p-2 rounded-md">Inspired by: {data.meta.inspiredBy}</p>
            )}
          </div>
        </details>
      )}

      {/* tabs */}
      <div>
        <div className="flex gap-1 border-b">
          {([
            ["overview", "Overview"],
            ["vastu", "Vastu"],
            ["code", "Code"],
            ["climate", "Climate"],
            ["structure", "Structure"],
            ["cost", "Cost"],
            ["documents", "Documents"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "relative -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                tab === k
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard icon={<div className="scale-[0.55]"><ScoreGauge score={vastu.score} size={64} stroke={7} /></div>} label="Vastu score" value={vastu.grade} sub={`${vastu.summary.passCount}✓ ${vastu.summary.warnCount}! ${vastu.summary.failCount}✗`} tone={vastu.score >= 70 ? "ok" : vastu.score >= 50 ? "warn" : "bad"} />
                <StatCard icon={code.status === "fail" ? <XCircle className="h-5 w-5" /> : code.status === "warn" ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />} label="Code review" value={code.status === "pass" ? "Clear" : code.status === "warn" ? "Advisories" : "Issues"} sub={`${code.summary.failCount} fail · ${code.summary.warnCount} warn`} tone={code.status === "fail" ? "bad" : code.status === "warn" ? "warn" : "ok"} />
                <StatCard icon={<Layers className="h-5 w-5" />} label="Plot use" value={`${code.metrics.builtUpSqm.toFixed(0)} m²`} sub={`${code.metrics.groundCoveragePct.toFixed(0)}% cover · FAR ${code.metrics.farUsed.toFixed(2)}`} tone="neutral" />
                <StatCard icon={<IndianRupee className="h-5 w-5" />} label="Est. cost" value={boqLoading ? "..." : boq ? compactInr(boq.summary.grandTotal) : "?"} sub={boq ? `${boq.lines.length} items · incl. GST` : "estimate"} tone="brand" />
              </div>
              <ArchitectWorkflow data={data} />
            </div>
          )}

          {tab === "vastu" && (

            <div className="space-y-2">
              <RoomRow result={vastu.brahmasthan} highlight={selected} onSelect={setSelected} />
              {vastu.rooms.map((r, i) => (
                <RoomRow key={i} result={r} highlight={selected} onSelect={setSelected} />
              ))}
              <p className="pt-1 text-xs text-muted-foreground">{DISCLAIMERS.vastu}</p>
            </div>
          )}

          {tab === "code" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Ground coverage" value={`${code.metrics.groundCoveragePct.toFixed(1)}%`} cap={`â‰¤ ${code.metrics.maxGroundCoveragePct}%`} bad={code.metrics.groundCoveragePct > code.metrics.maxGroundCoveragePct} />
                <Metric label="FAR used" value={code.metrics.farUsed.toFixed(2)} cap={`â‰¤ ${code.metrics.farAllowed}`} bad={code.metrics.farUsed > code.metrics.farAllowed} />
                <Metric label="Footprint" value={`${code.metrics.footprintSqm.toFixed(0)} mÂ²`} cap={`plot ${code.metrics.plotAreaSqm.toFixed(0)} mÂ²`} />
                <Metric label="Built-up" value={`${code.metrics.builtUpSqm.toFixed(0)} mÂ²`} cap={`${data.plan.plot.floors} floor(s)`} />
              </div>
              <div className="divide-y rounded-xl border bg-card">
                {code.checks.map((c, i) => (
                  <div key={i} className="flex items-start gap-3 p-3">
                    <div className="mt-0.5">{STATUS_ICON[c.status]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{c.label}</span>
                        {(c.actual || c.required) && (
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {c.actual ?? "â€”"}{c.required ? ` / ${c.required}` : ""}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{c.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {code.state} Â· {DISCLAIMERS.code}
              </p>
            </div>
          )}

          
          {tab === "climate" && <ClimatePanel data={data.climate} />}
          {tab === "structure" && <StructurePanel data={data.structure} />}

          {tab === "cost" && (

            <div className="space-y-3">
              {boqLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Costing the geometryâ€¦
                </div>
              )}
              {!boqLoading && !boq && (
                <p className="text-sm text-muted-foreground">
                  A detailed estimate isnâ€™t available for this city yet. The plan, Vastu and code review above are ready.
                </p>
              )}
              {boq && (
                <>
                  <div className="overflow-hidden rounded-xl border bg-card">
                    {boq.byTrade.map((g) => (
                      <div key={g.key} className="flex items-center justify-between border-b px-4 py-2.5 text-sm last:border-0">
                        <span className="font-medium">{g.label}</span>
                        <span className="font-mono text-muted-foreground">{inr2(g.total)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-primary/5 px-4 py-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Grand total Â· incl. GST</div>
                      <div className="font-display text-2xl font-bold text-primary">{inr2(boq.summary.grandTotal)}</div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>Subtotal {inr2(boq.summary.subtotal)}</div>
                      <div>GST {inr2(boq.summary.gstTotal)}</div>
                    </div>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Ruler className="h-3 w-3" /> Generated from room geometry Â· {boq.finishTier} finish Â·{" "}
                    <button className="underline underline-offset-2" onClick={onOpenInEditor}>edit line items</button>
                  </p>
                </>
              )}
              <p className="text-xs text-muted-foreground">{DISCLAIMERS.export}</p>
            </div>
          )}

          {tab === "documents" && <Schedules plan={data.plan} code={data.code} />}
        </div>
      </div>
    </div>
  );
}

const REFINE_EXAMPLES = [
  "Make the master bedroom bigger",
  "Move the kitchen to the SE",
  "Add a study",
  "Make it two floors",
];

/** A single-line "tell the studio what to change" control that refines the selected scheme in place. */
function RefinePanel({
  onRefine,
  refining,
  editNote,
}: {
  onRefine: (instruction: string) => void;
  refining: boolean;
  editNote: { applied: string[]; unmatched: string[] } | null;
}) {
  const [value, setValue] = React.useState("");

  function submit() {
    const v = value.trim();
    if (!v || refining) return;
    onRefine(v);
    setValue("");
  }

  return (
    <section className="rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" />
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Refine this plan</div>
        {refining && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Refiningâ€¦
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          disabled={refining}
          placeholder="e.g. make the master bedroom bigger, move the kitchen to the SE, add a study, make it two floors"
          className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm shadow-soft outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
        />
        <Button size="sm" onClick={submit} disabled={refining || !value.trim()} className="shrink-0">
          {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Apply
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {REFINE_EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={refining}
            onClick={() => onRefine(ex)}
            className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-60"
          >
            {ex}
          </button>
        ))}
      </div>

      {editNote && (editNote.applied.length > 0 || editNote.unmatched.length > 0) && (
        <div className="mt-3 space-y-1.5 border-t pt-3">
          {editNote.applied.map((a, i) => (
            <div key={`a-${i}`} className="flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{a}</span>
            </div>
          ))}
          {editNote.unmatched.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Couldnâ€™t apply: {editNote.unmatched.join("; ")}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function scoreChip(v: number) {
  return v >= 80
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    : v >= 65
      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
}

function statusChip(s: Status) {
  return s === "pass"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
    : s === "warn"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
      : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
}

/** The generated schemes â€” tap a card to drive the drawings + checks below. */
function SchemeGallery({
  options,
  selected,
  onSelect,
}: {
  options: GeneratedOption[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  const [compareMode, setCompareMode] = React.useState(false);
  const [compareSelected, setCompareSelected] = React.useState<number>(selected === 0 ? 1 : 0);

  if (!options || options.length <= 1) return null;

  return (
    <section className="rounded-xl border bg-card p-4 shadow-soft space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Architect schemes
          </div>
          <h3 className="font-display text-lg font-bold tracking-tight">
            {options.length} distinct designs for this plot
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Compare Mode</span>
          <Switch checked={compareMode} onChange={setCompareMode} />
          <Badge variant="brand">Tap a card to load it below</Badge>
        </div>
      </div>
      
      {compareMode && (
        <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/10 p-4">
          {[selected, compareSelected].map((optIdx, i) => {
            const opt = options[optIdx];
            if (!opt) return null;
            const vs = Math.round(opt.vastu.score);
            return (
              <div key={i} className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-soft">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">Option {optIdx + 1}</div>
                  {i === 1 && (
                    <select 
                      className="text-xs border rounded p-1"
                      value={compareSelected}
                      onChange={(e) => setCompareSelected(Number(e.target.value))}
                    >
                      {options.map((_, idx) => (
                        <option key={idx} value={idx} disabled={idx === selected}>Option {idx + 1}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted/20">
                  <FloorPlanCad plan={opt.plan} className="h-full w-full" colorBy="zone" interactive={false} showZones={false} showOpenings={false} showFurniture={false} showDimensions={false} showGrid={false} showLabels={false} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Vastu Score: <span className={cn("font-bold", scoreColor(vs))}>{vs}/100</span></span>
                  <span className="font-medium text-muted-foreground">Built: {Math.round(opt.code.metrics.builtUpSqm * 10.7639)} sqft</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {options.map((opt, i) => {
          const isSel = i === selected;
          const multi = new Set(opt.plan.rooms.map((r) => r.floor ?? 0)).size > 1;
          const area = Math.round(opt.code.metrics.builtUpSqm * 10.7639);
          const vs = Math.round(opt.vastu.score);
          return (
            <button
              key={opt.variantId}
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={isSel}
              className={cn(
                "group flex flex-col overflow-hidden rounded-lg border bg-background text-left transition-all hover:shadow-soft",
                isSel ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/40",
              )}
            >
              <div className="relative aspect-[4/3] border-b bg-muted/20">
                <FloorPlanCad
                  plan={opt.plan}
                  floor={multi ? 0 : undefined}
                  colorBy="zone"
                  interactive={false}
                  showZones={false}
                  showOpenings={false}
                  showFurniture={false}
                  showDimensions={false}
                  showGrid={false}
                  showLabels={false}
                  className="h-full w-full"
                />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground shadow">
                    Recommended
                  </span>
                )}
                {isSel && (
                  <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                <h4 className="font-display text-[13px] font-bold leading-snug">{i + 1} Â· {opt.variantName}</h4>
                <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                  {opt.variantTagline}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-1 text-[10px]">
                  <span className={cn("rounded px-1.5 py-0.5 font-semibold", scoreChip(vs))}>
                    Vastu {vs}
                  </span>
                  <span className={cn("rounded px-1.5 py-0.5 font-medium", statusChip(opt.code.status))}>
                    {opt.code.status === "pass" ? "Code âœ“" : opt.code.status === "warn" ? "Code !" : "Code âœ•"}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {area.toLocaleString("en-IN")} ftÂ²
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ArchitectWorkflow({ data }: { data: GenerateResponse }) {
  const siteTypes = data.meta?.siteZoneTypes ?? [];
  const siteArea = data.meta?.siteOpenAreaSqm ?? 0;
  const plotUse = data.meta?.plotUsePct ?? data.code.metrics.groundCoveragePct;
  const docs = [
    "Concept sketch + bubble zoning",
    "2D CAD floor plan + DXF",
    "Interactive 3D massing",
    "MEP route and clash checklist",
    "Vastu + bylaw review",
    "BOQ + PDF proposal",
  ];
  const changes = [
    "Make parents room larger",
    "Add pooja / home office",
    "Move kitchen to SE",
    "Add balcony or car porch",
    "Reduce cost to standard finish",
  ];

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" />
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Land utilization</div>
        </div>
        <div className="mt-2 font-display text-2xl font-bold">{Math.round(plotUse)}% plot planned</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Open areas are now assigned as parking, sit-out, garden, balcony, shaft, or future expansion instead of blank leftover plot.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {siteTypes.length ? siteTypes.map((type) => (
            <Badge key={type} variant="outline">{type.replace(/_/g, " ")}</Badge>
          )) : <Badge variant="outline">site zones inferred</Badge>}
        </div>
        <div className="mt-3 text-xs text-muted-foreground">{siteArea.toFixed(1)} m2 of open/site program modelled.</div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Architect deliverables</div>
        </div>
        <div className="mt-3 grid gap-2">
          {docs.map((doc) => (
            <div key={doc} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{doc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Change-request loop</div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          When a client says what to change, the studio should regenerate options, recheck Vastu/code/MEP, and refresh BOQ.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {changes.map((change) => (
            <span key={change} className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
              {change}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function compactInr(n: number): string {
  if (n >= 1e7) return `â‚¹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `â‚¹${(n / 1e5).toFixed(2)} L`;
  return inr2(n);
}

const TONE: Record<string, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
  brand: "text-primary",
  neutral: "text-foreground",
};

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn("grid h-7 w-7 place-items-center", TONE[tone])}>{icon}</span>
      </div>
      <div className={cn("mt-1 font-display text-lg font-bold", TONE[tone])}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Metric({ label, value, cap, bad }: { label: string; value: string; cap?: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-display text-lg font-bold", bad ? "text-rose-600" : "text-foreground")}>{value}</div>
      {cap && <div className="text-[11px] text-muted-foreground">{cap}</div>}
    </div>
  );
}

function RoomRow({
  result,
  highlight,
  onSelect,
}: {
  result: { roomId?: string | null; roomLabel: string; zone: string; status: Status; message: string; suggestedZones: string[] };
  highlight?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const active = highlight && result.roomId === highlight;
  return (
    <button
      onClick={() => onSelect?.(result.roomId ?? null)}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50",
      )}
    >
      <div className="mt-0.5">{STATUS_ICON[result.status]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{result.roomLabel}</span>
          <Badge variant="outline" className="font-mono text-[10px]">{result.zone}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{result.message}</p>
      </div>
      {result.status !== "pass" && result.suggestedZones?.length > 0 && (
        <div className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">
          ideal:{" "}
          <span className="font-mono font-medium text-foreground">{result.suggestedZones.join(", ")}</span>
        </div>
      )}
    </button>
  );
}

