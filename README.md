# GharPlan

**A Vastu- & building-code-aware Design-to-Cost copilot for Indian residential design/build.**

Draw a plot or room layout → GharPlan checks it against **Vastu** rules and the **National
Building Code / local bylaws**, auto-generates an itemized **GST'd Bill of Quantities
directly from the room geometry**, and exports a client-ready **proposal (PDF)** and a
**CAD file (DXF)**. Built for independent interior designers and small (3–15 person)
design-build / turnkey studios.

> The moat is the **integration through one canonical Plan schema**: the BOQ is generated
> from plan geometry, not typed by hand. Modules stay cleanly separated but wired through
> the single `Plan` contract.

---

## Architecture

```
 Browser ─┬─ Supabase (Auth · Postgres · Storage)        ← auth + project CRUD
          └─ Next.js /web ─┬─ Supabase (server)            ← gating, branding, billing
                           └─ /engine (FastAPI)            ← compute: vastu, code, BOQ, exports
                                  └─ /fixtures (rules + rates)   ← editable domain data
 Payments: Razorpay (credits + subscription, gated server-side)
```

| Path | What | Status |
|------|------|--------|
| `engine/` | Python 3.11+ FastAPI compute core (validate, **Vastu**, code, **BOQ-from-geometry**, DXF/PDF/XLSX, generator) | **runs + 84 tests green** |
| `packages/shared/` | Canonical Plan/BOQ/report **TS types** + generated **JSON Schema** + constants | done |
| `fixtures/` | Sample plans, **seed rates**, Vastu / code / BOQ **rule data**, generator templates | done |
| `web/` | Next.js 14 app — auth, dashboard, **5-step wizard** (canvas + table), live overlays, editable BOQ, exports, billing | authored |
| `supabase/schema.sql` | Postgres schema + RLS + RPCs | done |
| `docker-compose.yml`, `engine/Dockerfile`, `web/Dockerfile` | container parity | done |

The canonical **Plan schema** (coords in metres, origin = plot SW corner, `+x`=East,
`+y`=North) is defined once as pydantic models in `engine/app/models/plan.py`, exported to
`packages/shared/plan.schema.json` (`python scripts/export_schema.py`), and mirrored as TS
types in `packages/shared/src/plan.ts`.

---

## Quick start

### Engine (the runnable, tested core) — Python 3.11+

```bash
cd engine
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt     # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux

python -m pytest -q                 # 84 tests — the M1/M2/M5 gate
python -m uvicorn app.main:app --reload --port 8000
```

Try it:

```bash
# normalize a plan (fills areaSqm / perimeterM / centroid / zone)
curl -X POST localhost:8000/plan/validate -H "Content-Type: application/json" \
  --data @fixtures/sample_plan_30x40_east.json

# Vastu report (score + per-room + fixes)
curl -X POST localhost:8000/vastu/check  -H "Content-Type: application/json" --data @fixtures/sample_plan_30x40_east.json
# preliminary code review
curl -X POST localhost:8000/code/check   -H "Content-Type: application/json" --data @fixtures/sample_plan_30x40_east.json
# GST'd BOQ from geometry
curl -X POST localhost:8000/boq/generate -H "Content-Type: application/json" \
  -d "{\"plan\": $(cat fixtures/sample_plan_30x40_east.json), \"finishTier\": \"standard\"}"
```

Regenerate committed data (reproducible):

```bash
python scripts/build_rates.py        # fixtures/rates/rates_seed.{json,sql}
python scripts/build_templates.py    # fixtures/templates/30x40_E.json
python scripts/export_schema.py      # packages/shared/plan.schema.json
```

### Web (Next.js) — Node 18+

```bash
npm install                          # root (npm workspaces: web + packages/shared)
cp .env.example web/.env.local       # fill Supabase + (optional) Razorpay + engine URL
npm run dev                          # -> http://localhost:3000
npm run typecheck                    # then remove `typescript.ignoreBuildErrors` in next.config.mjs
```

Supabase setup: create a project, run `supabase/schema.sql` in the SQL editor, enable Email
+ Google auth providers, and (optionally) seed the `rates` table with
`fixtures/rates/rates_seed.sql`.

---

## Engine API (v1)

| Method & path | Purpose |
|---|---|
| `GET /health` | liveness + active config |
| `POST /plan/validate` | validate + normalize a Plan to canonical form (422 on bad geometry) |
| `POST /vastu/check` | Plan → per-room pass/warn/fail + 0–100 score + grade + prioritized fixes |
| `POST /code/check` | Plan → coverage, FAR, setbacks, min areas/dims, ventilation, stair width |
| `POST /boq/generate` | Plan (+ city, tier, edits) → itemized GST'd BOQ (CGST/SGST split) |
| `POST /export/dxf` | Plan → DXF (R2010: per-type layers, labels, dims, north arrow, title block) |
| `POST /export/xlsx` | BOQ → Excel |
| `POST /export/pdf` | Plan + Vastu + code + BOQ + branding → client proposal PDF |
| `POST /plan/generate` | **v2 STUB** (feature-flagged): 30×40 East template fitted to the plot; 501 otherwise |

All request/response bodies are typed pydantic models (camelCase JSON). Money is computed in
`Decimal` with ROUND_HALF_UP and reconciles to the paise.

---

## Web flows
Auth (email + Google) → **Dashboard** (projects, credits/subscription) → **Wizard**: ①Plot
→ ②Rooms (drag/resize SVG canvas **and** table; live area/perimeter/zone) → ③Openings →
④Review (zone-shaded overlay + live Vastu & code) → ⑤BOQ (editable: finish tier, false-
ceiling toggles, qty/rate overrides, custom lines) → **Export** (PDF/DXF/XLSX, gated). Plus
**Settings** (studio branding) and **Billing** (Razorpay).

---

## Environment variables
See [`.env.example`](.env.example). Essentials: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_ENGINE_URL`
(browser) / `ENGINE_URL` (server, Docker), and `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
`RAZORPAY_WEBHOOK_SECRET` (billing is optional; the app degrades to 503 without them).
Optional LLM (`LLM_PROVIDER`, `LLM_API_KEY`) for a future brief→rooms helper — the app works
fully without it.

## Tests
- **Engine:** `cd engine && python -m pytest -q` — zone math (8 dirs + boundaries + center),
  geometry, plan normalization, money (half-up vs banker's), **BOQ exact numbers** (synthetic
  fixture) + invariants (30×40 fixture), Vastu (kitchen NE → fail, toilet NE → fail, pooja NE
  → pass), code (under-min-area → fail, setback violation → fail), export validity, generator.
- **Web:** `npm run typecheck` (type safety); Plan is validated by the engine on every submit.

## Deploy (≈zero cost at MVP, free tiers)
- **Web → Vercel** (auto-detects Next.js; set env vars; root = repo, project = `web`).
- **Engine → Railway/Render** (`engine/render.yaml` blueprint or `engine/Procfile`; root = `engine`).
- **DB/Auth/Storage → Supabase** (run `supabase/schema.sql`).
- **Containers:** `docker compose up` (provided for parity; recommended split is the above).

## Scope discipline (non-goals)
No ML floor-plan generation (templates + rules only); no native DWG (DXF only); no
structural/MEP/fire/energy calc; no 3D; coverage limited to KA/MH/TG; **never** outputs
"approval-ready" / "stamped" drawings.

## ⚠️ Before you sell
Rates, bylaws, the Vastu table, HSN/GST and pricing all ship as **indicative placeholders**
(`TODO(human)`). **Read [`docs/VERIFY_BEFORE_SELLING.md`](docs/VERIFY_BEFORE_SELLING.md)** and
verify each with the right professional first.
