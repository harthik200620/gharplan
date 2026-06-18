import { Leaf, Sun, Umbrella, Wind, Snowflake, CloudRain, SunMedium } from "lucide-react";
import type { ClimateReport } from "@gharplan/shared";
import { cn } from "@/lib/utils";

export function ClimatePanel({ data }: { data?: ClimateReport }) {
  if (!data) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
        Loading climate analysis...
      </div>
    );
  }

  const icons: Record<string, React.ReactNode> = {
    Hot: <Sun className="h-5 w-5 text-amber-500" />,
    Humid: <Umbrella className="h-5 w-5 text-blue-500" />,
    Cold: <Snowflake className="h-5 w-5 text-sky-300" />,
    Temperate: <Leaf className="h-5 w-5 text-emerald-500" />,
    Composite: <SunMedium className="h-5 w-5 text-orange-400" />,
  };
  const Icon = icons[data.zoneName] || <Wind className="h-5 w-5 text-primary" />;

  const windAngle = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315,
  }[data.windDirection] ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-soft">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10">
            {Icon}
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Climate Zone</div>
            <div className="text-lg font-bold">{data.zoneName}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-soft">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
            <span className="text-xl font-bold">{data.orientationScore}</span>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Orientation Quality</div>
            <div className="text-sm font-medium">Optimal solar &amp; wind alignment</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <h4 className="text-sm font-bold tracking-tight">Passive Design Strategies</h4>
          <ul className="mt-3 space-y-2">
            {data.passiveStrategies.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                {s}
              </li>
            ))}
          </ul>
        </div>
        
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <h4 className="text-sm font-bold tracking-tight">Environmental Exposures</h4>
          <div className="mt-4 flex gap-6">
            <div className="flex flex-col items-center">
              <div className="relative grid h-20 w-20 place-items-center rounded-full border-2 border-dashed border-primary/20">
                <Wind className="absolute top-2 left-2 h-4 w-4 text-muted-foreground/50" />
                <div 
                  className="h-10 w-1 bg-primary transition-transform duration-500 origin-bottom"
                  style={{ transform: `rotate(${windAngle}deg) translateY(-50%)` }}
                />
              </div>
              <span className="mt-2 text-xs font-medium text-muted-foreground">Wind: {data.windDirection}</span>
            </div>
            
            <div className="flex-1 space-y-2">
              {(["N", "S", "E", "W"] as const).map(dir => (
                <div key={dir} className="flex items-center gap-2 text-xs">
                  <span className="w-4 font-medium">{dir}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div 
                      className={cn("h-full rounded-full", data.solarRisk[dir] > 70 ? "bg-rose-500" : data.solarRisk[dir] > 40 ? "bg-amber-500" : "bg-emerald-500")}
                      style={{ width: `${data.solarRisk[dir]}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-muted-foreground">{data.solarRisk[dir]}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
