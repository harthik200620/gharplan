"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { CodeReport, Plan, VastuReport } from "@gharplan/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclaimer } from "@/components/disclaimer";
import { PlanSvg } from "@/components/plan-svg";
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
        <div className="rounded-lg border bg-card p-3">
          <PlanSvg plan={plan} colorBy="zone" />
        </div>
        {loading && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
          </p>
        )}
        {err && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> Engine: {err}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {/* Vastu */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Vastu Review</CardTitle>
            {vastu && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">{vastu.score}</span>
                <span className="text-xs text-muted-foreground">/100</span>
                <Badge variant={vastu.score >= 90 ? "pass" : vastu.score >= 70 ? "warn" : "fail"}>{vastu.grade}</Badge>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {!vastu && <p className="text-sm text-muted-foreground">Add rooms to see the Vastu review.</p>}
            {vastu && (
              <>
                <div className="space-y-1">
                  {[...vastu.rooms, vastu.brahmasthan].map((r) => (
                    <div key={`${r.roomId}-${r.roomType}`} className="flex items-center justify-between text-sm">
                      <span>
                        {r.roomLabel} <span className="text-xs text-muted-foreground">· {r.zone}</span>
                      </span>
                      <Badge variant={r.status}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
                {vastu.fixes.length > 0 && (
                  <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                    <strong>Fixes:</strong>
                    <ul className="ml-4 mt-1 list-disc">
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
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Preliminary Code Review</CardTitle>
            {code && <Badge variant={code.status}>{code.status}</Badge>}
          </CardHeader>
          <CardContent className="space-y-3">
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
                  <div className="space-y-1">
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
    <div className="rounded-md bg-secondary/60 px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
