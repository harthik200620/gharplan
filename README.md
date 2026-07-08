# 🏛️ Vastukala AI — the autonomous architect platform for India

> Describe a plot and a brief, and Vastukala AI reasons like an architect: it lays out a Vastu-compliant, building-code-aware floor plan, draws the full 2D CAD set, walks you through it in real-time 3D, and prices it down to the Bill of Quantities.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![React Three Fiber](https://img.shields.io/badge/React%20Three%20Fiber-three.js-000000?logo=three.js&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3-38B2AC?logo=tailwindcss&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.1-009688?logo=fastapi&logoColor=white)
![pytest](https://img.shields.io/badge/tested%20with-pytest-0A9EDC?logo=pytest&logoColor=white)

---

## ✨ What it does

- **Vastu-compliant auto-layout** — a constraint solver places rooms to honour the Vastu Purusha Mandala (NE pooja, SW master, a clear central Brahmasthan) instead of just checklist-scoring a plan you drew by hand.
- **Jurisdiction rule packs with clause-cited code checks** — `resolve_jurisdiction(state, city)` routes a brief to the governing authority's data pack (GHMC, other TG ULBs, AP DPMS / CRDA / TUDA / VMRDA, a KA legacy adapter). Beyond NBC basics (coverage, FAR, setbacks, room minimums, ventilation, stair widths), packs add height-vs-road-width caps, rainwater-harvesting mandates, corner-plot second-frontage setbacks and the TS-bPASS instant-approval tier — and every pack-defined check carries its **legal citation and confidence flag**.
- **Preliminary structural engine (IS-code)** — a deterministic IS 456 / IS 875 / IS 1893 RCC pass: column grid, load takedown, slabs, beams, columns, footings, seismic base shear, detailing and a bar-bending schedule, with clause references on every member. Preliminary sizing for early design — never a stamped design.
- **Irregular (polygon) plots** — a surveyed boundary ring feeds the solver via a conservative inset + largest-inscribed-rectangle envelope (v1); corner plots and per-edge road widths drive the jurisdiction checks.
- **2D CAD drawing set** — generates floor plans, four elevations and a building section with layers, dimensions, labels, a north arrow and a title block; exports to DXF.
- **Live 3D walkthrough** — a real-time React Three Fiber (three.js) scene renders the generated home with hip/gable roofs, columns, compound walls and landscaping, orbit-controlled in the browser.
- **MEP coordination** — water / drainage / electrical routing over the plan geometry, with MCB circuits + wire sizing, a service-load estimate, IS 2470 septic sizing, HVAC tonnage and an NBC fire checklist.
- **BOQ & cost estimate** — an itemized, GST-aware Bill of Quantities is computed *directly from room geometry* (wall lengths, areas, door/window deductions), priced against a rate database.
- **BIM & client-ready exports** — IFC4 BIM, a branded municipal-style PDF set with a licensed-professional sign-off block, DXF CAD, XLSX BOQ, GLB 3D model and a 4K real-time render capture.
- **Multi-region data** — Karnataka, Telangana and Andhra Pradesh (KA / TG / AP) rule packs, Vastu rules and rate databases, all versioned as reviewable data, not code.

---

## 📸 Screenshots

> _(add screenshots / GIFs here)_ — the routes worth capturing:

| Route | Capture | File |
|---|---|---|
| `/` | Landing page | `docs/screenshots/landing.png` |
| `/studio` | AI design wizard | `docs/screenshots/studio.png` |
| `/3d-preview` | Real-time 3D walkthrough | `docs/screenshots/3d.png` |

```
docs/screenshots/landing.png
docs/screenshots/studio.png
docs/screenshots/3d.png
```

---

## 🏗️ Architecture

```
                        ┌──────────────────────────────────────────────┐
   Browser  ───────────▶│  Next.js web  (App Router · TS · Tailwind)    │
   /  /studio           │  /  · /studio · /3d-preview · dashboard       │
   /3d-preview          │  R3F 3D · SVG canvas · GLB / 4K capture       │
                        └───────────────────────┬──────────────────────┘
                                                │  proxied at 127.0.0.1:8000
                                                ▼
                        ┌──────────────────────────────────────────────┐
                        │  FastAPI engine  (Python 3.11)                │
                        │  layout solver · Vastu · clause-cited code    │
                        │  structural (IS 456/875/1893) · MEP · BOQ     │
                        │  exporters: DXF · PDF · XLSX · IFC4 (BIM)     │
                        └──────────┬────────────────────┬──────────────┘
                                   │                    │
                                   ▼                    ▼
                  ┌─────────────────────────┐ ┌─────────────────────────┐
                  │  fixtures/ (rule data)  │ │  Shared type contract   │
                  │  jurisdiction rulepacks │ │  packages/shared        │
                  │  w/ source{ref, conf}   │ │  pydantic ⇄ TS ⇄ JSON   │
                  │  Vastu · NBC · rates    │ │  one canonical Plan     │
                  └─────────────────────────┘ └─────────────────────────┘
```

The interesting engineering is the layout solver in `engine/app/generator/designer.py`. Rather than emit one plan, it **sweeps a space of candidate layouts** — varying room bands and placements — and places rooms to satisfy *simultaneous* constraints: Vastu zones (pooja in the NE, master in the SW, a free Brahmasthan), building-code limits (setbacks, FAR, minimum areas), and real-world adjacencies (kitchen next to dining, living at the entrance, ensuite baths in auspicious zones). Each candidate is scored by `_score_candidate`, and the solver keeps the **best** one via a lexicographic ranking tuple — no dropped essential rooms first, then no code failures, then Vastu quality — so the output is the most feasible plan rather than the first one found.

Coordinates are canonical throughout (metres, origin at the plot SW corner, `+x` = East, `+y` = North). The `Plan` schema is defined once as pydantic models in the engine, exported to JSON Schema, and mirrored as TypeScript types in `packages/shared` — so the BOQ is generated from geometry, never typed by hand, and both ends of the stack share one contract.

---

## ⚖️ Jurisdiction rule packs

Building rules live as **data packs**, not code: one JSON file per authority in `fixtures/rulepacks/` (`tg-ghmc`, `tg-ulb-common`, `ap-dpms-common` + `ap-crda`/`ap-tuda`/`ap-vmrda` via `inherits`, and a `ka-legacy` adapter), with the full schema documented in [`fixtures/rulepacks/schema.md`](fixtures/rulepacks/schema.md). A pack carries banded setbacks (`when: {plotAreaSqm, roadWidthM, heightM}`, ranges are `[min, max)`), `heightByRoad` caps, `far` (a number, or `null` for regimes like Telangana's that control the envelope via setbacks + height instead of a separate FAR cap), `coverage`, `parking`, `rwh`, `cornerPlot`, `instantApproval` and an advisory `docChecklist`. Room-level minimums are never duplicated — packs delegate them to the calibrated `fixtures/code_rules.json` baseline.

**The cite-or-flag law (non-negotiable):** every numeric band carries `source: { ref, confidence }` where confidence is `"verified"` or `"needs_verification"`. A wrong legal citation is worse than a flagged one, so *nearly everything ships `needs_verification` by design* — the checker surfaces the citation and the flag on every pack-defined check, and a test (`test_every_setback_band_carries_a_source`) fails the build if a band ever ships without a source.

**Routing:** `resolve_jurisdiction(state, city, ulb_hint=None)` in `engine/app/services/rules.py` resolves the governing rules. TG/AP resolve city → authority pack (e.g. `("TG","Hyderabad")` → `tg-ghmc`, any other TG ULB → `tg-ulb-common`, `("AP","Vijayawada")` → `ap-crda`); an explicit `ulb_hint` (a packId) wins when it names a real pack; KA — and any unknown state — falls back to the legacy `CodeRules` loader on a **bit-identical** path. Packs duck-type the `CodeRules` surface, so the designer and the code checker run unchanged whichever way a brief resolves. Routing works on city *strings* (the UI cascade lives in `fixtures/jurisdictions.json`), so new cities need no enum change.

**How to add a new state:**

1. **Author the pack(s)** — `fixtures/rulepacks/<state>-<authority>.json` per `schema.md`: banded values consistent with published rules, a `source{ref, confidence}` on every numeric band, `inherits` for authority variants over a common state root. Never invent granularity you cannot support.
2. **Add table-driven cases** — extend `fixtures/rulepacks/cases/residential-cases.json` with expected setbacks / height / FAR / instant-tier outputs at the band edges (corner cases included). These are evaluated literally against the pack.
3. **Map the cities** — add `(state, city) → packId` rows (and the state-level fallback) in `resolve_jurisdiction`'s tables in `engine/app/services/rules.py`, plus the wizard cascade in `fixtures/jurisdictions.json` and its web mirror `web/lib/jurisdictions.ts`.
4. **Run the gates** — from `engine/`: `python -m pytest tests/test_rulepacks.py tests/test_scenarios.py` (source-law, inheritance, routing, citation plumbing and the end-to-end scenario matrix must stay green).
5. **Stay flagged until verified** — everything ships `confidence: "needs_verification"` until a human verifies each band against the gazette / G.O. text; only then flip to `"verified"` with the exact instrument named in `ref`.

---

## 🏗️ Structural engine (preliminary, IS-code)

`engine/app/structural/` is a deterministic preliminary RCC design pass over the generated plan: it derives a column grid from the room geometry, runs an IS 875 load takedown, designs two-way slabs, beams, columns and isolated footings to IS 456 (SBC defaulted from the declared soil type per IS 1904 presumptive values), checks the IS 1893 seismic base shear for the city's zone, and emits detailing, a bar-bending schedule and a design-basis document — every member carrying its clause references. A full G+1 design returns ~14 columns, beams, slabs, footings and a 100+-row BBS in well under two seconds, and can size columns/footings for a **declared future floor** (`future_floors`). The arithmetic is pinned by anchor tests against published IS-code worked examples — bands, not exact floats, so a formula regression trips an assertion without false-failing on rounding:

| Anchor (`engine/tests/test_structural.py`) | Input | Pinned band |
|---|---|---|
| Two-way slab | 3.0 × 4.0 m, LL 2.0 kPa, M20/Fe500 | 110–140 mm thick, 8 mm @ 100–200 c/c, utilization ≤ 1.0 |
| Beam | 3.6 m span, 20 kN/m factored | Mu 30–36 kN·m, 230 × 380–450 mm, 2–3 × 12–16 mm bars |
| Column | Interior G+1, 12 m² tributary | Pu 350–650 kN, 230-series section, steel ≥ 0.8% (Cl. 26.5.3.1) |
| Footing | Pu 500 kN on SBC 100 kPa | 1.8–2.2 m square pad, provided area ≥ required |
| Seismic | Hyderabad, G+1, 100 m² | Zone II, Ah 0.01–0.05, base shear 1–5% of seismic weight |

The output is explicitly **preliminary** — "NOT for construction" ships in the model's disclaimer, and the PDF's structural annexe ends in a sign-off block for a licensed structural engineer.

---

## 📦 BIM & exports

Everything the studio shows is exportable — one plan, six formats:

- **IFC4** — a hand-written ISO-10303-21 (STEP) writer with zero dependencies: project/site/building, a storey per floor, an `IfcSpace` per room, deduplicated walls, doors/windows from the opening model, and `IfcColumn`/`IfcFooting` from the structural design. Valid SPF verified structurally (unique ids, balanced references, entity counts); viewer/Revit round-trip is pending verification.
- **DXF (R2010)** — multi-view model space on named layers: per-floor plans, four elevations, the stair section, MEP water/drainage/electrical + fixtures, `STRUCT-GRID` / `STRUCT-COL` / `STRUCT-FOOTING`, and schedules.
- **PDF** — a 10-page municipal-style sheet set: cover, plans, elevations, section, MEP sheets, door/window + finishes + area schedules, Vastu/code/BOQ annexes, the structural design basis, a jurisdiction-aware **municipal title block** with an empty licensed-professional sign-off box, and the authority's document checklist.
- **XLSX** — the GST-aware BOQ plus door/window, finishes, area and MEP schedules.
- **GLB** — the live three.js scene exported via GLTFExporter, for any glTF viewer or DCC tool.
- **4K capture** — a 3840×2160 grab of the real-time WebGL scene. **Honest-render note:** these are real-time captures of the actual walkthrough (PBR materials, HDRI lighting), *not* offline path-traced "photoreal" renders — they are labelled as such in the UI.

---

## 📈 Scaling beyond the lean stack

The current deployment is deliberately lean — a **stateless FastAPI engine** plus an **optional Supabase** (auth, profiles, billing state) — which keeps local runs and portfolio deploys a two-command affair. The production scale-out is designed, not improvised:

- **PostgreSQL + PostGIS** as the system of record for plot geometry, generated plans and spatial queries.
- **Redis + background workers (Celery)** so heavy generation jobs — layout sweeps, drawing sets, exports — run async with job status, retries and backpressure.
- **S3-compatible object storage** for drawing sets, renders and BIM artifacts, served via signed URLs.
- **Rule packs versioned as data** (Vastu, NBC, regional bylaws, rates) with a review pipeline, so domain updates ship without code deploys.

The engine stays stateless either way — scaling out means adding workers, not rewriting the core.

---

## 🧰 Tech stack

**Frontend**
- Next.js 14 (App Router) · React 18 · TypeScript
- Tailwind CSS · Radix UI · `lucide-react` · `sonner`
- Zustand (state) · SVG drag/resize plan canvas

**3D**
- React Three Fiber (`@react-three/fiber`) + `@react-three/drei`
- three.js — real-time orbit-controlled scene

**Backend**
- Python 3.11 · FastAPI · pydantic
- Custom constraint-ranking layout solver (computational geometry)
- `ezdxf` (DXF) · PDF / XLSX exporters · `Decimal` money math (ROUND_HALF_UP)

**Tooling**
- pytest (230+ tests in `engine/tests`, incl. an 8-scenario end-to-end matrix)
- npm workspaces (`web` + `packages/shared`) · `tsc` typecheck
- Docker / docker-compose for container parity

---

## 🚀 Run locally

The repo is two services: a Python **engine** (the compute core) and a Next.js **web** app that proxies it.

### 1. Engine — Python 3.11+

```bash
cd engine
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The engine serves on `http://127.0.0.1:8000` (FastAPI docs at `/docs`). Run the test suite with `python -m pytest -q`.

### 2. Web — Node 18+

```bash
cd web
npm install
npm run dev          # -> http://localhost:3000
```

The web app calls the engine at `NEXT_PUBLIC_ENGINE_URL` (defaults to `http://localhost:8000`), so start the engine first. Then open:

- `http://localhost:3000/` — landing page
- `http://localhost:3000/studio` — AI design wizard
- `http://localhost:3000/3d-preview` — standalone real-time 3D view

---

## 📁 Project structure

```
archiproj/
├── engine/                 # Python FastAPI compute core
│   ├── app/
│   │   ├── main.py         # FastAPI entrypoint (/health, /plan, /vastu, /code, /boq, /export…)
│   │   ├── generator/      # constraint-ranking layout solver (designer.py)
│   │   ├── services/       # Vastu, code+rulepack resolver, BOQ, MEP, elevations, climate
│   │   ├── structural/     # IS 456/875/1893 preliminary RCC design (grid→loads→members→BBS)
│   │   ├── exporters/      # DXF · PDF · XLSX · IFC4
│   │   └── models/         # pydantic Plan / BOQ / report schemas
│   └── tests/              # pytest suite (230+ tests incl. the scenario matrix)
├── web/                    # Next.js 14 app (App Router, TS, Tailwind)
│   └── app/                # routes: / · /studio · /3d-preview · dashboard · projects…
├── packages/shared/        # shared TypeScript types (mirrors the engine's Plan schema)
└── fixtures/               # rule data: rulepacks/ (jurisdictions) · Vastu · code · rates · plans
```

---

## 🎯 What this demonstrates

- **Full-stack TypeScript + Python** — a typed contract shared across two languages, web and compute cleanly separated.
- **Computational geometry & constraint solving** — a candidate-sweeping solver that satisfies competing spatial constraints and ranks for the best feasible layout.
- **Real-time 3D / WebGL** — an interactive three.js scene driven from generated plan data via React Three Fiber.
- **Domain modeling of Indian building norms** — Vastu (Mandala zoning), NBC code rules and regional rate packs encoded as data, not hard-coded prose.
- **Design systems & SaaS UX** — a multi-step design wizard, an editable SVG plan canvas, and client-ready document exports.

---

## 🧑‍⚖️ Legal positioning

The product line Vastukala AI never crosses: **it prepares, it never approves.**

- **Sign-off-ready, never approved.** No output is ever presented as a sanctioned, stamped or approval-ready drawing. The PDF title block ships with an *empty* sign-off box; the sanction package is watermarked preliminary. The tool automates the drudgework *before* the professional, not the professional.
- **Licensed-professional workflow.** Statutory submission in India requires a COA-registered architect / licensed engineer or town planner (LTP) — the workflow is built around handing them a complete, reviewable package: clause-cited code report, structural design basis, document checklist, editable CAD/BIM.
- **The `needs_verification` law.** Every legal value in the rule packs carries a source and a confidence flag, and stays `needs_verification` until a human verifies it against the current gazette / G.O. for the specific plot. The UI and reports surface the flag rather than hiding it — a wrong legal citation is worse than a flagged one.

---

## ⚠️ Disclaimer

Vastukala AI's outputs are **preliminary design intelligence** — concept layouts, drawings, 3D views and cost estimates meant to accelerate the early design conversation. Everything it produces is **sign-off ready, not signed off**: the Vastu interpretation, building-code checks and cost/BOQ data ship as engineering approximations and **require review and sign-off by a COA-registered architect and a licensed structural engineer**, against the current local bylaws and live market rates, before any statutory submission, construction or commercial use.
