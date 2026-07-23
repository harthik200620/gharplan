"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
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
import { StructurePanel } from "@/components/studio/structure-panel";
import { MepPlan } from "@/components/cad/mep-plan";

// Sheets marked "structure" / "mep" are backed by a real per-plan computation
// (the structural design service, the MEP model) and render an actual on-screen
// drawing below the card. Sheets with no `view` have no generator behind them yet
// -- they describe planned content, not something this plan has actually produced,
// so they're labelled accordingly rather than claimed as "Ready".
const GFC_PACKAGES = [
  {
    id: "gfc-arch-grid",
    code: "GFC-01",
    name: "Setting-Out & Column Grid Plan",
    category: "Structural",
    icon: <Grid className="h-5 w-5 text-indigo-500" />,
    description: "Centerline grid axes with exact column center-to-center distances for site excavation.",
    view: "structure" as const,
  },
  {
    id: "gfc-arch-foundation",
    code: "GFC-02",
    name: "Footing & Excavation Layout",
    category: "Structural",
    icon: <Box className="h-5 w-5 text-amber-500" />,
    description: "Isolated footing sizes and design forces from the structural design service.",
    view: "structure" as const,
  },
  {
    id: "gfc-arch-masonry",
    code: "GFC-03",
    name: "Brickwork & Lintel Setting-Out Plan",
    category: "Architectural",
    icon: <Ruler className="h-5 w-5 text-emerald-500" />,
    description: "Outer and inner wall dimensions, door/window openings, and lintel beam heights.",
    view: null,
  },
  {
    id: "gfc-arch-slab",
    code: "GFC-04",
    name: "Roof Slab & Beam Framing Layout",
    category: "Structural",
    icon: <Layers className="h-5 w-5 text-blue-500" />,
    description: "Slab thickness, beam sizes, and member design forces from the structural design service.",
    view: "structure" as const,
  },
  {
    id: "gfc-elec-conduit",
    code: "GFC-05",
    name: "Electrical Slab Conduiting & DB Schematic",
    category: "MEP Services",
    icon: <Zap className="h-5 w-5 text-yellow-500" />,
    description: "Conduit routing, light/fan/socket points, and DB board detail from the MEP model.",
    view: "mep" as const,
  },
  {
    id: "gfc-mep-plumbing",
    code: "GFC-06",
    name: "Plumbing Supply & Sanitary Drainage Plan",
    category: "MEP Services",
    icon: <Droplets className="h-5 w-5 text-cyan-500" />,
    description: "Drainage and supply routing, fixtures, and inspection points from the MEP model.",
    view: "mep" as const,
  },
  {
    id: "gfc-joinery",
    code: "GFC-07",
    name: "Door & Window Joinery Schedule",
    category: "Specifications",
    icon: <Maximize className="h-5 w-5 text-purple-500" />,
    description: "Frame profiles, glass thickness, hardware accessories & sill heights.",
    view: null,
  },
  {
    id: "gfc-rcp",
    code: "GFC-08",
    name: "Reflected Ceiling & Lighting Plan (RCP)",
    category: "Interiors",
    icon: <Compass className="h-5 w-5 text-rose-500" />,
    description: "False ceiling drop levels, spotlight layout, and cove lighting.",
    view: null,
  },
];

export function GfcPanel({
  plan,
  onExport,
  exporting,
}: {
  plan: Plan;
  onExport: (type: "pdf" | "dxf" | "xlsx" | "ifc") => void;
  exporting: string | null;
}) {
  const gfcPackages = GFC_PACKAGES;
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const generatedCount = gfcPackages.filter((p) => p.view).length;

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-bold">Good-For-Construction (GFC) Drawing Suite</h3>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              {generatedCount}/{gfcPackages.length} sheets generated for this plan
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Architectural, structural, and MEP working references for contractor execution. Sheets marked{" "}
            <span className="font-semibold text-foreground">Generated</span> below are computed live from this plan and viewable
            on screen; the rest describe planned content not yet produced.
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
        {gfcPackages.map((pkg) => {
          const isOpen = expanded === pkg.id;
          return (
            <div
              key={pkg.id}
              className={`flex flex-col justify-between rounded-xl border bg-muted/20 p-4 transition-all hover:bg-muted/40 ${pkg.view ? "sm:col-span-2" : ""}`}
            >
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
                {pkg.view ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Generated
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Not yet generated
                  </span>
                )}
                {pkg.view && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setExpanded(isOpen ? null : pkg.id)}
                  >
                    {isOpen ? "Hide drawing" : "View on screen"}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </Button>
                )}
              </div>

              {isOpen && pkg.view === "structure" && (
                <div className="mt-3 border-t pt-3">
                  <StructurePanel plan={plan} />
                </div>
              )}
              {isOpen && pkg.view === "mep" && (
                <div className="mt-3 border-t pt-3">
                  <MepPlan plan={plan} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
