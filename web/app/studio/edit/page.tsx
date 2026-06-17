"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Wizard } from "@/components/wizard/wizard";
import { useWizard } from "@/lib/store";

export default function StudioEditPage() {
  const plan = useWizard((s) => s.plan);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Link
          href="/studio"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Studio
        </Link>
        <Wizard initialPlan={plan} canExport demo />
      </main>
    </div>
  );
}
