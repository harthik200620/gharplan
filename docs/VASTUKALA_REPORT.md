# Vastukala AI — build closing report

Status report for the "autonomous architect platform" master prompt: what shipped, how it
measures against the Snaptrude benchmark, where it deviates from the acceptance criteria and
why, what is known-limited, and what comes next. Factual; verified against the test suite and
live probes at the time of writing (engine suite: **233 pytest green**, including the
8-scenario end-to-end matrix; `scripts/_quality_probe.py` exit 0 across the KA/TG/AP matrix
plus the scenario spot checks).

---

## 1. What was built

| Phase | Commit | Delivered |
|---|---|---|
| P0 — Rebrand + baseline repair | `adad226` | GharPlan → **Vastukala AI** (user-visible strings; package/env internals unchanged). Plot-v2 schema (polygon, per-edge road widths, corner flag, soil type) and the citation/confidence fields. Repaired a broken HEAD: PDF export crash (Decimal/float), refine-edit dropping, ribbon-living regression, BOQ contingency/labour factors made data-driven, demo-mode build guards. |
| P1 — Rule-pack data | `db656a0` | `fixtures/rulepacks/`: 7 jurisdiction packs (`tg-ghmc`, `tg-ulb-common`, `ap-dpms-common` + `ap-crda`/`ap-tuda`/`ap-vmrda` via `inherits`, `ka-legacy`), `schema.md` contract, 31 table-driven expectation cases. Every numeric band carries `source{ref, confidence}` — 49/49 `needs_verification` by design. |
| P1 — Resolver + citations | `c4c910f` | `resolve_jurisdiction(state, city, ulb_hint)`; `JurisdictionPack` duck-types the `CodeRules` surface so designer + checker run unchanged; KA stays on the legacy loader bit-identical. Checks now carry `citation`/`confidence`; TG's null FAR renders as an explained "no separate FAR cap" check; new pack-only checks: `height_vs_road`, `rwh_mandate`, `instant_approval` (TS-bPASS ≤ 75 sq yd / ≤ 7 m), corner-plot second-frontage (conservative). |
| P3 — Structural engine | `c8614d2` | `engine/app/structural/`: deterministic IS 456 / IS 875 / IS 1893 preliminary RCC design — grid from room geometry, load takedown, slabs/beams/columns/footings, seismic base shear, detailing, bar-bending schedule, design basis; SBC from declared soil type (IS 1904 presumptive); future-floor provision. Anchor tests pin the arithmetic to bands from published worked examples. `POST /plan/structural` + Structure tab. |
| P2 — Polygon plots + G+3 | `ebe9e89` | Surveyed-boundary support: uniform conservative inset + largest inscribed rectangle feeds the unchanged packer (`polygonMode`, `envelopeUtilization` meta; DXF/PDF draw the true boundary). G+2/G+3 with a differentiated top floor (home-office study or terrace — never a verbatim clone), floors capped at 4. |
| P5 — MEP intelligence | `245068e` | Wire sizing per MCB rating, service-load summary (connected/demand kW, diversity, 1φ/3φ recommendation), IS 2470-1 septic sizing from occupancy, HVAC tonnage per room, NBC Part-4 fire checklist — mirrored in lock-step between `mep_model.py` and `web/lib/mep.ts`. |
| P4 — BIM + export set | `3d65cf6` | Hand-written **IFC4** (ISO-10303-21 SPF) writer with zero dependencies: storey per floor, `IfcSpace` per room, deduplicated walls, doors/windows, `IfcColumn`/`IfcFooting` from the structural design; `POST /export/ifc`. DXF gains `STRUCT-*` layers; PDF gains the structural design-basis annexe + a jurisdiction-aware municipal title block with an empty licensed-professional sign-off box + the authority document checklist. Web: GLB export (three.js GLTFExporter) and 4K real-time capture. |
| P5/P6 — Report card + wizard v2 | `811117a` | Clause-cited printable compliance report card replacing the flat check list; wizard v2 with the jurisdiction cascade (`fixtures/jurisdictions.json` + `ulbHint`, so ULBs beyond the 4-city enum route correctly), road-width/corner/soil inputs, and an SVG polygon plot editor. |
| P7 — Sign-off workflow | `8b881bb` | Reviewer workflow: SHA-256 plan-version hash with lock/unlock, reviewer identity + registration + stamp upload, an 8-point professional review checklist, localStorage-first persistence with a best-effort Supabase mirror, and a client-side sanction-package ZIP (PDF+DXF+IFC+REVIEW.txt+DISCLAIMER.txt+stamp) gated on checklist-complete — else watermarked `*_PRELIMINARY.zip`. |
| P8 — Scenarios + docs (this commit) | *this commit* | `engine/tests/test_scenarios.py` (8 canonical residential end-to-end scenarios, full output contract per scenario), `_quality_probe.py` SCENARIO SPOT section, README sections (rule packs / structural / BIM / legal positioning), this report. |

---

## 2. Benchmark vs Snaptrude

Snaptrude is the natural commercial benchmark: a browser-based, AI-assisted
concept-to-BIM platform. The comparison below is honest about direction-of-advantage.

| Capability | Snaptrude | Vastukala AI | Advantage |
|---|---|---|---|
| Site analysis / zoning | Site context + zoning/FAR feasibility for supported regions | Jurisdiction **rule packs with clause citations and confidence flags** (GHMC / TG ULB / AP DPMS·CRDA·TUDA·VMRDA / KA), height-vs-road, RWH mandate, corner second-frontage, TS-bPASS instant tier | Vastukala for TG/AP-specific statutory depth + cite-or-flag honesty; Snaptrude for breadth of regions |
| Concept → BIM | Sketch/massing → BIM elements; mature editing UX | Brief (form or natural language) → full plan → **IFC4** with spaces, walls, openings, structural members | Split: Snaptrude's modelling UX is far richer; Vastukala goes brief-to-BIM with zero drawing effort |
| Generative design | Generative massing / space-plan options | **5-scheme generator** (Vastu-first / climate / courtyard / modern / multigen) through one constraint-ranking solver, de-duplicated, best-first | Comparable intent; Vastukala adds Vastu + Indian-code constraints natively |
| Code compliance | Regional zoning/building parameters for supported geographies | Clause-cited pass/warn/fail checks incl. jurisdiction extras; every pack value carries source + confidence | Vastukala within its 3 states; Snaptrude globally |
| Structural | Not a structural design tool | **IS-code preliminary RCC design** (members, BBS, seismic check, design basis) with clause refs | Vastukala (unique in this class) |
| Costing | BOQ/quantity takeoffs | Geometry-derived, GST-aware BOQ on regional 2025-26 rate data (flagged indicative) | Comparable; Vastukala adds GST/regional framing, Snaptrude broader material libraries |
| MEP | Limited | Routing + wire sizing, service load, septic sizing, HVAC tonnage, fire checklist (advisory) | Vastukala for Indian residential heuristics; neither is an MEP design suite |
| Vastu | None | Native: Mandala-zone solver constraint + 0-100 scored report | Vastukala |
| Collaboration | **Real-time multi-user** editing, comments, teams | Single-user; a structured **sign-off workflow** (reviewer identity, stamp, hash-locked version, sanction-package ZIP) hands off to a professional rather than co-editing | **Snaptrude, clearly** |
| Revit interop | **Bidirectional Revit sync** | One-way IFC4 export; Revit round-trip not yet verified | **Snaptrude, clearly** |
| Rendering | Integrations / higher-quality viz pipeline | Real-time WebGL walkthrough + honest 4K captures (labelled real-time, not photoreal) | **Snaptrude** for output quality; Vastukala is honest about what it renders |
| Platform maturity | Commercial SaaS, teams, imports, support | Portfolio-grade two-service app (Next.js + FastAPI), demo mode, lean deploy | **Snaptrude** |

Net: Vastukala AI does not compete with Snaptrude as a general BIM authoring platform. Its
edge is a **vertical slice for Indian residential**: brief → Vastu-aware plan → clause-cited
local-code report → preliminary IS-code structural → BOQ → municipal-style document set →
IFC4, with legal honesty built into the data model. Snaptrude is ahead wherever breadth,
collaboration, interop or rendering pipelines matter.

---

## 3. Acceptance criteria vs the master prompt

| Criterion | Status | Notes |
|---|---|---|
| Autonomous brief → full design (plan, drawings, 3D, costs) | Shipped | `/studio` wizard or NL brief → options → CAD set, 3D, BOQ, exports |
| Multi-scheme generation | Shipped | Up to 5 distinct schemes, best-first, honest de-dup (tight briefs return fewer — asserted in the scenario matrix) |
| Jurisdiction-aware code checks with citations | Shipped | Resolver + packs; every pack check carries citation + confidence |
| Preliminary structural design to IS codes | Shipped | Anchor-tested; clause refs on every member; explicit NOT-for-construction disclaimer |
| Irregular/polygon plots | Shipped (v1) | Conservative inset + largest inscribed rect; utilization surfaced in meta |
| G+2/G+3 with differentiated floors | Shipped | Top-floor home-office/terrace differentiation, master suite preserved |
| MEP intelligence | Shipped | Advisory sizing/heuristics, not detailed MEP engineering |
| BIM export (IFC) opens in Revit | **Adapted** | IFC4 SPF is structurally verified (header/schema, unique ids, balanced refs, entity counts vs the model; ifcopenshell round-trip exercised out-of-band). Viewer/Revit round-trip **pending verification** — not claimed. |
| Photorealistic renders | **Adapted** | Owner decision: **labelled real-time 4K** WebGL captures (PBR + HDRI) instead of offline photoreal; no false "render farm" claims |
| 12 canonical scenarios | **Adapted** | **8 residential scenarios shipped** (`engine/tests/test_scenarios.py`) per the residential-first depth decision; apartment/commercial scenarios deferred with that scope |
| 60 fps walkthrough | **Not instrumented** | The real-time walkthrough ships and is responsive on the dev machine; no fps telemetry or performance budget exists yet |
| Sign-off / sanction package workflow | Shipped | Reviewer identity + checklist + stamp, plan-hash lock, sanction-package ZIP (`*_PRELIMINARY.zip` until checklist-complete) |
| Full suite green | Shipped | 233 pytest (225 baseline + 8 scenarios); quality probe exit 0 with scenario spot checks |

### The 8 shipped scenarios (each asserts the full output contract: option count → best plan zero code fails unless noted → structural ≥ 4 clause-cited columns → PDF/DXF/IFC bytes → Vastu score)

1. **Vijayawada 30×40 E G+1** — routes to `ap-crda` by city string; numeric FAR 1.75 enforced (`<= 1.75`, pass); 5 clause-cited checks; Vastu 92.5.
2. **GHMC corner G+2 duplex, 12 m road** — `height_vs_road` pass (≤ 18 m band), RWH mandate fires (223 m² ≥ 200), top floor differentiated (home office), and the **one** failing check is the corner second-frontage setback — the conservative reviewer surface (see limitations).
3. **Warangal irregular pentagon** — `tg-ulb-common`; inscribed-rect envelope, utilization 0.81, every real room provably inside the envelope polygon (shapely), zero fails.
4. **Tirupati 20×30 ft** — `ap-tuda`; right-sizing engages (downscaled honest tier) instead of an illegal cram; zero fails.
5. **West-facing strict Vastu 3BHK (KA)** — score 81.1 (≥ 55 floor), living never in the SW zone.
6. **TS-bPASS instant tier** — 59.5 m² ≤ 62.71 m² (75 sq yd) and ≤ 7 m: the `instant_approval` check appears and passes; zero fails.
7. **Future vertical expansion** — `design_structure(plan, future_floors=1)` flags the provision and designs the governing column for the heavier takedown (Pu strictly increases; section never shrinks).
8. **AP vs TG differential** — identical 2BHK brief under `ap-dpms-common` vs `tg-ulb-common`: AP reports a numeric FAR cap (`<= 1.75`), TG reports `no separate FAR cap` — the regimes differ materially and the reports say so.

---

## 4. Known limitations

- **All legal bands are `needs_verification`** (49/49 by design). Nothing has been verified against a live gazette/G.O. text; the flags and disclaimers are the product's honesty mechanism, not an afterthought. Do not rely on any band without professional verification.
- **Polygon packing is v1 inscribed-rect**: an irregular boundary is inset uniformly by the **maximum** setback (conservative on every edge, not per-edge) and the packer works the largest inscribed axis-aligned rectangle — envelope area outside that rectangle is unused (utilization is surfaced in meta, e.g. 0.81 on the pentagon fixture).
- **Corner plots flag by design**: the checker applies the second-frontage rule conservatively (front setback on *both* flanks) while the generator's envelope is corner-unaware — so a corner-plot brief deterministically reports one `setbacks` fail on the flank strip. Scenario 2 encodes this as expected behavior; a corner-aware envelope is roadmap work.
- **Packer edge case (tracked bug)**: a 10.0 × 12.0 m single-floor 2BHK under the AP program mix trips an internal overlap assertion (`living`/`stair`, ~0.23 m²) instead of skipping the candidate. Nearby dimensions (10.0 × 12.5) are unaffected; scenario 8 documents the deviation.
- **No OCR / document intake** — no parsing of scanned sale deeds, sketches or survey PDFs; plot geometry is typed or drawn.
- **No slope handling** — `slope_note` is carried but there is no cut/fill, stepped-plinth or contour logic.
- **Single-user** — no realtime collaboration or concurrent editing; the sign-off workflow is a structured hand-off, not multi-user presence.
- **Rendering is real-time only** — no path-traced/offline pipeline; 4K captures are labelled as real-time.
- **Walkthrough performance is not instrumented** — no fps counter or perf budget.
- **Rates are indicative** — researched 2025-26 composite ballparks, `verify: true` throughout; a QS must re-rate before quoting.

---

## 5. Roadmap

1. **Citation verification pass** — work through the 49 `needs_verification` bands against the actual G.O./gazette texts (a WebSearch-assisted review pass), flipping to `verified` only with the exact instrument in `ref`; publish a verification changelog.
2. **Apartments + commercial** — extend the program/typology model beyond individual residential (the deferred master-prompt scope), including group-housing parking norms and the fire/NOC regime that starts binding at those scales.
3. **Jurisdiction depth then breadth** — KA depth first (BBMP/BDA zonal regulations as a real pack rather than the legacy adapter), then TN and MH packs on the same schema + case-table discipline.
4. **Photoreal API** — optional server-side photoreal rendering (path-traced or a hosted render API) alongside the honest real-time captures.
5. **Reviewer multi-user** — grow the sign-off workflow into concurrent review (comments, statuses, plan-hash audit trail) — the collaboration gap vs Snaptrude.
6. **Engineering hygiene** — fix the 10×12 AP packer overlap bug; corner-aware generator envelope; per-edge polygon insets (v2 of polygon mode); verify the IFC in Revit/BIM viewers and close the round-trip claim; instrument walkthrough fps.
