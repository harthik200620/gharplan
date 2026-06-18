import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Box,
  Building2,
  Compass,
  Download,
  FileText,
  IndianRupee,
  Layers,
  MapPinned,
  PenTool,
  Play,
  Ruler,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Trophy,
  Users,
  Wand2,
  Wind,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/logo";
import { SiteHeader } from "@/components/site-header";
import { AnimatedFloorPlan } from "@/components/animated-floor-plan";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

/* ─── Data ────────────────────────────────────────────────────────────────── */

const TRUST_STATS = [
  { value: "10,000+", label: "Plans Generated" },
  { value: "28", label: "Indian Cities" },
  { value: "₹12 Lakh", label: "Avg Design Cost Saved" },
];

const CAPABILITIES = [
  {
    icon: Wand2,
    title: "5 best design schemes",
    body: "Every brief becomes five ranked options: Vastu-first, climate-first, compact-budget, premium courtyard, and BIM-ready build.",
    number: "05",
  },
  {
    icon: Compass,
    title: "Indian family planning",
    body: "Pooja, utility, parents room, rental floor, parking, sit-out, kitchen workflow, privacy gradients, and future expansion.",
    number: "∞",
  },
  {
    icon: ShieldCheck,
    title: "Vastu + code checks",
    body: "Room zoning, Brahmasthan, setbacks, FAR, coverage, ventilation, room minimums, stairs, and fix-first advisories.",
    number: "48",
  },
  {
    icon: Blocks,
    title: "BIM and MEP logic",
    body: "Models the architect workflow from concept to CAD, 3D, structure, plumbing, electrical, HVAC, clashes, and handover.",
    number: "6",
  },
  {
    icon: IndianRupee,
    title: "BOQ from geometry",
    body: "Costs are generated from the plan itself with trade-wise totals, GST splits, finish tiers, and exportable Excel.",
    number: "₹",
  },
  {
    icon: Download,
    title: "Office-ready outputs",
    body: "Client proposal PDF, DXF for AutoCAD, Excel BOQ, Vastu report, code review, and editor handoff.",
    number: "9",
  },
  {
    icon: Thermometer,
    title: "Climate-First Design",
    body: "Passive solar, cross-ventilation, and thermal analysis for each of India's 5 climate zones.",
    number: "5",
  },
  {
    icon: Layers,
    title: "Structural Intelligence",
    body: "Column grid, beam sizing, and foundation type recommendations based on plot dimensions and number of floors.",
    number: "∑",
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

const ARCHITECT_CARDS = [
  {
    icon: Compass,
    name: "Vastu Mandala",
    period: "Classical · 3000 BCE",
    quote: "Space is not a container — it is a living field of energies aligned with cosmic order.",
    rule: "9-zone planning grid — Brahmasthan at centre, wet zones SW, pooja NE, master SW, kitchen SE.",
    color: "from-amber-500/20 to-orange-500/10",
    accent: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/30",
  },
  {
    icon: Wind,
    name: "Laurie Baker",
    period: "Kerala Modern · 1917–2007",
    quote: "The cheapest building material is fresh air. Design for the breeze, not against it.",
    rule: "Every room must catch the prevailing wind. Stack wet areas. Use rat-trap bond. No AC required.",
    color: "from-emerald-500/20 to-teal-500/10",
    accent: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/30",
  },
  {
    icon: Building2,
    name: "Charles Correa",
    period: "Bombay Modern · 1930–2015",
    quote: "The courtyard is India's fundamental spatial contribution — a room open to the sky.",
    rule: "Central void for light and air. Incremental growth from the inside out. Section over plan.",
    color: "from-violet-500/20 to-purple-500/10",
    accent: "text-violet-600 dark:text-violet-400",
    border: "border-violet-500/30",
  },
  {
    icon: Users,
    name: "BV Doshi",
    period: "Ahmedabad School · 1927–2023",
    quote: "Architecture must allow for imperfection, for growth, for the life of a family over time.",
    rule: "Design for incremental addition. Multi-generational zones. Community boundaries that breathe.",
    color: "from-blue-500/20 to-indigo-500/10",
    accent: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/30",
  },
];

const FIVE_SCHEMES = [
  {
    num: "01",
    name: "Vastu-First Classic",
    icon: Compass,
    desc: "Strict 9-zone Vastu Mandala layout. Every room in its ideal compass direction. Brahmasthan preserved.",
    by: "Inspired by classical Vastu Shastra",
    color: "from-amber-500 to-orange-600",
  },
  {
    num: "02",
    name: "Climate-Optimised",
    icon: Wind,
    desc: "Passive solar, deep verandahs, cross-ventilation priority. Reduces AC load by up to 40%.",
    by: "Laurie Baker tradition",
    color: "from-emerald-500 to-teal-600",
  },
  {
    num: "03",
    name: "Courtyard Typology",
    icon: Building2,
    desc: "Central void brings light deep into the plan. Adapted haveli logic for urban plot sizes.",
    by: "Charles Correa's courtyard principle",
    color: "from-violet-500 to-purple-600",
  },
  {
    num: "04",
    name: "Modern Open Plan",
    icon: Wand2,
    desc: "Fluid living-dining-kitchen. Clean geometry. Maximal natural light. Contemporary urban living.",
    by: "International modernism, Indian context",
    color: "from-blue-500 to-indigo-600",
  },
  {
    num: "05",
    name: "Multi-Generational",
    icon: Users,
    desc: "Separate zones for parents, children, guests, and rental income — all under one roof.",
    by: "BV Doshi's incremental family logic",
    color: "from-rose-500 to-pink-600",
  },
];

const PROFESSIONAL_OUTPUTS = [
  { icon: FileText, title: "Drawing Set", sub: "2D CAD + DXF for AutoCAD" },
  { icon: Box, title: "3D Massing View", sub: "Form, material, orientation" },
  { icon: Layers, title: "MEP Coordination", sub: "Electrical, plumbing, HVAC" },
  { icon: Building2, title: "Elevation Views", sub: "All four facades" },
  { icon: Ruler, title: "Section Cuts", sub: "Structural + spatial sections" },
  { icon: BadgeCheck, title: "Vastu Certificate", sub: "Zone compliance report" },
  { icon: ShieldCheck, title: "Code Compliance", sub: "Setbacks, FAR, coverage" },
  { icon: IndianRupee, title: "BOQ + Cost Estimate", sub: "Excel with GST breakdowns" },
  { icon: Download, title: "Client Proposal PDF", sub: "Ready for presentation" },
];

/* ─── Page ────────────────────────────────────────────────────────────────── */

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

      {/* ━━━━━ SECTION 1: HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden border-b bg-aurora min-h-[88vh] flex items-center">
        {/* Animated SVG floor plan background */}
        <AnimatedFloorPlan className="absolute inset-0 h-full w-full" />

        {/* Subtle radial vignette overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 50%, transparent 30%, hsl(var(--background)/0.6) 100%)",
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
          <div className="max-w-4xl animate-in-up">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/8 px-4 py-1.5 text-sm font-semibold text-primary shadow-glow backdrop-blur">
              <Trophy className="h-4 w-4 text-accent" />
              India's Most Advanced AI Architect
            </div>

            {/* Headline */}
            <h1 className="font-display text-5xl font-extrabold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
              Design like{" "}
              <span className="text-gradient">India's best architect.</span>
              <br />
              In minutes.
            </h1>

            {/* Subheadline */}
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              GharPlan turns your plot brief into{" "}
              <strong className="text-foreground font-semibold">5 professional architectural schemes</strong>{" "}
              — complete with Vastu analysis, 2D CAD plans, 3D massing, MEP coordination, and construction BOQ.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="brand" size="xl" className="gap-2 shadow-glow">
                <Link href="/studio">
                  Open Architect Studio <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl" className="gap-2 border-border/60 bg-card/60 backdrop-blur">
                <Link href="/demo">
                  <Play className="h-4 w-4 fill-current" /> Watch Demo
                </Link>
              </Button>
            </div>

            {/* Trust stats */}
            <div className="mt-10 flex flex-wrap gap-6">
              {TRUST_STATS.map(({ value, label }) => (
                <div key={label} className="flex flex-col">
                  <span className="font-display text-2xl font-extrabold text-foreground sm:text-3xl">
                    {value}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━ SECTION 2: HOW IT WORKS (6 steps) ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden border-b bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          {/* Section header */}
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Automated architect workflow
            </p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              From concept sketch to{" "}
              <span className="text-gradient">construction package</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              The app mirrors how strong Indian practices work — collect the brief, explore options, check the design, hand off files.
            </p>
          </div>

          {/* Steps */}
          <div className="relative mt-16 lg:mt-20">
            {/* Vertical connector line (desktop) */}
            <div
              className="pointer-events-none absolute left-[calc(50%-1px)] top-0 hidden h-full w-px lg:block"
              style={{
                background:
                  "linear-gradient(to bottom, transparent, hsl(var(--primary)/0.25) 10%, hsl(var(--primary)/0.25) 90%, transparent)",
              }}
            />

            <div className="grid gap-8 lg:gap-0">
              {WORKFLOW.map(({ step, icon: Icon, title, body, output }, idx) => {
                const isLeft = idx % 2 === 0;
                return (
                  <div
                    key={step}
                    className={`relative flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center ${
                      isLeft ? "" : "lg:[&>*:first-child]:order-2"
                    }`}
                  >
                    {/* Card */}
                    <div className="card-gradient-border rounded-2xl bg-card p-6 shadow-premium transition-all hover:-translate-y-0.5 hover:shadow-glow">
                      <div className="flex items-start gap-4">
                        {/* Step number */}
                        <span className="font-display text-5xl font-extrabold leading-none text-gradient opacity-60 select-none">
                          {step}
                        </span>
                        <div className="flex-1">
                          <div className="icon-glow mb-3 inline-grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                            <Icon className="h-5 w-5" />
                          </div>
                          <h3 className="font-display text-lg font-semibold">{title}</h3>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
                          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                            <Zap className="h-3 w-3" /> Output: {output}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Centre dot on the line */}
                    <div className="absolute left-[calc(50%-8px)] top-1/2 hidden h-4 w-4 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow-glow lg:block" />

                    {/* Spacer to push card to correct side */}
                    <div className="hidden lg:block" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━ SECTION 3: CAPABILITIES GRID ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">What we deliver</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              The whole office workflow,{" "}
              <span className="text-gradient">not just a plan generator</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Built to mirror how strong Indian practices operate — sketch options first, then CAD, BIM, MEP, cost.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map(({ icon: Icon, title, body, number }, i) => (
              <div
                key={title}
                className="card-gradient-border group relative overflow-hidden rounded-2xl bg-card p-5 shadow-soft transition-all hover:-translate-y-1 hover:shadow-premium"
              >
                {/* Large ghost number */}
                <span className="pointer-events-none absolute right-3 top-1 font-display text-6xl font-extrabold text-primary/5 select-none">
                  {number}
                </span>

                <div className="icon-glow mb-4 inline-grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>

                {/* Gradient top border accent */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-[2px] rounded-t-2xl opacity-0 transition-opacity group-hover:opacity-100"
                  style={{
                    background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━ SECTION 4: DESIGN PHILOSOPHY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="bg-blueprint border-y py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Design philosophy</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Built on 2,000 years of{" "}
              <span className="text-gradient">Indian architectural wisdom</span>
            </h2>
            <p className="mt-4 text-blue-200/70">
              Every plan draws from classical Vastu Shastra, Laurie Baker's climate wisdom, Charles Correa's courtyard genius, and BV Doshi's community planning.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ARCHITECT_CARDS.map(({ icon: Icon, name, period, quote, rule, color, accent, border }) => (
              <div
                key={name}
                className={`relative overflow-hidden rounded-2xl border ${border} bg-gradient-to-br ${color} p-6 backdrop-blur-sm`}
              >
                <div className="mb-4 inline-grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div className={`text-xs font-semibold uppercase tracking-wider ${accent} mb-1`}>{period}</div>
                <h3 className="font-display text-lg font-bold text-white">{name}</h3>
                <blockquote className="mt-3 text-sm italic leading-6 text-white/70">
                  &ldquo;{quote}&rdquo;
                </blockquote>
                <div className="mt-4 border-t border-white/10 pt-4 text-xs leading-5 text-white/60">
                  {rule}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━ SECTION 5: THE 5 SCHEMES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Five design strategies</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Five genuinely different{" "}
              <span className="text-gradient">architectural strategies</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Not copy-paste. Each scheme applies a distinct spatial logic from Indian architecture tradition.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {FIVE_SCHEMES.map(({ num, name, icon: Icon, desc, by, color }) => (
              <div
                key={num}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft transition-all hover:-translate-y-1 hover:shadow-premium"
              >
                {/* Gradient header strip */}
                <div className={`bg-gradient-to-br ${color} p-5`}>
                  <div className="flex items-start justify-between">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-display text-3xl font-extrabold text-white/30 select-none">{num}</span>
                  </div>
                  <h3 className="mt-3 font-display text-base font-bold text-white leading-tight">{name}</h3>
                </div>

                {/* Card body */}
                <div className="p-5">
                  <p className="text-sm leading-6 text-muted-foreground">{desc}</p>
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground/70">
                    <span className="h-1 w-4 rounded-full bg-primary/40 inline-block" />
                    {by}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━ SECTION 6: PROFESSIONAL OUTPUTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="border-y bg-muted/20 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Deliverables</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Everything a real architectural studio{" "}
              <span className="text-gradient">delivers</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every output file is office-ready. Hand them directly to consultants, contractors, or clients.
            </p>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PROFESSIONAL_OUTPUTS.map(({ icon: Icon, title, sub }) => (
              <div
                key={title}
                className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-soft transition-all hover:shadow-premium hover:border-primary/30"
              >
                <div className="icon-glow grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-display text-sm font-semibold">{title}</div>
                  <div className="text-xs text-muted-foreground">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━ SECTION 7: CTA PANEL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-sidebar px-8 py-14 text-sidebar-foreground shadow-premium sm:px-14">
          {/* Decorative background glow */}
          <div
            className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full"
            style={{ background: "radial-gradient(circle, hsl(243 80% 62% / 0.25) 0%, transparent 70%)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-16 left-1/3 h-64 w-64 rounded-full"
            style={{ background: "radial-gradient(circle, hsl(38 96% 52% / 0.15) 0%, transparent 70%)" }}
          />

          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <Badge variant="brand" className="mb-4 gap-1.5 bg-primary/20 text-primary-foreground/90">
                <Sparkles className="h-3 w-3" /> No learning curve
              </Badge>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Start your first design in{" "}
                <span className="text-gradient">60 seconds.</span>
              </h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-sidebar-foreground/70">
                No learning curve. No CAD skills needed. Just enter your plot details and get five professional architectural schemes.
              </p>
              <p className="mt-4 flex items-center gap-2 text-sm text-sidebar-foreground/50">
                <BadgeCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                Join 5,000+ architects and homeowners who design with GharPlan
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
              <Button asChild variant="accent" size="xl" className="gap-2">
                <Link href="/studio">
                  <Sparkles className="h-4 w-4" /> Open Architect Studio
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="border-sidebar-border/50 text-sidebar-foreground hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground">
                <Link href="/demo">View demo plan</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <Logo />
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} GharPlan — built for Indian residential design studios
            </p>
          </div>
          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Vastu, code, MEP, structure, rates, and generated drawings are professional decision support, not stamped approvals.
            Verify with registered architects, engineers, consultants, and local authorities before submission or construction.
          </p>
        </div>
      </footer>
    </div>
  );
}
