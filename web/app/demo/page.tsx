"use client";

import Link from "next/link";
import { Wizard } from "@/components/wizard/wizard";
import { SAMPLE_PLAN } from "@/lib/sample-plan";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="font-bold text-primary">
            GharPlan
          </Link>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            Demo mode — no sign-in, nothing saved
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Wizard initialPlan={SAMPLE_PLAN} canExport demo />
      </main>
    </div>
  );
}
