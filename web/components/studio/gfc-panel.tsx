"use client";

import * as React from "react";
import {
  CheckCircle2,
  Download,
  FileCheck,
  Grid,
  Layers,
  Zap,
  Droplets,
  Box,
  Ruler,
  Maximize,
  Compass,
} from "lucide-react";
import type { Plan } from "@gharplan/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function GfcPanel({
  plan,
  onExport,
  exporting,
}: {
  plan: Plan;
  onExport: (type: "pdf" | "dxf" | "xlsx" | "ifc") => void;
  exporting: string | null;
}) {
  const gfcPackages = [
    {
      id: "gfc-arch-grid",
      code: "GFC-01",
      name: "Setting-Out & Column Grid Plan",
      category: "Structural",
      icon: <Grid className="h-5 w-5 text-indigo-500" />,
      description: "Centerline grid axes (A-F, 1-8) with exact column center-to-center distances for site excavation.",
      layers: ["GRID_AXES", "COLUMNS", "EXCAVATION_BOUNDS"],
      status: "Ready",
    },
    {
      id: "gfc-arch-foundation",
      code: "GFC-02",
      name: "Footing & Excavation Layout",
      category: "Structural",
      icon: <Box className="h-5 w-5 text-amber-500" />,
      description: "Isolated footing sizes, 100mm PCC bed specifications, and bottom rebar mat details.",
      layers: ["FOOTINGS", "PCC_BED", "REBAR_MAT"],
      status: "Ready",
    },
    {
      id: "gfc-arch-masonry",
      code: "GFC-03",
      name: "Brickwork & Lintel Setting-Out Plan",
      category: "Architectural",
      icon: <Ruler className="h-5 w-5 text-emerald-500" />,
      description: "Outer 230mm wall and 115mm inner partition wall dimensions, door/window openings, and lintel beam heights.",
      layers: ["WALL_OUTER", "WALL_INNER", "OPENINGS", "LINTELS"],
      status: "Ready",
    },
    {
      id: "gfc-arch-slab",
      code: "GFC-04",
      name: "Roof Slab & Beam Framing Layout",
      category: "Structural",
      icon: <Layers className="h-5 w-5 text-blue-500" />,
      description: "125mm two-way slab thickness, beam sizes, top/bottom main bar details, and stair landings.",
      layers: ["SLAB_OUTLINE", "BEAMS", "CRANK_BARS"],
      status: "Ready",
    },
    {
      id: "gfc-elec-conduit",
      code: "GFC-05",
      name: "Electrical Slab Conduiting & DB Schematic",
      category: "MEP Services",
      icon: <Zap className="h-5 w-5 text-yellow-500" />,
      description: "PVC conduit pipe routing, 6A light/fan points, 16A power sockets, DB board & earthing pit detail.",
      layers: ["ELEC_CONDUIT", "SWITCHBOARDS", "DB_ROUTING"],
      status: "Ready",
    },
    {
      id: "gfc-mep-plumbing",
      code: "GFC-06",
      name: "Plumbing Supply & Sanitary Drainage Plan",
      category: "MEP Services",
      icon: <Droplets className="h-5 w-5 text-cyan-500" />,
      description: "110mm SWR 1:40 slope drainage lines, CPVC hot/cold water riser lines, inspection chambers, and RWH pit.",
      layers: ["DRAINAGE_SWR", "WATER_CPVC", "INSPECTION_PITS"],
      status: "Ready",
    },
    {
      id: "gfc-joinery",
      code: "GFC-07",
      name: "Door & Window Joinery Schedule",
      category: "Specifications",
      icon: <Maximize className="h-5 w-5 text-purple-500" />,
      description: "Frame profiles (UPVC/Teak), glass thickness (6mm toughened), hardware accessories & sill heights.",
      layers: ["JOINERY_SCHEDULE", "HARDWARE_SPECS"],
      status: "Ready",
    },
    {
      id: "gfc-rcp",
      code: "GFC-08",
      name: "Reflected Ceiling & Lighting Plan (RCP)",
      category: "Interiors",
      icon: <Compass className="h-5 w-5 text-rose-500" />,
      description: "Gypsum false ceiling drop levels, COB spotlight layouts, ambient LED cove lighting, and AC copper ducts.",
      layers: ["FALSE_CEILING", "LIGHT_COVES", "AC_DUCTING"],
      status: "Ready",
    },
  ];

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-bold">Good-For-Construction (GFC) Drawing Suite</h3>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              100/100 Execution Ready
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Complete set of 8 site-ready architectural, structural, and MEP working drawings formatted for contractor execution
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onExport("pdf")}>
            <Download className="mr-1.5 h-4 w-4" /> Download PDF Bundle
          </Button>
          <Button variant="accent" size="sm" onClick={() => onExport("dxf")}>
            <FileCheck className="mr-1.5 h-4 w-4" /> Download AutoCAD DXF
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {gfcPackages.map((pkg) => (
          <div key={pkg.id} className="flex flex-col justify-between rounded-xl border bg-muted/20 p-4 transition-all hover:bg-muted/40">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg border bg-background shadow-xs">
                    {pkg.icon}
                  </div>
                  <div>
                    <span className="font-mono text-[10px] font-bold text-muted-foreground">{pkg.code}</span>
                    <h4 className="font-semibold text-sm leading-tight">{pkg.name}</h4>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {pkg.category}
                </Badge>
              </div>

              <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">{pkg.description}</p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
              <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                <Layers className="h-3 w-3" /> {pkg.layers.join(" · ")}
              </div>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> {pkg.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
