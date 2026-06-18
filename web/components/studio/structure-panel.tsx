import { Hammer, Grid3X3, Layers } from "lucide-react";
import type { StructureReport } from "@gharplan/shared";

export function StructurePanel({ data }: { data?: StructureReport }) {
  if (!data) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Loading structural recommendations...
      </div>
    );
  }

  // Calculate bounding box for columns to draw them nicely
  let minX = 0, minY = 0, maxX = 10, maxY = 10;
  if (data.columns && data.columns.length > 0) {
    minX = Math.min(...data.columns.map(c => c.x));
    maxX = Math.max(...data.columns.map(c => c.x));
    minY = Math.min(...data.columns.map(c => c.y));
    maxY = Math.max(...data.columns.map(c => c.y));
  }
  const w = maxX - minX || 10;
  const h = maxY - minY || 10;
  const pad = Math.max(w, h) * 0.1 || 1;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-start gap-4 rounded-xl border bg-card p-4 shadow-soft">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-600">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Foundation Type</div>
            <div className="mt-1 text-lg font-bold leading-tight">{data.foundationType}</div>
            <p className="mt-2 text-sm text-muted-foreground">{data.foundationReason}</p>
          </div>
        </div>

        <div className="flex items-start gap-4 rounded-xl border bg-card p-4 shadow-soft">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-500/10 text-slate-600">
            <Grid3X3 className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Structural System</div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{data.structuralNote}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <h4 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <Grid3X3 className="h-4 w-4 text-primary" /> Column Layout
          </h4>
          <div className="mt-4 flex justify-center border border-dashed rounded-lg bg-muted/20 p-4">
            <svg viewBox={`${minX - pad} ${minY - pad} ${w + pad*2} ${h + pad*2}`} className="h-48 w-full max-w-[200px] overflow-visible text-slate-800 dark:text-slate-200">
              {data.columns && data.columns.map((c, i) => (
                <rect key={i} x={c.x - 0.2} y={c.y - 0.2} width="0.4" height="0.4" className="fill-current" />
              ))}
              {/* Draw faint grid lines */}
              {data.columns && data.columns.map((c, i) => (
                <g key={`grid-${i}`}>
                  <line x1={c.x} y1={minY - pad/2} x2={c.x} y2={maxY + pad/2} stroke="currentColor" strokeWidth="0.02" strokeOpacity="0.2" strokeDasharray="0.1 0.1" />
                  <line x1={minX - pad/2} y1={c.y} x2={maxX + pad/2} y2={c.y} stroke="currentColor" strokeWidth="0.02" strokeOpacity="0.2" strokeDasharray="0.1 0.1" />
                </g>
              ))}
            </svg>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <h4 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <Hammer className="h-4 w-4 text-primary" /> Sizing Schedule
          </h4>
          <div className="mt-4 divide-y rounded-lg border">
            <div className="grid grid-cols-2 bg-muted/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Member</span>
              <span>Typical Size</span>
            </div>
            {data.beams && data.beams.map((b, i) => (
              <div key={i} className="grid grid-cols-2 px-3 py-2 text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="text-muted-foreground">{b.size}</span>
              </div>
            ))}
            {(!data.beams || data.beams.length === 0) && (
              <div className="p-4 text-center text-xs text-muted-foreground">No sizing data</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
