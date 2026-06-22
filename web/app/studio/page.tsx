import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Studio } from "@/components/studio/studio";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Architect Studio",
  description:
    "Generate five Indian residential design directions with Vastu, code, CAD, 3D, MEP coordination prompts, and BOQ.",
};

export default function StudioPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight">Architect Studio</h1>
          <Badge variant="brand">Beta</Badge>
          <Badge variant="accent" className="hidden sm:inline-flex">
            5 design options
          </Badge>
          <Badge variant="outline" className="hidden sm:inline-flex">
            CAD + 3D + BOQ
          </Badge>
        </div>
        <Studio />
      </main>
    </div>
  );
}
