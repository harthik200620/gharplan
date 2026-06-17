"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { RoomType } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newRoom, ROOM_TYPE_OPTIONS, roomBounds } from "@/lib/plan-helpers";
import { useWizard } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RoomCanvas } from "./room-canvas";

export function StepRooms() {
  const plan = useWizard((s) => s.plan);
  const addRoom = useWizard((s) => s.addRoom);
  const updateRoom = useWizard((s) => s.updateRoom);
  const setRoomRect = useWizard((s) => s.setRoomRect);
  const removeRoom = useWizard((s) => s.removeRoom);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [newType, setNewType] = useState<RoomType>("living");

  const selected = plan.rooms.find((r) => r.id === selectedId) ?? null;
  const W = plan.plot.widthM;
  const D = plan.plot.depthM;

  function add() {
    const i = plan.rooms.length;
    const w = Math.min(3, W - 2);
    const h = Math.min(3, D - 2);
    const x0 = Math.min(1 + (i % 3) * 0.8, W - w - 0.5);
    const y0 = Math.min(1 + Math.floor(i / 3) * 0.8, D - h - 0.5);
    const room = newRoom(newType, [x0, y0, x0 + w, y0 + h]);
    addRoom(room);
    setSelected(room.id);
  }

  const b = selected ? roomBounds(selected.polygon) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_330px]">
      <Card>
        <CardContent className="p-3">
          <div className="overflow-hidden rounded-xl bg-grid">
            <RoomCanvas plan={plan} selectedId={selectedId} onSelect={setSelected} />
          </div>
          <p className="mt-2.5 px-1 text-xs text-muted-foreground">
            Drag a room to move; drag a corner handle to resize. Snaps to 10&nbsp;cm. Zones update live.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <Label>Add room</Label>
            <div className="mt-2 flex gap-2">
              <Select value={newType} onValueChange={(v) => setNewType(v as RoomType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="brand" onClick={add}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {selected && b && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>{ROOM_LABELS[selected.type]}</Label>
                  <Badge variant="brand" className="font-mono text-[10px]">{selected.zone}</Badge>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => { removeRoom(selected.id); setSelected(null); }}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <Select value={selected.type} onValueChange={(v) => updateRoom(selected.id, { type: v as RoomType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <NumBox label="X (m)" value={b[0]} onChange={(v) => setRoomRect(selected.id, v, b[1], v + (b[2] - b[0]), b[3])} />
                <NumBox label="Y (m)" value={b[1]} onChange={(v) => setRoomRect(selected.id, b[0], v, b[2], v + (b[3] - b[1]))} />
                <NumBox label="Width (m)" value={b[2] - b[0]} onChange={(v) => setRoomRect(selected.id, b[0], b[1], b[0] + Math.max(0.6, v), b[3])} />
                <NumBox label="Depth (m)" value={b[3] - b[1]} onChange={(v) => setRoomRect(selected.id, b[0], b[1], b[2], b[1] + Math.max(0.6, v))} />
              </div>
              <NumBox
                label="Ceiling height (m)"
                value={selected.ceilingHeightM}
                onChange={(v) => updateRoom(selected.id, { ceilingHeightM: Math.max(2, v) })}
              />
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {selected.areaSqm.toFixed(2)} m² · perimeter {selected.perimeterM.toFixed(2)} m
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4">
            <Label>Rooms ({plan.rooms.length})</Label>
            <div className="mt-2 max-h-60 space-y-1 overflow-auto text-sm">
              {plan.rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-muted",
                    selectedId === r.id && "bg-primary/8 ring-1 ring-inset ring-primary/20",
                  )}
                >
                  <span className="font-medium">{ROOM_LABELS[r.type]}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {r.areaSqm.toFixed(1)} m² · {r.zone}
                  </span>
                </button>
              ))}
              {plan.rooms.length === 0 && <p className="text-xs text-muted-foreground">No rooms yet — add one above.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NumBox({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.1"
        value={Number(value.toFixed(2))}
        onChange={(e) => onChange(+e.target.value)}
        className="font-mono tabular-nums"
      />
    </div>
  );
}
