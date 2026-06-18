"use client";

import { useState } from "react";
import { ClipboardList, Compass, Loader2, Sparkles, Wand2, Users, MapPin, LayoutGrid } from "lucide-react";
import type { City, Facing, FinishTier } from "@gharplan/shared";
import { CITIES, STATE_LABELS, STATE_BY_CITY } from "@gharplan/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { COMPASS_GRID, FACING_LABELS, type BriefForm } from "@/lib/studio";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type FamilyProfile = "nuclear" | "joint" | "extended" | "bachelor";

const FAMILY_PROFILES: { value: FamilyProfile; label: string; emoji: string; note: string }[] = [
  {
    value: "nuclear",
    label: "Nuclear",
    emoji: "👨‍👩‍👧‍👦",
    note: "2 bedrooms for kids, master en-suite, open kitchen, study nook, 2 baths min.",
  },
  {
    value: "joint",
    label: "Joint Family",
    emoji: "🏘️",
    note: "Parents room on ground floor near pooja, master suite, 3–4 BHK, utility, 3 baths.",
  },
  {
    value: "extended",
    label: "Extended",
    emoji: "🏠",
    note: "Multi-gen: separate entry options, 4+ BHK, pooja, multiple living zones, rental unit possible.",
  },
  {
    value: "bachelor",
    label: "Bachelor / Studio",
    emoji: "🧑‍💻",
    note: "Compact 1–2 BHK, open plan, home office corner, low maintenance, secure entry.",
  },
];

const DESIGN_PRIORITIES = [
  { key: "Climate", icon: "🌬️", desc: "Cross ventilation, shading, passive cooling" },
  { key: "Vastu", icon: "🧭", desc: "Auspicious zoning, brahmasthan" },
  { key: "Budget", icon: "₹", desc: "Cost efficiency, value engineering" },
  { key: "Aesthetics", icon: "✨", desc: "Visual appeal, material quality" },
  { key: "Functionality", icon: "⚙️", desc: "Room flow, storage, ergonomics" },
] as const;

type PriorityKey = (typeof DESIGN_PRIORITIES)[number]["key"];

const SITE_CHALLENGES = [
  { key: "corner", label: "Corner plot" },
  { key: "irregular", label: "Irregular shape" },
  { key: "slope", label: "Sloped site" },
  { key: "adjacent", label: "Adjacent building (reduces light)" },
  { key: "traffic", label: "High traffic road" },
] as const;

type SiteChallenge = (typeof SITE_CHALLENGES)[number]["key"];

const AI_CHIPS = [
  "East-facing 30×40 3BHK Bengaluru",
  "West-facing 40×60 4BHK Chennai + parents",
  "North 20×30 2BHK budget compact",
  "South-facing 50×80 duplex premium Hyderabad",
];

// ─── Component ────────────────────────────────────────────────────────────────

export function BriefPanel({
  value,
  onChange,
  onGenerate,
  loading,
  onAiDraft,
  aiLoading,
}: {
  value: BriefForm;
  onChange: (patch: Partial<BriefForm>) => void;
  onGenerate: () => void;
  loading: boolean;
  onAiDraft?: (text: string) => void;
  aiLoading?: boolean;
}) {
  const [nl, setNl] = useState("");
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile | null>(null);
  // ranks[key] = 1..5 (1 = highest), null = unranked
  const [ranks, setRanks] = useState<Partial<Record<PriorityKey, number>>>({});
  const [siteChallenges, setSiteChallenges] = useState<SiteChallenge[]>([]);

  /** Rotate rank 1→2→3→4→5→null for a priority key */
  function toggleRank(key: PriorityKey) {
    setRanks((prev) => {
      const cur = prev[key];
      if (cur === undefined || cur === null) {
        // assign next available rank 1-5
        const used = new Set(Object.values(prev).filter(Boolean));
        for (let r = 1; r <= 5; r++) {
          if (!used.has(r)) return { ...prev, [key]: r };
        }
        return prev; // all 5 used, do nothing
      }
      // clear this rank
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function toggleSiteChallenge(k: SiteChallenge) {
    setSiteChallenges((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  }

  function applyFamilyProfile(fp: FamilyProfile) {
    setFamilyProfile(fp === familyProfile ? null : fp);
    if (fp === familyProfile) {
      onChange({ notes: "" });
      return;
    }
    const profile = FAMILY_PROFILES.find((p) => p.value === fp);
    if (profile) onChange({ notes: profile.note });
  }

  function buildEnhancedNotes(): string {
    const base = value.notes;
    const challengeStr =
      siteChallenges.length > 0
        ? `Site: ${siteChallenges.map((k) => SITE_CHALLENGES.find((s) => s.key === k)?.label).join(", ")}.`
        : "";
    const priorityStr =
      Object.keys(ranks).length > 0
        ? `Priorities: ${Object.entries(ranks)
            .sort((a, b) => (a[1] as number) - (b[1] as number))
            .map(([k, r]) => `${r}. ${k}`)
            .join(", ")}.`
        : "";
    return [base, challengeStr, priorityStr].filter(Boolean).join(" ").trim();
  }

  function handleGenerate() {
    // Inject enhanced notes before generating
    const enhanced = buildEnhancedNotes();
    if (enhanced !== value.notes) onChange({ notes: enhanced });
    setTimeout(onGenerate, 0);
  }

  const rankColor = (r: number) => {
    if (r === 1) return "bg-primary text-primary-foreground shadow-glow";
    if (r === 2) return "bg-primary/80 text-primary-foreground";
    if (r === 3) return "bg-primary/60 text-primary-foreground";
    return "bg-primary/30 text-primary";
  };

  return (
    <div className="space-y-5">
      {/* ── AI Draft ─────────────────────────────────────────────────────── */}
      {onAiDraft && (
        <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] to-accent/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Wand2 className="h-3.5 w-3.5" /> Architect brief from text
          </div>
          <textarea
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            rows={3}
            placeholder="3BHK east-facing 30×40 Bengaluru home for parents and two kids, pooja, utility, parking, good ventilation, premium but practical."
            className="mt-2 w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm outline-none ring-primary/30 placeholder:text-muted-foreground/70 focus:ring-2"
          />
          {/* Chips */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {AI_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setNl(chip)}
                className="rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/15"
              >
                {chip}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={aiLoading || nl.trim().length < 3}
            onClick={() => onAiDraft(nl)}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {aiLoading ? "Reading..." : "Draft brief with AI"}
          </button>
        </div>
      )}

      {/* ── Section title ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-primary/10 text-primary">
            <ClipboardList className="h-3.5 w-3.5" />
          </span>
          Indian home brief
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Capture plot, family, Vastu, budget, and climate priorities before generating five schemes.
        </p>
      </div>

      {/* ── Project / Client ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project">
          <Input value={value.projectName} onChange={(e) => onChange({ projectName: e.target.value })} />
        </Field>
        <Field label="Client">
          <Input value={value.clientName} onChange={(e) => onChange({ clientName: e.target.value })} />
        </Field>
      </div>

      {/* ── City ─────────────────────────────────────────────────────────── */}
      <Field label="City" hint={STATE_LABELS[STATE_BY_CITY[value.city]]}>
        <Select value={value.city} onValueChange={(v) => onChange({ city: v as City })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c} - {STATE_LABELS[STATE_BY_CITY[c]]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* ── Plot dimensions ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plot width" hint="ft">
          <Input
            type="number"
            inputMode="decimal"
            value={value.widthFt}
            onChange={(e) => onChange({ widthFt: +e.target.value })}
          />
        </Field>
        <Field label="Plot depth" hint="ft">
          <Input
            type="number"
            inputMode="decimal"
            value={value.depthFt}
            onChange={(e) => onChange({ depthFt: +e.target.value })}
          />
        </Field>
      </div>
      <p className="-mt-3 text-[11px] text-muted-foreground">
        {value.widthFt} × {value.depthFt} ft · {((value.widthFt * value.depthFt) / 10.7639).toFixed(0)} m² ·{" "}
        {(value.widthFt * value.depthFt).toLocaleString("en-IN")} sq ft
      </p>

      {/* ── Site Intelligence ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <MapPin className="h-3.5 w-3.5" /> Site challenges
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SITE_CHALLENGES.map(({ key, label }) => {
            const active = siteChallenges.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSiteChallenge(key)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-all",
                  active
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-amber-300/60 bg-white/60 text-amber-700 hover:border-amber-400 dark:bg-transparent dark:text-amber-300",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-amber-700/70 dark:text-amber-400/70">
          Checked challenges inform design narrative and setback decisions.
        </p>
      </div>

      {/* ── Compass facing ───────────────────────────────────────────────── */}
      <Field label="Plot facing" hint={FACING_LABELS[value.facing]}>
        <div className="relative mx-auto grid w-[150px] grid-cols-3 gap-1.5">
          {COMPASS_GRID.map((f, i) =>
            f === null ? (
              <div key={i} className="grid place-items-center text-muted-foreground/60">
                <Compass className="h-5 w-5" />
              </div>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => onChange({ facing: f as Facing })}
                className={cn(
                  "rounded-md border py-2 text-xs font-semibold transition-all",
                  value.facing === f
                    ? "border-primary bg-primary text-primary-foreground shadow-soft"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {f}
              </button>
            ),
          )}
        </div>
      </Field>

      {/* ── Family Profile Quick-Select ───────────────────────────────────── */}
      <div className="rounded-xl border bg-muted/30 p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Users className="h-3.5 w-3.5 text-primary" /> Family profile
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">Auto-fills design priorities for the notes field.</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {FAMILY_PROFILES.map((fp) => {
            const active = familyProfile === fp.value;
            return (
              <button
                key={fp.value}
                type="button"
                onClick={() => applyFamilyProfile(fp.value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-all",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <span className="text-base">{fp.emoji}</span>
                <span>{fp.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bedrooms + Floors ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bedrooms">
          <Stepper value={value.bhk} min={1} max={4} suffix=" BHK" onChange={(v) => onChange({ bhk: v })} />
        </Field>
        <Field label="Floors">
          <Stepper value={value.floors} min={1} max={3} onChange={(v) => onChange({ floors: v })} />
        </Field>
      </div>

      {/* ── Finish / budget ───────────────────────────────────────────────── */}
      <Field label="Finish / budget">
        <Segmented<FinishTier>
          full
          value={value.budgetTier}
          onChange={(v) => onChange({ budgetTier: v })}
          options={[
            { value: "economy", label: "Economy" },
            { value: "standard", label: "Standard" },
            { value: "premium", label: "Premium" },
          ]}
        />
      </Field>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <Field label="Family and design priorities" hint="optional">
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="Parents room, puja, utility, rental floor, parking, home office, low heat, more storage, balcony, future lift..."
          className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm outline-none ring-primary/30 placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </Field>

      {/* ── Vastu toggle ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-3">
        <div>
          <div className="text-sm font-medium">Vastu-first layout</div>
          <div className="text-xs text-muted-foreground">Prioritize auspicious zones before compactness</div>
        </div>
        <Switch checked={value.vastuPriority} onChange={(v) => onChange({ vastuPriority: v })} />
      </div>

      {/* ── Design Priority Matrix ────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <LayoutGrid className="h-3.5 w-3.5 text-primary" /> Design priority matrix
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Click to rank 1–5 (1 = most important). Included in generation.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DESIGN_PRIORITIES.map(({ key, icon, desc }) => {
            const rank = ranks[key];
            const ranked = rank !== undefined;
            return (
              <button
                key={key}
                type="button"
                title={desc}
                onClick={() => toggleRank(key)}
                className={cn(
                  "group relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                  ranked
                    ? "border-primary/60 bg-primary/8 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <span>{icon}</span>
                <span>{key}</span>
                {ranked && (
                  <span
                    className={cn(
                      "ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold",
                      rankColor(rank),
                    )}
                  >
                    {rank}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {Object.keys(ranks).length > 0 && (
          <div className="mt-2 text-[10px] text-muted-foreground">
            Order:{" "}
            {Object.entries(ranks)
              .sort((a, b) => (a[1] as number) - (b[1] as number))
              .map(([k, r]) => `${r}. ${k}`)
              .join(" → ")}
          </div>
        )}
      </div>

      {/* ── Generate ─────────────────────────────────────────────────────── */}
      <Button variant="brand" size="lg" className="w-full" onClick={handleGenerate} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Designing..." : "Generate 5 best schemes"}
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
