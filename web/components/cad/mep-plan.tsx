"use client";

import * as React from "react";
import type { Plan } from "@gharplan/shared";
import { ROOM_LABELS } from "@gharplan/shared";
import { bounds, INK } from "@/lib/cad";
import {
  buildMepModel,
  SERVICE_STYLE,
  type Conduit,
  type ElecPoint,
  type Fixture,
  type MepModel,
  type PipeRun,
} from "@/lib/mep";
import { cn } from "@/lib/utils";

// Pixel-based drawing in the elevation/section house style: compute a px-per-metre
// scale (S) and multiply world coords by it. No vector-effect; strokes are real px.
const S = 34; // px per metre
const PAD = 30; // px margin around the plot
const ROOM_FILL = "#fafafa";

type Layer = "plumbing" | "electrical";

export function MepPlan({ plan, floor }: { plan: Plan; floor?: number }) {
  const [layer, setLayer] = React.useState<Layer>("plumbing");
  const model = React.useMemo(() => buildMepModel(plan, floor), [plan, floor]);

  const W = plan.plot.widthM;
  const D = plan.plot.depthM;
  const px = W * S + PAD * 2;
  const py = D * S + PAD * 2;

  // world (metres, +y North) → svg pixel (y down). Origin = plot SW.
  const X = (x: number) => PAD + x * S;
  const Y = (y: number) => PAD + (D - y) * S;

  return (
    <div className="grid gap-3">
      {/* layer toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg border bg-card p-1">
          {(["plumbing", "electrical"] as Layer[]).map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs capitalize transition",
                layer === l
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {layer === "plumbing"
            ? `${model.wetRooms.length} wet rooms · ${model.fixtures.length} fixtures`
            : `${model.elec.filter((p) => p.kind === "switchboard").length} boards · 1 DB`}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-soft">
        <svg
          viewBox={`0 0 ${px} ${py}`}
          width="100%"
          style={{ display: "block", background: "#fff" }}
          role="img"
          aria-label={`${layer} services plan`}
        >
          <Defs />

          {/* room outlines + faint labels (shared base) */}
          {model.rooms.map((room) => {
            const r = bounds(room.polygon);
            return (
              <g key={room.id}>
                <rect
                  x={X(r.x)}
                  y={Y(r.y + r.h)}
                  width={r.w * S}
                  height={r.h * S}
                  fill={ROOM_FILL}
                  stroke={INK}
                  strokeWidth={1.2}
                />
                <text
                  x={X(r.x + r.w / 2)}
                  y={Y(r.y + r.h / 2)}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#94a3b8"
                  fontFamily="var(--font-sora), sans-serif"
                >
                  {ROOM_LABELS[room.type]}
                </text>
              </g>
            );
          })}

          {layer === "plumbing" ? (
            <PlumbingLayer model={model} X={X} Y={Y} />
          ) : (
            <ElectricalLayer model={model} X={X} Y={Y} />
          )}
        </svg>

        <div className="border-t bg-muted/30 px-3 py-2">
          {layer === "plumbing" ? <PlumbingLegend model={model} /> : <ElectricalLegend />}
        </div>
      </div>

      <ClashPanel model={model} />

      <p className="px-1 text-[11px] text-muted-foreground">
        Indicative MEP coordination — not for tendering. Verify with a licensed MEP consultant.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* shared defs                                                                  */
/* --------------------------------------------------------------------------- */

function Defs() {
  return (
    <defs>
      <pattern id="mep-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="#94a3b8" strokeWidth="1" />
      </pattern>
      <pattern id="mep-db-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="4" stroke="#92400e" strokeWidth="1" />
      </pattern>
    </defs>
  );
}

type Proj = (v: number) => number;

/* --------------------------------------------------------------------------- */
/* PLUMBING                                                                     */
/* --------------------------------------------------------------------------- */

function PlumbingLayer({ model, X, Y }: { model: MepModel; X: Proj; Y: Proj }) {
  return (
    <g>
      {/* pipe runs first, so fixtures/shaft draw on top of the ends */}
      {model.pipes.map((p) => (
        <Pipe key={p.id} run={p} X={X} Y={Y} />
      ))}

      {/* shaft */}
      {model.shaft && (
        <g>
          <rect
            x={X(model.shaft.x)}
            y={Y(model.shaft.y + model.shaft.h)}
            width={model.shaft.w * S}
            height={model.shaft.h * S}
            fill="url(#mep-hatch)"
            stroke={INK}
            strokeWidth={1.2}
          />
          <text
            x={X(model.shaft.x + model.shaft.w / 2)}
            y={Y(model.shaft.y + model.shaft.h) - 3}
            textAnchor="middle"
            fontSize={8.5}
            fontWeight={700}
            fill="#334155"
          >
            SHAFT
          </text>
        </g>
      )}

      {/* fixtures */}
      {model.fixtures.map((f) => (
        <FixtureGlyph key={f.id} fx={f} X={X} Y={Y} />
      ))}
    </g>
  );
}

function Pipe({ run, X, Y }: { run: PipeRun; X: Proj; Y: Proj }) {
  const st = SERVICE_STYLE[run.service];
  const pts = run.points.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ");
  // mid-segment point for the size/slope label
  const a = run.points[0];
  const b = run.points[run.points.length - 1];
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  return (
    <g>
      <polyline
        points={pts}
        fill="none"
        stroke={st.color}
        strokeWidth={Math.max(1, st.width * S)}
        strokeDasharray={st.dash ? st.dash.split(" ").map((n) => Number(n) * S).join(" ") : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
      />
      {/* slope arrow toward the shaft (last point) for drains */}
      {run.slope && <SlopeArrow from={run.points[run.points.length - 2]} to={b} X={X} Y={Y} color={st.color} />}
      {run.label && (
        <text
          x={X(mid[0])}
          y={Y(mid[1]) - 2}
          textAnchor="middle"
          fontSize={7.5}
          fill={st.color}
          fontFamily="var(--font-mono), monospace"
        >
          {run.label}
          {run.slope ? ` ${run.slope}` : ""}
        </text>
      )}
    </g>
  );
}

function SlopeArrow({ from, to, X, Y, color }: { from: [number, number]; to: [number, number]; X: Proj; Y: Proj; color: string }) {
  const x2 = X(to[0]);
  const y2 = Y(to[1]);
  const ang = Math.atan2(Y(to[1]) - Y(from[1]), X(to[0]) - X(from[0]));
  // place arrowhead a little before the shaft port
  const bx = x2 - Math.cos(ang) * 8;
  const by = y2 - Math.sin(ang) * 8;
  const a1 = ang + Math.PI - 0.4;
  const a2 = ang + Math.PI + 0.4;
  const L = 5;
  return (
    <path
      d={`M ${bx} ${by} L ${bx + Math.cos(a1) * L} ${by + Math.sin(a1) * L} M ${bx} ${by} L ${bx + Math.cos(a2) * L} ${by + Math.sin(a2) * L}`}
      stroke={color}
      strokeWidth={1}
      fill="none"
    />
  );
}

function FixtureGlyph({ fx, X, Y }: { fx: Fixture; X: Proj; Y: Proj }) {
  const cx = X(fx.x);
  const cy = Y(fx.y);
  const stroke = "#475569";
  const sw = 1;
  const fill = "#ffffff";
  switch (fx.kind) {
    case "wc":
      return (
        <g stroke={stroke} strokeWidth={sw} fill={fill}>
          <rect x={cx - 6} y={cy - 9} width={12} height={6} rx={2} />
          <ellipse cx={cx} cy={cy + 2} rx={6} ry={8} />
        </g>
      );
    case "basin":
      return (
        <g stroke={stroke} strokeWidth={sw} fill={fill}>
          <path d={`M ${cx - 8} ${cy} a 8 8 0 0 0 16 0 Z`} />
          <circle cx={cx} cy={cy} r={1} fill={stroke} />
        </g>
      );
    case "sink":
      return (
        <g stroke={stroke} strokeWidth={sw} fill={fill}>
          <rect x={cx - 9} y={cy - 7} width={18} height={14} rx={2} />
          <ellipse cx={cx} cy={cy} rx={5} ry={4} />
        </g>
      );
    case "shower":
      return (
        <g stroke={stroke} strokeWidth={sw} fill={fill}>
          <rect x={cx - 8} y={cy - 8} width={16} height={16} rx={1} />
          <circle cx={cx} cy={cy} r={1.5} fill={stroke} />
        </g>
      );
    case "floor_drain":
      return (
        <g stroke={stroke} strokeWidth={sw} fill={fill}>
          <rect x={cx - 4} y={cy - 4} width={8} height={8} rx={1} />
          <line x1={cx} y1={cy - 4} x2={cx} y2={cy + 4} />
          <line x1={cx - 4} y1={cy} x2={cx + 4} y2={cy} />
        </g>
      );
    case "washing_machine":
      return (
        <g stroke={stroke} strokeWidth={sw} fill={fill}>
          <rect x={cx - 8} y={cy - 8} width={16} height={16} rx={2} />
          <circle cx={cx} cy={cy} r={5} />
          <text x={cx} y={cy + 16} textAnchor="middle" fontSize={6.5} fill={stroke} stroke="none">
            WM
          </text>
        </g>
      );
  }
}

function PlumbingLegend({ model }: { model: MepModel }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
      {model.legend.map((it) => (
        <span key={it.service} className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <line
              x1="1"
              y1="4"
              x2="21"
              y2="4"
              stroke={it.color}
              strokeWidth={Math.min(3, it.width * 34)}
              strokeDasharray={it.dash ? it.dash.split(" ").map((n) => Number(n) * 34).join(" ") : undefined}
            />
          </svg>
          {it.label}
        </span>
      ))}
      <span className="text-slate-400">∅ = pipe bore (mm) · 1:40 fall to shaft</span>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* ELECTRICAL                                                                   */
/* --------------------------------------------------------------------------- */

function ElectricalLayer({ model, X, Y }: { model: MepModel; X: Proj; Y: Proj }) {
  return (
    <g>
      {/* conduits behind the symbols */}
      {model.conduits.map((c) => (
        <ConduitLine key={c.id} cd={c} X={X} Y={Y} />
      ))}
      {model.elec.map((p) => (
        <ElecGlyph key={p.id} pt={p} X={X} Y={Y} />
      ))}
    </g>
  );
}

function ConduitLine({ cd, X, Y }: { cd: Conduit; X: Proj; Y: Proj }) {
  const pts = cd.points.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ");
  return (
    <polyline
      points={pts}
      fill="none"
      stroke="#9ca3af"
      strokeWidth={1}
      strokeDasharray="3 3"
      strokeLinejoin="round"
    />
  );
}

function ElecGlyph({ pt, X, Y }: { pt: ElecPoint; X: Proj; Y: Proj }) {
  const cx = X(pt.x);
  const cy = Y(pt.y);
  const stroke = "#1f2937";
  const sw = 1.1;
  const base = { stroke, strokeWidth: sw, fill: "#ffffff" };
  const lbl = (t: string, dy = 3.2, size = 6.5) => (
    <text x={cx} y={cy + dy} textAnchor="middle" fontSize={size} fontWeight={700} fill={stroke} stroke="none">
      {t}
    </text>
  );
  switch (pt.kind) {
    case "light": // circle with a cross ⊕
      return (
        <g {...base}>
          <circle cx={cx} cy={cy} r={5} />
          <line x1={cx - 5} y1={cy} x2={cx + 5} y2={cy} />
          <line x1={cx} y1={cy - 5} x2={cx} y2={cy + 5} />
        </g>
      );
    case "fan": // circle with 3 short blades
      return (
        <g {...base}>
          <circle cx={cx} cy={cy} r={5.5} />
          {[0, 120, 240].map((d) => {
            const a = (d * Math.PI) / 180;
            return <line key={d} x1={cx} y1={cy} x2={cx + Math.cos(a) * 5} y2={cy + Math.sin(a) * 5} />;
          })}
          <circle cx={cx} cy={cy} r={1} fill={stroke} />
        </g>
      );
    case "socket6a":
    case "socket16a": // half-circle with rating
      return (
        <g>
          <path d={`M ${cx - 6} ${cy + 3} a 6 6 0 0 1 12 0 Z`} {...base} />
          <text x={cx} y={cy} textAnchor="middle" fontSize={5.5} fontWeight={700} fill={stroke}>
            {pt.kind === "socket6a" ? "6A" : "16A"}
          </text>
        </g>
      );
    case "switchboard": // small rect
      return <rect x={cx - 4} y={cy - 2.5} width={8} height={5} rx={1} {...base} />;
    case "ac":
      return (
        <g {...base}>
          <rect x={cx - 7} y={cy - 3} width={14} height={6} rx={1} />
          {lbl("AC", 8.5, 6)}
        </g>
      );
    case "db": // hatched box "DB"
      return (
        <g>
          <rect x={cx - 8} y={cy - 6} width={16} height={12} fill="url(#mep-db-hatch)" stroke="#92400e" strokeWidth={1.3} />
          <text x={cx} y={cy + 3} textAnchor="middle" fontSize={7} fontWeight={800} fill="#92400e" stroke="none">
            DB
          </text>
        </g>
      );
    case "exhaust":
      return (
        <g {...base}>
          <circle cx={cx} cy={cy} r={5.5} />
          <text x={cx} y={cy + 2.2} textAnchor="middle" fontSize={5.5} fontWeight={700} fill={stroke} stroke="none">
            EF
          </text>
        </g>
      );
    case "geyser":
      return (
        <g {...base}>
          <circle cx={cx} cy={cy} r={5.5} />
          <text x={cx} y={cy + 2.2} textAnchor="middle" fontSize={5.5} fontWeight={700} fill={stroke} stroke="none">
            GS
          </text>
        </g>
      );
    case "bell":
      return (
        <g {...base}>
          <circle cx={cx} cy={cy} r={4.5} />
          {lbl("B", 2.2, 6)}
        </g>
      );
  }
}

function ElectricalLegend() {
  const items: { node: React.ReactNode; label: string }[] = [
    {
      label: "Light",
      node: (
        <svg width="14" height="14">
          <circle cx="7" cy="7" r="5" fill="none" stroke="#1f2937" strokeWidth="1.1" />
          <line x1="2" y1="7" x2="12" y2="7" stroke="#1f2937" strokeWidth="1.1" />
          <line x1="7" y1="2" x2="7" y2="12" stroke="#1f2937" strokeWidth="1.1" />
        </svg>
      ),
    },
    {
      label: "Fan",
      node: (
        <svg width="14" height="14">
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="#1f2937" strokeWidth="1.1" />
          {[0, 120, 240].map((d) => {
            const a = (d * Math.PI) / 180;
            return <line key={d} x1="7" y1="7" x2={7 + Math.cos(a) * 5} y2={7 + Math.sin(a) * 5} stroke="#1f2937" strokeWidth="1.1" />;
          })}
        </svg>
      ),
    },
    {
      label: "Socket (6A/16A)",
      node: (
        <svg width="14" height="14">
          <path d="M 1 10 a 6 6 0 0 1 12 0 Z" fill="none" stroke="#1f2937" strokeWidth="1.1" />
        </svg>
      ),
    },
    {
      label: "Switchboard",
      node: (
        <svg width="14" height="14">
          <rect x="2" y="5" width="10" height="5" rx="1" fill="none" stroke="#1f2937" strokeWidth="1.1" />
        </svg>
      ),
    },
    {
      label: "DB",
      node: (
        <svg width="14" height="14">
          <rect x="1" y="2" width="12" height="10" fill="url(#mep-db-hatch)" stroke="#92400e" strokeWidth="1.2" />
        </svg>
      ),
    },
    { label: "EF exhaust · GS geyser · B bell", node: null },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
      <svg width="0" height="0" aria-hidden>
        <defs>
          <pattern id="mep-db-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="#92400e" strokeWidth="1" />
          </pattern>
        </defs>
      </svg>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.node}
          {it.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <svg width="22" height="8" aria-hidden>
          <line x1="1" y1="4" x2="21" y2="4" stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3" />
        </svg>
        Conduit → DB
      </span>
    </div>
  );
}

/* --------------------------------------------------------------------------- */
/* CLASH PANEL                                                                  */
/* --------------------------------------------------------------------------- */

function ClashPanel({ model }: { model: MepModel }) {
  const { clashes, summary } = model;
  return (
    <div className="rounded-xl border bg-card p-3 shadow-soft">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Clash checks</h4>
        <span className="text-[11px] text-muted-foreground">
          {summary.errors} error{summary.errors === 1 ? "" : "s"} · {summary.warns} warning
          {summary.warns === 1 ? "" : "s"}
        </span>
      </div>
      {clashes.length === 0 ? (
        <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-green-600">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          No clashes detected.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {clashes.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  "mt-1 h-2 w-2 shrink-0 rounded-full",
                  c.severity === "error" ? "bg-red-500" : "bg-amber-500",
                )}
              />
              <span className={c.severity === "error" ? "text-red-600" : "text-amber-700"}>
                {c.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
