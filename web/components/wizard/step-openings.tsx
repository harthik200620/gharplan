"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Opening } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWizard } from "@/lib/store";

export function StepOpenings() {
  const plan = useWizard((s) => s.plan);

  if (plan.rooms.length === 0) {
    return <p className="text-sm text-muted-foreground">Add rooms first (previous step).</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Doors and windows drive the BOQ (door/window counts) and code ventilation checks.
      </p>
      {plan.rooms.map((room) => (
        <div key={room.id} className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-medium">{ROOM_LABELS[room.type]}</h3>
            <Badge variant="secondary">{room.zone}</Badge>
            <span className="text-xs text-muted-foreground">{room.areaSqm.toFixed(1)} m²</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OpeningColumn kind="door" roomId={room.id} items={plan.doors.filter((o) => o.roomId === room.id)} />
            <OpeningColumn kind="window" roomId={room.id} items={plan.windows.filter((o) => o.roomId === room.id)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function OpeningColumn({ kind, roomId, items }: { kind: "door" | "window"; roomId: string; items: Opening[] }) {
  const addOpening = useWizard((s) => s.addOpening);
  const updateOpening = useWizard((s) => s.updateOpening);
  const removeOpening = useWizard((s) => s.removeOpening);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="capitalize">{kind}s</Label>
        <Button variant="ghost" size="sm" onClick={() => addOpening(kind, roomId)}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
        {items.map((o) => (
          <div key={o.id} className="flex items-center gap-1.5">
            <Field v={o.widthM} label="W" onChange={(v) => updateOpening(kind, o.id, { widthM: v })} />
            <Field v={o.heightM} label="H" onChange={(v) => updateOpening(kind, o.id, { heightM: v })} />
            <Field v={o.count} label="×" step={1} onChange={(v) => updateOpening(kind, o.id, { count: Math.max(1, Math.round(v)) })} />
            <Button variant="ghost" size="icon" onClick={() => removeOpening(kind, o.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ v, label, step = 0.1, onChange }: { v: number; label: string; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input type="number" step={step} value={v} onChange={(e) => onChange(+e.target.value)} className="h-8 w-16 px-1.5 text-sm" />
    </div>
  );
}
