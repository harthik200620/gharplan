"use client";

import { useState } from "react";
import { ClipboardList, Compass, Loader2, Sparkles, Wand2 } from "lucide-react";
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
  return (
    <div className="space-y-6">
      {onAiDraft && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Wand2 className="h-3.5 w-3.5" /> Architect brief from text
          </div>
          <textarea
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            rows={3}
            placeholder="3BHK east-facing 30x40 Bengaluru home for parents and two kids, pooja, utility, parking, good ventilation, premium but practical."
            className="mt-2 w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm outline-none ring-primary/30 placeholder:text-muted-foreground/70 focus:ring-2"
          />
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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Project">
          <Input value={value.projectName} onChange={(e) => onChange({ projectName: e.target.value })} />
        </Field>
        <Field label="Client">
          <Input value={value.clientName} onChange={(e) => onChange({ clientName: e.target.value })} />
        </Field>
      </div>

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
        {value.widthFt} x {value.depthFt} ft - {((value.widthFt * value.depthFt) / 10.7639).toFixed(0)} m2 -{" "}
        {(value.widthFt * value.depthFt).toLocaleString("en-IN")} sq ft
      </p>

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

      <div className="grid grid-cols-2 gap-3">
        <Field label="Bedrooms">
          <Stepper value={value.bhk} min={1} max={4} suffix=" BHK" onChange={(v) => onChange({ bhk: v })} />
        </Field>
        <Field label="Floors">
          <Stepper value={value.floors} min={1} max={3} onChange={(v) => onChange({ floors: v })} />
        </Field>
      </div>

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

      <Field label="Family and design priorities" hint="optional">
        <textarea
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="Parents room, puja, utility, rental floor, parking, home office, low heat, more storage, balcony, future lift..."
          className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm outline-none ring-primary/30 placeholder:text-muted-foreground/70 focus:ring-2"
        />
      </Field>

      <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-3">
        <div>
          <div className="text-sm font-medium">Vastu-first layout</div>
          <div className="text-xs text-muted-foreground">Prioritize auspicious zones before compactness</div>
        </div>
        <Switch checked={value.vastuPriority} onChange={(v) => onChange({ vastuPriority: v })} />
      </div>

      <Button variant="brand" size="lg" className="w-full" onClick={onGenerate} disabled={loading}>
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
