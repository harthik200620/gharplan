"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { BoqReport, ExtraLine, FinishTier } from "@gharplan/shared";
import { FINISH_TIERS, ROOM_LABELS } from "@gharplan/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Disclaimer } from "@/components/disclaimer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { engine } from "@/lib/engine";
import { useWizard } from "@/lib/store";
import { cn, inr2 } from "@/lib/utils";

type Override = { qty?: number; materialRate?: number; labourRate?: number };

export function StepBoq({ projectId, canExport }: { projectId?: string; canExport: boolean }) {
  const plan = useWizard((s) => s.plan);
  const [tier, setTier] = useState<FinishTier>("standard");
  const [fcRooms, setFcRooms] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [boq, setBoq] = useState<BoqReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  const request = useMemo(
    () => ({
      plan,
      finishTier: tier,
      options: { falseCeilingRoomIds: fcRooms, removeLineIds: removed },
      overrides: Object.entries(overrides).map(([lineId, o]) => ({ lineId, ...o })),
      extraLines: extras,
    }),
    [plan, tier, fcRooms, removed, overrides, extras],
  );

  useEffect(() => {
    if (plan.rooms.length === 0) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setBoq(await engine.boq(request, ctrl.signal));
      } catch (e: any) {
        if (e.name !== "AbortError") toast.error(typeof e.detail === "string" ? e.detail : "BOQ failed");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(request)]);

  function setOverride(id: string, patch: Override) {
    setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
  }

  async function doExport(type: "pdf" | "dxf" | "xlsx") {
    setExporting(type);
    try {
      const res = await fetch(`/api/export/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, projectId }),
      });
      if (res.status === 402) {
        toast.error("No export credits left. Buy credits or subscribe.");
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${plan.project.name.replace(/\W+/g, "_")}.${type}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${type.toUpperCase()} downloaded`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExporting(null);
    }
  }

  if (plan.rooms.length === 0) {
    return <p className="text-sm text-muted-foreground">Add rooms to generate a BOQ.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-soft">
        <div className="flex items-center gap-2">
          <Label>Finish tier</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as FinishTier)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINISH_TIERS.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          {!canExport && (
            <Badge variant="warn" className="gap-1">
              <Lock className="h-3 w-3" /> <Link href="/billing">Buy credits to export</Link>
            </Badge>
          )}
          {(["pdf", "dxf", "xlsx"] as const).map((t) => (
            <Button key={t} variant={t === "pdf" ? "accent" : "outline"} size="sm" disabled={!canExport || !!exporting} onClick={() => doExport(t)}>
              {exporting === t ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {/* false ceiling toggles */}
      <Card>
        <CardContent className="p-4">
          <Label className="text-xs">False ceiling (POP/gypsum) — toggle per room</Label>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {plan.rooms.map((r) => {
              const on = fcRooms.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => setFcRooms((f) => (on ? f.filter((x) => x !== r.id) : [...f, r.id]))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                    on
                      ? "border-transparent bg-brand-gradient text-white shadow-soft"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {ROOM_LABELS[r.type]}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* editable table */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Room</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Material</TableHead>
              <TableHead className="text-right">Labour</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boq?.lines.map((ln) => (
              <TableRow key={ln.id}>
                <TableCell className="text-xs text-muted-foreground">{ln.roomLabel}</TableCell>
                <TableCell className="text-xs">
                  {ln.description}
                  {ln.edited && <Badge variant="secondary" className="ml-1">edited</Badge>}
                </TableCell>
                <TableCell className="text-xs">{ln.unit}</TableCell>
                <TableCell className="w-20">
                  <Cell value={overrides[ln.id]?.qty ?? ln.qty} onChange={(v) => setOverride(ln.id, { qty: v })} />
                </TableCell>
                <TableCell className="w-24">
                  <Cell value={overrides[ln.id]?.materialRate ?? ln.materialRate} onChange={(v) => setOverride(ln.id, { materialRate: v })} />
                </TableCell>
                <TableCell className="w-24">
                  <Cell value={overrides[ln.id]?.labourRate ?? ln.labourRate} onChange={(v) => setOverride(ln.id, { labourRate: v })} />
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{inr2(ln.amount)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{inr2(ln.gstAmount)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-medium tabular-nums">{inr2(ln.total)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon-sm" onClick={() => setRemoved((r) => [...r, ln.id])}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AddCustomLine onAdd={(l) => setExtras((e) => [...e, l])} />

      {/* totals */}
      {boq && (
        <div className="flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 rounded-2xl border bg-card p-4 text-sm shadow-soft sm:w-72">
            <Row label="Subtotal" value={inr2(boq.summary.subtotal)} />
            <Row label="CGST + SGST" value={`${inr2(boq.summary.cgstTotal)} + ${inr2(boq.summary.sgstTotal)}`} />
            <Row label="Total GST" value={inr2(boq.summary.gstTotal)} />
            <div className="mt-2 flex items-baseline justify-between border-t pt-2.5">
              <span className="text-sm font-medium text-muted-foreground">Grand Total</span>
              <span className="font-display text-xl font-bold tabular-nums text-primary">
                {inr2(boq.summary.grandTotal)}
              </span>
            </div>
          </div>
        </div>
      )}
      <Disclaimer kind="export" />
    </div>
  );
}

function Cell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Input
      type="number"
      step="0.01"
      value={value}
      onChange={(e) => onChange(+e.target.value)}
      className="h-8 px-1.5 text-right font-mono text-xs tabular-nums"
    />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function AddCustomLine({ onAdd }: { onAdd: (l: ExtraLine) => void }) {
  const [desc, setDesc] = useState("");
  const [unit, setUnit] = useState("nos");
  const [qty, setQty] = useState(1);
  const [mat, setMat] = useState(0);
  const [lab, setLab] = useState(0);
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl border bg-card p-3 shadow-soft">
      <div className="grow space-y-1">
        <Label className="text-xs">Add custom line (e.g. modular kitchen)</Label>
        <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" className="h-8" />
      </div>
      <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" className="h-8 w-16" />
      <Input type="number" value={qty} onChange={(e) => setQty(+e.target.value)} placeholder="qty" className="h-8 w-20 font-mono tabular-nums" />
      <Input type="number" value={mat} onChange={(e) => setMat(+e.target.value)} placeholder="material" className="h-8 w-24 font-mono tabular-nums" />
      <Input type="number" value={lab} onChange={(e) => setLab(+e.target.value)} placeholder="labour" className="h-8 w-24 font-mono tabular-nums" />
      <Button
        variant="brand"
        size="sm"
        disabled={!desc}
        onClick={() => {
          onAdd({
            trade: "Custom",
            itemCode: "CUSTOM",
            description: desc,
            unit,
            qty,
            materialRate: mat,
            labourRate: lab,
            hsnCode: "",
            gstPercent: 18,
          });
          setDesc("");
          setQty(1);
          setMat(0);
          setLab(0);
        }}
      >
        <Plus className="h-4 w-4" /> Add
      </Button>
    </div>
  );
}
