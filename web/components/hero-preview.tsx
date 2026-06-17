"use client";

import type { Plan } from "@gharplan/shared";
import { FloorPlanCad } from "@/components/cad/floor-plan-cad";
import { ScoreGauge } from "@/components/score-gauge";

// A small, pre-normalized plan (area/zone/centroid filled) so the marketing hero
// shows the *real* CAD renderer, not a mockup.
function room(
  id: string,
  type: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  zone: string,
) {
  const w = x1 - x0;
  const h = y1 - y0;
  return {
    id,
    type,
    polygon: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
    areaSqm: +(w * h).toFixed(2),
    perimeterM: +(2 * (w + h)).toFixed(2),
    centroid: [+(x0 + w / 2).toFixed(2), +(y0 + h / 2).toFixed(2)],
    zone,
    ceilingHeightM: 3,
  };
}

const HERO_PLAN = {
  schemaVersion: "1.0",
  project: { id: "hero", name: "Hero", createdAt: "2025-01-01" },
  plot: { widthM: 9.2, depthM: 11.0, areaSqm: 101.2, facing: "E", state: "KA", city: "Bengaluru", floors: 1 },
  rooms: [
    room("master", "master_bedroom", 0.3, 0.3, 3.2, 3.6, "SW"),
    room("toilet", "toilet", 0.3, 3.6, 2.2, 5.6, "W"),
    room("kids", "childrens_bedroom", 0.3, 7.0, 3.2, 10.7, "NW"),
    room("kitchen", "kitchen", 6.2, 0.3, 8.9, 3.2, "SE"),
    room("living", "living", 3.2, 3.2, 8.9, 8.0, "E"),
    room("pooja", "pooja", 6.2, 8.0, 8.9, 10.7, "NE"),
  ],
  doors: [
    { id: "d1", roomId: "master", kind: "door", widthM: 0.9, heightM: 2.1, count: 1 },
    { id: "d2", roomId: "kitchen", kind: "door", widthM: 0.9, heightM: 2.1, count: 1 },
    { id: "d3", roomId: "living", kind: "door", widthM: 1.5, heightM: 2.1, count: 1 },
    { id: "d4", roomId: "kids", kind: "door", widthM: 0.9, heightM: 2.1, count: 1 },
    { id: "d5", roomId: "pooja", kind: "door", widthM: 0.8, heightM: 2.0, count: 1 },
  ],
  windows: [
    { id: "w1", roomId: "master", kind: "window", widthM: 1.5, heightM: 1.2, count: 1 },
    { id: "w2", roomId: "kids", kind: "window", widthM: 1.5, heightM: 1.2, count: 1 },
    { id: "w3", roomId: "living", kind: "window", widthM: 1.8, heightM: 1.2, count: 1 },
    { id: "w4", roomId: "pooja", kind: "window", widthM: 0.6, heightM: 0.9, count: 1 },
  ],
} as unknown as Plan;

export function HeroPreview() {
  return (
    <div className="relative">
      <div className="card-premium overflow-hidden p-2">
        <FloorPlanCad
          plan={HERO_PLAN}
          interactive={false}
          showDimensions={false}
          className="h-[360px] sm:h-[420px]"
        />
      </div>

      {/* floating Vastu chip */}
      <div className="absolute -left-3 -top-3 flex items-center gap-2 rounded-xl border bg-card/95 p-2 pr-3 shadow-premium backdrop-blur animate-float">
        <ScoreGauge score={100} size={46} stroke={5} />
        <div className="leading-tight">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Vastu</div>
          <div className="text-sm font-bold text-emerald-600">Excellent</div>
        </div>
      </div>

      {/* floating cost chip */}
      <div
        className="absolute -bottom-3 -right-3 rounded-xl border bg-card/95 px-3 py-2 shadow-premium backdrop-blur animate-float"
        style={{ animationDelay: "1.2s" }}
      >
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Est. cost · incl. GST</div>
        <div className="font-display text-lg font-bold text-primary">₹18.42 L</div>
      </div>
    </div>
  );
}
