"use client";

import type { City, Facing } from "@gharplan/shared";
import { CITIES, STATE_BY_CITY } from "@gharplan/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWizard } from "@/lib/store";

const FACINGS: Facing[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function StepPlot() {
  const plan = useWizard((s) => s.plan);
  const setPlot = useWizard((s) => s.setPlot);
  const setProjectField = useWizard((s) => s.setProjectField);
  const { plot, project } = plan;

  const ft = (m: number) => (m / 0.3048).toFixed(0);

  return (
    <div className="grid max-w-2xl gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <Input value={project.name} onChange={(e) => setProjectField({ name: e.target.value })} />
        </Field>
        <Field label="Client name">
          <Input value={project.clientName ?? ""} onChange={(e) => setProjectField({ clientName: e.target.value })} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Plot width — East/West (m)  ·  ${ft(plot.widthM)} ft`}>
          <Input
            type="number"
            step="0.1"
            value={plot.widthM}
            onChange={(e) => setPlot({ widthM: Math.max(1, +e.target.value) })}
          />
        </Field>
        <Field label={`Plot depth — North/South (m)  ·  ${ft(plot.depthM)} ft`}>
          <Input
            type="number"
            step="0.1"
            value={plot.depthM}
            onChange={(e) => setPlot({ depthM: Math.max(1, +e.target.value) })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Facing (road side)">
          <Select value={plot.facing} onValueChange={(v) => setPlot({ facing: v as Facing })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FACINGS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="City">
          <Select
            value={plot.city}
            onValueChange={(v) => setPlot({ city: v as City, state: STATE_BY_CITY[v as City] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CITIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Floors">
          <Input
            type="number"
            min={1}
            value={plot.floors}
            onChange={(e) => setPlot({ floors: Math.max(1, Math.round(+e.target.value)) })}
          />
        </Field>
      </div>

      <p className="text-sm text-muted-foreground">
        Plot area: <strong>{plot.areaSqm.toFixed(2)} m²</strong> ({(plot.areaSqm * 10.7639).toFixed(0)} sq ft) ·
        State <strong>{plot.state}</strong>
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
