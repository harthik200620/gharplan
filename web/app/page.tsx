import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Compass, FileText, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export default async function Landing() {
  if (hasSupabaseEnv()) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex items-center justify-between">
        <div className="text-xl font-bold text-primary">GharPlan</div>
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <section className="mt-20 max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-5xl">
          Plan → Vastu → Code → Costed BOQ → Proposal.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          The design-to-cost copilot for Indian interior designers and design-build studios.
          Draw rooms, get an instant Vastu &amp; building-code review, and a GST&apos;d Bill of
          Quantities generated <strong>directly from the geometry</strong> — then export a
          branded client proposal and a DXF.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/demo">
              Try the live demo <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <section className="mt-20 grid gap-6 sm:grid-cols-3">
        {[
          { icon: Compass, title: "Vastu-aware", body: "Per-room zone check with a weighted 0–100 score and prioritized fixes." },
          { icon: Ruler, title: "Code review", body: "Setbacks, FAR, coverage, min areas & ventilation for KA / MH / TG." },
          { icon: FileText, title: "BOQ from geometry", body: "Itemized, GST-split, editable — and a client-ready PDF + Excel + DXF." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-lg border bg-card p-6">
            <Icon className="h-6 w-6 text-accent" />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-24 border-t pt-6 text-xs text-muted-foreground">
        Generated outputs are indicative only — not approved/stamped drawings. Vastu output is
        guidance, not certification; code review is preliminary.
      </footer>
    </main>
  );
}
