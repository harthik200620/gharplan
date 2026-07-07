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
- **NBC building-code checks** — plot coverage, FAR, setbacks, minimum room areas/dimensions, ventilation and stair widths are validated against National Building Code / local-bylaw rules.
- **2D CAD drawing set** — generates floor plans, four elevations and a building section with layers, dimensions, labels, a north arrow and a title block; exports to DXF.
- **Live 3D walkthrough** — a real-time React Three Fiber (three.js) scene renders the generated home with hip/gable roofs, columns, compound walls and landscaping, orbit-controlled in the browser.
- **MEP coordination** — a coordination pass models electrical/plumbing routing over the plan geometry.
- **BOQ & cost estimate** — an itemized, GST-aware Bill of Quantities is computed *directly from room geometry* (wall lengths, areas, door/window deductions), priced against a rate database.
- **Client-ready exports** — a branded proposal PDF, the DXF CAD file and an XLSX BOQ, ready to hand to a client.
- **Multi-region rule packs** — Karnataka, Telangana and Andhra Pradesh (KA / TG / AP), each with its own code and rate data.

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
   /3d-preview          │  React Three Fiber 3D · SVG canvas · exports  │
                        └───────────────────────┬──────────────────────┘
                                                │  proxied at 127.0.0.1:8000
                                                ▼
                        ┌──────────────────────────────────────────────┐
                        │  FastAPI engine  (Python 3.11)                │
                        │  layout solver · Vastu · NBC code · BOQ       │
                        │  MEP · elevations/section · DXF/PDF/XLSX       │
                        └───────────────────────┬──────────────────────┘
                                                │
                                                ▼
                        ┌──────────────────────────────────────────────┐
                        │  Shared type contract                         │
                        │  packages/shared  ·  pydantic ⇄ TS ⇄ JSON     │
                        │  one canonical Plan schema, both sides typed   │
                        └──────────────────────────────────────────────┘
```

The interesting engineering is the layout solver in `engine/app/generator/designer.py`. Rather than emit one plan, it **sweeps a space of candidate layouts** — varying room bands and placements — and places rooms to satisfy *simultaneous* constraints: Vastu zones (pooja in the NE, master in the SW, a free Brahmasthan), building-code limits (setbacks, FAR, minimum areas), and real-world adjacencies (kitchen next to dining, living at the entrance, ensuite baths in auspicious zones). Each candidate is scored by `_score_candidate`, and the solver keeps the **best** one via a lexicographic ranking tuple — no dropped essential rooms first, then no code failures, then Vastu quality — so the output is the most feasible plan rather than the first one found.

Coordinates are canonical throughout (metres, origin at the plot SW corner, `+x` = East, `+y` = North). The `Plan` schema is defined once as pydantic models in the engine, exported to JSON Schema, and mirrored as TypeScript types in `packages/shared` — so the BOQ is generated from geometry, never typed by hand, and both ends of the stack share one contract.

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
- pytest (100+ tests in `engine/tests`)
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
│   │   ├── services/       # Vastu, code, BOQ, MEP, elevations, structural, climate
│   │   ├── exporters/      # DXF · PDF · XLSX
│   │   └── models/         # pydantic Plan / BOQ / report schemas
│   └── tests/              # pytest suite (100+ tests)
├── web/                    # Next.js 14 app (App Router, TS, Tailwind)
│   └── app/                # routes: / · /studio · /3d-preview · dashboard · projects…
├── packages/shared/        # shared TypeScript types (mirrors the engine's Plan schema)
└── fixtures/               # sample plans, rule data, seed rates
```

---

## 🎯 What this demonstrates

- **Full-stack TypeScript + Python** — a typed contract shared across two languages, web and compute cleanly separated.
- **Computational geometry & constraint solving** — a candidate-sweeping solver that satisfies competing spatial constraints and ranks for the best feasible layout.
- **Real-time 3D / WebGL** — an interactive three.js scene driven from generated plan data via React Three Fiber.
- **Domain modeling of Indian building norms** — Vastu (Mandala zoning), NBC code rules and regional rate packs encoded as data, not hard-coded prose.
- **Design systems & SaaS UX** — a multi-step design wizard, an editable SVG plan canvas, and client-ready document exports.

---

## ⚠️ Disclaimer

Vastukala AI's outputs are **preliminary design intelligence** — concept layouts, drawings, 3D views and cost estimates meant to accelerate the early design conversation. Everything it produces is **sign-off ready, not signed off**: the Vastu interpretation, building-code checks and cost/BOQ data ship as engineering approximations and **require review and sign-off by a COA-registered architect and a licensed structural engineer**, against the current local bylaws and live market rates, before any statutory submission, construction or commercial use.
