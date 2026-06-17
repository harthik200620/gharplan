"use client";

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { Wizard } from "@/components/wizard/wizard";
import { SAMPLE_PLAN } from "@/lib/sample-plan";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo href="/" />
          <Badge variant="accent" className="gap-1.5 py-1">
            <Sparkles className="h-3 w-3" />
            Demo mode — nothing saved
          </Badge>
        </div>
      </header>
      <main className="mx-auto max-w-6xl animate-fade-up px-4 py-8 sm:px-6">
        <Wizard initialPlan={SAMPLE_PLAN} canExport demo />
      </main>
    </div>
  );
}
