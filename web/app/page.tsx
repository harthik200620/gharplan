import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Box,
  Building2,
  ClipboardCheck,
  Compass,
  Download,
  FileText,
  IndianRupee,
  Layers,
  MapPinned,
  PenTool,
  Ruler,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Wand2,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroPreview } from "@/components/hero-preview";
import { Logo } from "@/components/logo";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const CAPABILITIES = [
  {
    icon: Wand2,
    title: "5 best design schemes",
    body: "Every brief becomes five ranked options: Vastu-first, climate-first, compact-budget, premium courtyard, and BIM-ready build.",
  },
  {
    icon: Compass,
    title: "Indian family planning",
    body: "Pooja, utility, parents room, rental floor, parking, sit-out, kitchen workflow, privacy gradients, and future expansion.",
  },
  {
    icon: ShieldCheck,
    title: "Vastu + code checks",
    body: "Room zoning, Brahmasthan, setbacks, FAR, coverage, ventilation, room minimums, stairs, and fix-first advisories.",
  },
  {
    icon: Blocks,
    title: "BIM and MEP logic",
    body: "Models the architect workflow from concept to CAD, 3D, structure, plumbing, electrical, HVAC, clashes, and handover.",
  },
  {
    icon: IndianRupee,
    title: "BOQ from geometry",
    body: "Costs are generated from the plan itself with trade-wise totals, GST splits, finish tiers, and exportable Excel.",
  },
  {
    icon: Download,
    title: "Office-ready outputs",
    body: "Client proposal PDF, DXF for AutoCAD, Excel BOQ, Vastu report, code review, and editor handoff.",
  },
];

const WORKFLOW = [
  {
    step: "01",
    icon: MapPinned,
    title: "Site and family brief",
    body: "Plot, facing, city, family structure, rituals, budget, parking, light, privacy, rental needs, and future floors.",
    output: "Client brief + site intelligence",
  },
  {
    step: "02",
    icon: PenTool,
    title: "Concept and bubble planning",
    body: "Generates five spatial strategies before locking a plan, so the client sees real architectural choices.",
    output: "5 concept options",
  },
  {
    step: "03",
    icon: Ruler,
    title: "2D drafting",
    body: "Creates a dimensioned CAD-style plan with rooms, labels, zones, openings, and floor selection.",
    output: "Plan + DXF",
  },
  {
    step: "04",
    icon: Box,
    title: "3D and material direction",
    body: "Turns the same geometry into a massing view and recommends climate-aware Indian material language.",
    output: "3D view + design narrative",
  },
  {
    step: "05",
    icon: Layers,
    title: "MEP, structure and clash thinking",
    body: "Surfaces coordination risks such as wet-wall stacking, ducts, shafts, services, beams, columns, and constructability.",
    output: "Coordination checklist",
  },
  {
    step: "06",
    icon: FileText,
    title: "Documentation and cost",
    body: "Packages Vastu, code, BOQ, export files, and proposal logic so a studio can move from sketch to client review.",
    output: "PDF + BOQ + review set",
  },
];

const SOFTWARE_STACK = [
  {
    name: "Revit",
    role: "Primary BIM brain",
    fit: "Architecture, structure, MEP, schedules, sections, sheets, revisions, and multi-disciplinary coordination.",
  },
  {
    name: "AutoCAD / DXF",
    role: "Indian drafting bridge",
    fit: "Still essential for consultants, municipal drawing workflows, detail drafting, and vendor handoffs.",
  },
  {
    name: "SketchUp",
    role: "Fast residential massing",
    fit: "Best for quick form exploration, interior volume studies, and client-friendly 3D communication.",
  },
  {
    name: "Navisworks",
    role: "Clash and coordination",
    fit: "Federates architecture, structure, and MEP models to catch collisions before site work begins.",
  },
  {
    name: "Enscape / Twinmotion",
    role: "Live review renders",
    fit: "Fast walkthroughs, daylight checks, material mood, and client review meetings.",
  },
  {
    name: "V-Ray / Lumion",
    role: "Final visual polish",
    fit: "Photorealistic renders, hero images, exterior atmosphere, interiors, landscaping, and marketing boards.",
  },
];

const INDIAN_DESIGN_RULES = [
  {
    icon: SunMedium,
    title: "Heat and sun first",
    body: "Orient openings, shade harsh faces, use verandahs or screens, and reduce direct solar gain before adding AC.",
  },
  {
    icon: Wind,
    title: "Cross-ventilation",
    body: "Prefer two-sided airflow, high exhaust openings, shaded courts, and breathable transition spaces.",
  },
  {
    icon: Building2,
    title: "Courtyard intelligence",
    body: "Use compact courts, skylit pockets, or double-height voids where plot size allows light, privacy, and cooling.",
  },
  {
    icon: BadgeCheck,
    title: "Culture and routine",
    body: "Respect pooja placement, kitchen rituals, elder access, storage, washing areas, guest flow, and privacy.",
  },
  {
    icon: ClipboardCheck,
    title: "Buildability",
    body: "Keep wet areas stackable, grids sensible, furniture realistic, openings practical, and costs transparent.",
  },
];

export default async function Landing() {
  if (hasSupabaseEnv()) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="relative overflow-hidden border-b bg-aurora">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:py-14">
          <div className="animate-in-up">
            <Badge variant="brand" className="mb-5 gap-1.5 py-1 pl-1.5 pr-3">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-3 w-3" />
              </span>
              Architect OS for Indian homes
            </Badge>
            <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Five serious home designs from one Indian family brief.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              GharPlan turns plot inputs into architect-style options, Vastu and bylaw checks, CAD, 3D,
              MEP coordination prompts, BOQ, and export files for Indian residential studios.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="brand" size="xl">
                <Link href="/studio">
                  Start the Architect Studio <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl">
                <Link href="/demo">Open manual editor</Link>
              </Button>
            </div>
            <div className="mt-7 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
              {["5 options", "Vastu", "CAD + 3D", "BOQ"].map((item) => (
                <div key={item} className="rounded-lg border bg-card/80 px-3 py-2 shadow-soft backdrop-blur">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Included</div>
                  <div className="mt-0.5 font-display text-base font-bold">{item}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="animate-in-up delay-2">
            <HeroPreview />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">What the website now promises</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            The whole residential office workflow, not just a plan generator.
          </h2>
          <p className="mt-3 text-muted-foreground">
            The product surface mirrors how strong Indian practices work: sketch options first, then CAD,
            BIM, MEP coordination, visualization, documentation, and cost.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-premium">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Automated architect workflow</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
                From concept sketch to construction package.
              </h2>
              <p className="mt-3 text-muted-foreground">
                The app is positioned as the front office for a modern Indian architect: it collects the
                brief, produces alternatives, checks the design, and hands off files to the tools a real
                practice already uses.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {WORKFLOW.map(({ step, icon: Icon, title, body, output }) => (
                <div key={step} className="rounded-lg border bg-card p-4 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-display text-2xl font-extrabold text-primary/25">{step}</span>
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-2 font-display text-base font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
                  <div className="mt-3 rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground">
                    Output: {output}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Indian residential intelligence</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
              Design rules borrowed from good Indian homes.
            </h2>
            <div className="mt-8 grid gap-3">
              {INDIAN_DESIGN_RULES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4 rounded-lg border bg-card p-4 shadow-soft">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent-foreground">
                    <Icon className="h-5 w-5 text-accent" />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Blocks className="h-5 w-5 text-primary" />
              <h3 className="font-display text-xl font-bold">Best software stack to integrate</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              These are not silently installable inside a web app; they are licensed professional tools.
              GharPlan should generate the data, checks, and files that fit this workflow.
            </p>
            <div className="mt-5 grid gap-3">
              {SOFTWARE_STACK.map((tool) => (
                <div key={tool.name} className="rounded-lg border bg-background p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-base font-bold">{tool.name}</span>
                    <span className="text-xs font-medium text-primary">{tool.role}</span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{tool.fit}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <div className="overflow-hidden rounded-lg border bg-sidebar px-6 py-10 text-sidebar-foreground shadow-premium sm:px-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                Open the studio and generate the first 5 schemes.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-sidebar-foreground/80">
                The demo is ready without sign-in. Generate a plan, compare the five design options,
                review Vastu/code/BOQ, switch CAD and 3D views, then export the deliverables.
              </p>
            </div>
            <Button asChild variant="accent" size="xl">
              <Link href="/studio">
                <Sparkles className="h-4 w-4" /> Open Architect Studio
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <Logo />
            <p className="text-xs text-muted-foreground">
              (c) {new Date().getFullYear()} GharPlan - built for Indian residential design studios
            </p>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Vastu, code, MEP, structure, rates, and generated drawings are professional decision support,
            not stamped approvals. Verify with registered architects, engineers, consultants, and local
            authorities before submission or construction.
          </p>
        </div>
      </footer>
    </div>
  );
}
