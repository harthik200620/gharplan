"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";
import type { Plan } from "@gharplan/shared";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { useWizard } from "@/lib/store";
import { cn } from "@/lib/utils";
import { StepBoq } from "./step-boq";
import { StepOpenings } from "./step-openings";
import { StepPlot } from "./step-plot";
import { StepReview } from "./step-review";
import { StepRooms } from "./step-rooms";

const STEPS = ["Plot", "Rooms", "Openings", "Review", "BOQ & Export"];

export function Wizard({
  projectId,
  initialPlan,
  canExport,
  demo = false,
}: {
  projectId?: string;
  initialPlan: Plan;
  canExport: boolean;
  demo?: boolean;
}) {
  const plan = useWizard((s) => s.plan);
  const reset = useWizard((s) => s.reset);
  const [step, setStep] = useState(0);
  const [id, setId] = useState(projectId);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current) {
      reset(initialPlan);
      loaded.current = true;
    }
  }, [initialPlan, reset]);

  async function save() {
    if (demo || !hasSupabaseEnv()) {
      toast.info("Demo mode — changes aren’t saved. Sign in to keep projects.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const row = {
        user_id: user!.id,
        name: plan.project.name,
        client_name: plan.project.clientName ?? null,
        plan,
        updated_at: new Date().toISOString(),
      };
      if (id) {
        const { error } = await supabase.from("projects").update(row).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("projects").insert(row).select("id").single();
        if (error) throw error;
        setId(data.id);
        window.history.replaceState(null, "", `/projects/${data.id}`);
      }
      toast.success("Project saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    <StepPlot key="plot" />,
    <StepRooms key="rooms" />,
    <StepOpenings key="openings" />,
    <StepReview key="review" />,
    <StepBoq key="boq" projectId={id} canExport={canExport} />,
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <input
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-2xl font-bold tracking-tight outline-none transition-colors hover:border-border focus:border-primary focus:bg-card"
          value={plan.project.name}
          onChange={(e) => useWizard.getState().setProjectField({ name: e.target.value })}
        />
        <Button variant="outline" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* stepper */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl border bg-card p-2 shadow-soft">
        {STEPS.map((label, i) => {
          const active = i === step;
          const complete = i < step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <button
                onClick={() => setStep(i)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-all",
                  active && "bg-brand-gradient text-white shadow-soft",
                  !active && complete && "text-foreground hover:bg-muted",
                  !active && !complete && "text-muted-foreground hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors",
                    active && "bg-white/20 text-white",
                    !active && complete && "bg-success/15 text-success",
                    !active && !complete && "bg-muted text-muted-foreground group-hover:bg-secondary",
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-h-[420px]">{steps[step]}</div>

      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="brand" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => s + 1)}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
