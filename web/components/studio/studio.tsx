"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Compass, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { BoqReport, GeneratedOption, GenerateResponse, Plan } from "@gharplan/shared";
import { engine, EngineError } from "@/lib/engine";
import { useWizard } from "@/lib/store";
import { BriefPanel } from "./brief-panel";
import { ResultPanel } from "./result-panel";
import { DEFAULT_BRIEF, FACING_LABELS, briefToRequest, refineRequest, type BriefForm } from "@/lib/studio";

export function Studio() {
  const router = useRouter();
  const [brief, setBrief] = React.useState<BriefForm>(DEFAULT_BRIEF);
  const [options, setOptions] = React.useState<GeneratedOption[]>([]);
  const [selected, setSelected] = React.useState(0);
  const [boq, setBoq] = React.useState<BoqReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [boqLoading, setBoqLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState<string | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [edits, setEdits] = React.useState<string[]>([]);
  const [refining, setRefining] = React.useState(false);
  const [editNote, setEditNote] = React.useState<{ applied: string[]; unmatched: string[] } | null>(null);

  const patch = (p: Partial<BriefForm>) => setBrief((b) => ({ ...b, ...p }));

  async function aiDraft(text: string) {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 503) {
        toast.info("Natural-language briefs need an ANTHROPIC_API_KEY on the server - fill the form and Generate for now.");
        return;
      }
      if (!res.ok) throw new Error();
      const { brief: ai } = (await res.json()) as { brief: Record<string, unknown> };
      const keys = [
        "bhk",
        "widthFt",
        "depthFt",
        "facing",
        "city",
        "floors",
        "budgetTier",
        "vastuPriority",
        "projectName",
        "clientName",
        "notes",
      ] as const;
      const next: Partial<BriefForm> = {};
      for (const k of keys) if (ai[k] !== undefined && ai[k] !== null) (next as Record<string, unknown>)[k] = ai[k];
      setBrief((b) => ({ ...b, ...next }));
      toast.success("Brief drafted from your description - review and Generate.");
    } catch {
      toast.error("Couldn't draft from that text. Try the form.");
    } finally {
      setAiLoading(false);
    }
  }

  const data: GenerateResponse | null = options[selected] ?? null;

  async function generate() {
    setLoading(true);
    setOptions([]);
    setSelected(0);
    setBoq(null);
    setEdits([]);
    setEditNote(null);
    try {
      const res = await engine.generateOptions(briefToRequest(brief));
      if (!res.options.length) throw new Error("No feasible design for this brief");
      setOptions(res.options);
      setSelected(0);
      const top = res.options[0];
      toast.success(
        `${res.count} ${res.count === 1 ? "scheme" : "schemes"} ready - best Vastu ${Math.round(top.vastu.score)}/100 (${top.vastu.grade})`,
      );
      void costPlan(top.plan);
    } catch (e: unknown) {
      const msg =
        e instanceof EngineError
          ? typeof e.detail === "string"
            ? e.detail
            : `Engine error ${e.status}`
          : e instanceof Error
            ? e.message
            : "Generation failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function selectOption(i: number) {
    if (i === selected || i < 0 || i >= options.length) return;
    setSelected(i);
    setBoq(null);
    // A fresh scheme starts with a clean edit history.
    setEdits([]);
    setEditNote(null);
    void costPlan(options[i].plan);
  }

  async function onRefine(instruction: string) {
    const trimmed = instruction.trim();
    if (!trimmed || refining || !options.length) return;
    const next = [...edits, trimmed];
    setRefining(true);
    try {
      const res = await engine.refine(refineRequest(brief, next, options[selected]?.meta.variantId));
      const copy = [...options];
      copy[selected] = {
        ...options[selected],
        plan: res.plan,
        vastu: res.vastu,
        code: res.code,
        meta: res.meta ?? options[selected].meta,
      };
      setOptions(copy);
      setEdits(next);
      setEditNote({ applied: res.meta?.appliedEdits ?? [], unmatched: res.meta?.unmatchedEdits ?? [] });
      setBoq(null);
      void costPlan(res.plan);
    } catch (e: unknown) {
      const msg =
        e instanceof EngineError
          ? typeof e.detail === "string"
            ? e.detail
            : `Engine error ${e.status}`
          : e instanceof Error
            ? e.message
            : "Refine failed";
      toast.error(msg);
    } finally {
      setRefining(false);
    }
  }

  async function costPlan(plan: Plan) {
    setBoqLoading(true);
    try {
      setBoq(await engine.boq({ plan, finishTier: brief.budgetTier }));
    } catch {
      setBoq(null);
    } finally {
      setBoqLoading(false);
    }
  }

  async function onExport(type: "pdf" | "dxf" | "xlsx") {
    if (!data) return;
    setExporting(type);
    try {
      const res = await fetch(`/api/export/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: data.plan, finishTier: brief.budgetTier }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.plan.project.name.replace(/\W+/g, "_")}.${type}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${type.toUpperCase()} downloaded`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  function openInEditor() {
    if (!data) return;
    useWizard.getState().reset(data.plan);
    router.push("/studio/edit");
  }

  const subtitle = `${brief.bhk} BHK - ${brief.widthFt}x${brief.depthFt} ft - ${FACING_LABELS[brief.facing]}-facing - ${brief.city}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <aside className="h-fit rounded-2xl border bg-card p-5 shadow-soft lg:sticky lg:top-6">
        <BriefPanel
          value={brief}
          onChange={patch}
          onGenerate={generate}
          loading={loading}
          onAiDraft={aiDraft}
          aiLoading={aiLoading}
        />
      </aside>
      <section className="min-w-0">
        {loading ? (
          <LoadingState />
        ) : data ? (
          <ResultPanel
            data={data}
            options={options}
            selectedOption={selected}
            onSelectOption={selectOption}
            boq={boq}
            boqLoading={boqLoading}
            exporting={exporting}
            onExport={onExport}
            onOpenInEditor={openInEditor}
            onRefine={onRefine}
            refining={refining}
            editNote={editNote}
            subtitle={subtitle}
          />
        ) : (
          <EmptyState onGenerate={generate} />
        )}
      </section>
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="grid min-h-[460px] place-items-center rounded-2xl border border-dashed bg-card/50 p-8 text-center">
      <div className="max-w-sm animate-in-up">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
          <Wand2 className="h-7 w-7" />
        </div>
        <h3 className="mt-5 font-display text-xl font-bold">Your five architect schemes appear here</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Set the plot on the left and hit <strong>Generate</strong>. You get five Indian home design
          directions, a Vastu-zoned CAD plan, 3D massing, code review, MEP coordination prompts, and BOQ.
        </p>
        <button
          onClick={onGenerate}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition-colors hover:bg-primary-emphasis"
        >
          <Sparkles className="h-4 w-4" /> Generate sample 30x40 East
        </button>
      </div>
    </div>
  );
}

const STEPS = [
  "Reading the plot, family brief, and setbacks",
  "Creating five Indian residential design directions",
  "Placing rooms in Vastu and climate-aware zones",
  "Checking bylaws, ventilation, and buildability",
  "Preparing MEP coordination and BOQ",
];

function LoadingState() {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="space-y-5">
      <div className="relative h-[460px] overflow-hidden rounded-2xl border bg-card">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
              <Compass className="h-7 w-7 animate-spin" style={{ animationDuration: "3s" }} />
            </div>
            <div className="space-y-1.5">
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  className={`flex items-center gap-2 text-sm transition-colors ${
                    i === step ? "text-foreground" : i < step ? "text-muted-foreground" : "text-muted-foreground/50"
                  }`}
                >
                  {i === step ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <span className="grid h-3.5 w-3.5 place-items-center">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    </span>
                  )}
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 top-0 h-full w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[72px] animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
