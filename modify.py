import re

with open(r'C:\Users\HP\.gemini\antigravity\brain\3f1cc649-ec12-4185-9080-7db1e6e059ff\scratch\result-panel.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

imports_to_add = '''
import { ClimatePanel } from "./climate-panel";
import { StructurePanel } from "./structure-panel";
import { Switch } from "@/components/ui/switch";
'''
content = content.replace('import { cn, inr2 } from "@/lib/utils";', 'import { cn, inr2 } from "@/lib/utils";\n' + imports_to_add)

content = content.replace('const [tab, setTab] = React.useState<"vastu" | "code" | "estimate" | "documents">("vastu");',
                          'const [tab, setTab] = React.useState<"overview" | "vastu" | "code" | "climate" | "structure" | "cost" | "documents">("overview");')

score_dashboard = '''
      {/* SCORE DASHBOARD */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", vastu.score >= 70 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" : vastu.score >= 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300")}>
          Vastu Score: {Math.round(vastu.score)}/100 {vastu.score >= 70 ? "●●●●○" : "●●●○○"}
        </div>
        <div className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", code.status === "pass" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" : code.status === "warn" ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" : "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300")}>
          Code: {code.status === "pass" ? "Pass ✓" : code.status === "warn" ? "Warn !" : "Fail ✗"}
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
'''
content = content.replace('<p className="text-sm text-muted-foreground">{subtitle}</p>\n        </div>', '<p className="text-sm text-muted-foreground">{subtitle}</p>\n        </div>\n' + score_dashboard)

rationale = '''
      {data.meta?.narrative && (
        <details className="group rounded-xl border bg-card p-4 shadow-soft [&_summary::-webkit-details-marker]:hidden" open>
          <summary className="flex cursor-pointer items-center justify-between font-bold text-sm tracking-tight text-foreground">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> WHY THIS DESIGN WORKS</span>
            <span className="transition group-open:rotate-180">▼</span>
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
'''

content = content.replace('      {/* tabs */}', rationale + '\n      {/* tabs */}')

content = content.replace('{/* stat strip */}', '{/* stat strip (now in overview tab) */}')

tabs_old = '''          {([
            ["vastu", "Vastu"],
            ["code", "Building code"],
            ["estimate", "Bill of Quantities"],
            ["documents", "Working drawings"],
          ] as const).map(([k, label]) => ('''
tabs_new = '''          {([
            ["overview", "Overview"],
            ["vastu", "Vastu"],
            ["code", "Code"],
            ["climate", "Climate"],
            ["structure", "Structure"],
            ["cost", "Cost"],
            ["documents", "Documents"],
          ] as const).map(([k, label]) => ('''
content = content.replace(tabs_old, tabs_new)

content = content.replace('{tab === "estimate" && (', '{tab === "cost" && (')

overview_content = '''
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard icon={<div className="scale-[0.55]"><ScoreGauge score={vastu.score} size={64} stroke={7} /></div>} label="Vastu score" value={vastu.grade} sub={${vastu.summary.passCount}✓ ! ✗} tone={vastu.score >= 70 ? "ok" : vastu.score >= 50 ? "warn" : "bad"} />
                <StatCard icon={code.status === "fail" ? <XCircle className="h-5 w-5" /> : code.status === "warn" ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />} label="Code review" value={code.status === "pass" ? "Clear" : code.status === "warn" ? "Advisories" : "Issues"} sub={${code.summary.failCount} fail ·  warn} tone={code.status === "fail" ? "bad" : code.status === "warn" ? "warn" : "ok"} />
                <StatCard icon={<Layers className="h-5 w-5" />} label="Plot use" value={${code.metrics.builtUpSqm.toFixed(0)} m²} sub={${code.metrics.groundCoveragePct.toFixed(0)}% cover · FAR } tone="neutral" />
                <StatCard icon={<IndianRupee className="h-5 w-5" />} label="Est. cost" value={boqLoading ? "..." : boq ? compactInr(boq.summary.grandTotal) : "?"} sub={boq ? ${boq.lines.length} items · incl. GST : "estimate"} tone="brand" />
              </div>
              <ArchitectWorkflow data={data} />
            </div>
          )}
'''

climate_structure_content = '''
          {tab === "climate" && <ClimatePanel data={data.climate} />}
          {tab === "structure" && <StructurePanel data={data.structure} />}
'''

content = content.replace('{tab === "vastu" && (', overview_content + '\n          {tab === "vastu" && (\n')
content = content.replace('{tab === "cost" && (', climate_structure_content + '\n          {tab === "cost" && (\n')

stat_strip_regex = re.compile(r'\{\/\* stat strip \(now in overview tab\) \*\/\}.*?\<ArchitectWorkflow data=\{data\} \/\>', re.DOTALL)
content = stat_strip_regex.sub('', content)

gallery_old = '''function SchemeGallery({
  options,
  selected,
  onSelect,
}: {
  options: GeneratedOption[];
  selected: number;
  onSelect: (i: number) => void;
}) {
  if (!options || options.length <= 1) return null;
  return (
    <section className="rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Architect schemes
          </div>
          <h3 className="font-display text-lg font-bold tracking-tight">
            {options.length} distinct designs for this plot
          </h3>
        </div>
        <Badge variant="brand">Tap a card to load it below</Badge>
      </div>'''

gallery_new = '''function SchemeGallery({
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
'''
content = content.replace(gallery_old, gallery_new)

content = content.replace('<h4 className="font-display text-[13px] font-bold leading-snug">{opt.variantName}</h4>', '<h4 className="font-display text-[13px] font-bold leading-snug">{i + 1} · {opt.variantName}</h4>')

with open(r'C:\Users\HP\.gemini\antigravity\brain\3f1cc649-ec12-4185-9080-7db1e6e059ff\scratch\result-panel.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
