"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lightbulb, Loader2 } from "lucide-react";
import type { CodeReport, Plan, VastuReport } from "@gharplan/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclaimer } from "@/components/disclaimer";
import { PlanSvg } from "@/components/plan-svg";
import { ScoreGauge } from "@/components/score-gauge";
import { engine } from "@/lib/engine";
import { useWizard } from "@/lib/store";

function useReports(plan: Plan) {
  const [vastu, setVastu] = useState<VastuReport | null>(null);
  const [code, setCode] = useState<CodeReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(plan);

  useEffect(() => {
    if (plan.rooms.length === 0) {
      setVastu(null);
      setCode(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const [v, c] = await Promise.all([engine.vastu(plan, ctrl.signal), engine.code(plan, ctrl.signal)]);
        setVastu(v);
        setCode(c);
      } catch (e: any) {
        if (e.name !== "AbortError") setErr(typeof e.detail === "string" ? e.detail : e.message);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { vastu, code, err, loading };
}

export function StepReview() {
  const plan = useWizard((s) => s.plan);
  const { vastu, code, err, loading } = useReports(plan);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        <Card>
          <CardContent className="p-3">
            <div className="overflow-hidden rounded-xl bg-grid">
              <PlanSvg plan={plan} colorBy="zone" />
            </div>
          </CardContent>
        </Card>
        {loading && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
          </p>
        )}
        {err && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> Engine: {err}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {/* Vastu */}
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Vastu Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            {!vastu && <p className="text-sm text-muted-foreground">Add rooms to see the Vastu review.</p>}
            {vastu && (
              <>
                <div className="flex items-center gap-4">
                  <ScoreGauge score={vastu.score} grade={vastu.grade} size={104} />
                  <div className="space-y-1.5 text-sm">
                    <Badge variant={vastu.score >= 90 ? "pass" : vastu.score >= 70 ? "warn" : "fail"}>
                      Grade {vastu.grade}
                    </Badge>
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      {vastu.summary.passCount}✓ · {vastu.summary.warnCount}! · {vastu.summary.failCount}✗
                    </p>
                  </div>
                </div>
                <div className="divide-y rounded-xl border">
                  {[...vastu.rooms, vastu.brahmasthan].map((r) => (
                    <div key={`${r.roomId}-${r.roomType}`} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>
                        {r.roomLabel}{" "}
                        <span className="font-mono text-xs text-muted-foreground">· {r.zone}</span>
                      </span>
                      <Badge variant={r.status}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
                {vastu.fixes.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                    <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
                      <Lightbulb className="h-3.5 w-3.5" /> Suggested fixes
                    </div>
                    <ul className="ml-4 list-disc space-y-0.5">
                      {vastu.fixes.slice(0, 4).map((f, i) => (
                        <li key={i}>{f.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Disclaimer kind="vastu" />
              </>
            )}
          </CardContent>
        </Card>

        {/* Code */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b pb-4">
            <CardTitle className="text-base">Preliminary Code Review</CardTitle>
            {code && <Badge variant={code.status}>{code.status}</Badge>}
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {!code && <p className="text-sm text-muted-foreground">Add rooms to see the code review.</p>}
            {code && (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Metric label="Ground coverage" value={`${code.metrics.groundCoveragePct}% / ${code.metrics.maxGroundCoveragePct}%`} />
                  <Metric label="FAR" value={`${code.metrics.farUsed} / ${code.metrics.farAllowed}`} />
                  <Metric label="Built-up" value={`${code.metrics.builtUpSqm} m²`} />
                  <Metric label="Checks" value={`${code.summary.passCount}✓ ${code.summary.warnCount}! ${code.summary.failCount}✗`} />
                </div>
                {code.checks.filter((c) => c.status !== "pass").length > 0 && (
                  <div className="space-y-1.5">
                    {code.checks
                      .filter((c) => c.status !== "pass")
                      .map((c, i) => (
                        <div key={i} className="flex items-start justify-between gap-2 text-xs">
                          <span>
                            {c.roomLabel ? `${c.roomLabel}: ` : ""}
                            {c.message}
                          </span>
                          <Badge variant={c.status}>{c.status}</Badge>
                        </div>
                      ))}
                  </div>
                )}
                <Disclaimer kind="code" />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
