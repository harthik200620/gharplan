"""Canonical residential scenario matrix — end-to-end through the REAL pipeline.

Each test runs one canonical Indian-residential brief through the 5-scheme
generator (``generate_options``), keeps the best scheme (options are sorted
best-first: fewest code fails, then highest Vastu), and asserts the full
output contract on that ONE plan:

* >= N genuinely-distinct option schemes (N per scenario: a tight small-plot
  brief legitimately de-duplicates to fewer — "a brief so tight only one good
  layout exists" is by design, see ``generate_options``),
* chosen plan has zero code fails (except where a scenario notes otherwise),
* preliminary structural design returns >= 4 columns, every member clause-cited,
* PDF starts ``%PDF``, DXF is non-trivial, IFC is an ISO-10303-21 STEP file,
* a Vastu score is present.

Scenario-specific assertions (citations, jurisdiction routing, corner/road
intelligence, polygon envelopes, right-sizing, differentials) sit on top.
"""

from __future__ import annotations

from shapely.geometry import Polygon as ShapelyPolygon

from app.exporters.dxf import build_dxf
from app.exporters.ifc import build_ifc
from app.exporters.pdf import build_pdf
from app.generator.designer import generate_options, generate_plan
from app.models.enums import City, Facing, FinishTier, StateCode
from app.models.export import Branding
from app.models.plan import Plot
from app.services.boq_service import generate_boq
from app.services.rates import get_rates_provider
from app.services.rules import get_boq_rules, resolve_jurisdiction
from app.structural import design_structure

# Room types the code checker treats as virtual / open-site space — allowed in
# the setback margins, so envelope containment binds only the rest.
_VIRTUAL = {
    "brahmasthan", "borewell", "overhead_tank", "parking", "sitout", "courtyard",
    "garden", "service_shaft", "future_expansion", "balcony",
}


def _check(code, rule_id: str):
    matches = [c for c in code.checks if c.rule_id == rule_id]
    assert matches, f"expected a '{rule_id}' check in the report"
    return matches[0]


def _full_contract(options: list[dict], min_options: int = 3) -> tuple[dict, object]:
    """Assert the scenario output contract and return ``(best_option,
    structural_design)`` so each test reuses ONE generated plan throughout."""
    assert len(options) >= min_options, (
        f"expected >= {min_options} distinct schemes, got {len(options)}"
    )
    best = options[0]
    plan, vastu, code = best["plan"], best["vastu"], best["code"]

    # Vastu score present and sane.
    assert vastu.score is not None and 0.0 <= vastu.score <= 100.0

    # Preliminary structural design: a real column grid, every member clause-cited.
    structural = design_structure(plan)
    columns = [m for m in structural.members if m.kind == "column"]
    assert len(columns) >= 4, f"expected >= 4 columns, got {len(columns)}"
    assert all(m.clause_refs for m in structural.members), "member missing IS-code clause refs"

    # Exports on the SAME plan: PDF magic, non-trivial DXF, IFC4 STEP header.
    boq = generate_boq(
        plan, plan.plot.city, FinishTier.standard, get_rates_provider(), get_boq_rules()
    )
    pdf = build_pdf(plan, vastu, code, boq, Branding(studio_name="Scenario QA"), structural=structural)
    assert pdf[:4] == b"%PDF"
    dxf = build_dxf(plan, code, structural=structural)
    assert len(dxf) > 1000
    ifc = build_ifc(plan, structural)
    assert ifc.startswith(b"ISO-10303-21")

    return best, structural


# --------------------------------------------------------------------------- #
# 1. Vijayawada 30x40 E-facing G+1 (AP-CRDA pack, strict Vastu)
# --------------------------------------------------------------------------- #
def test_scenario_vijayawada_g1_strict_vastu():
    # The City enum has no Vijayawada member yet: resolve the jurisdiction by
    # STRING (the resolver routes on city strings so future cities just work)
    # and anchor the Plot on Tirupati, passing the resolved pack explicitly.
    pack = resolve_jurisdiction("AP", "Vijayawada")
    assert pack.pack_id == "ap-crda"
    assert pack.far_allowed() == 1.75  # CRDA inherits the AP DPMS numeric FAR

    plot = Plot(
        width_m=9.144, depth_m=12.192, facing=Facing.E,
        state=StateCode.AP, city=City.Tirupati, floors=2,
    )
    options = generate_options(3, plot, floors=2, code_rules=pack)
    best, _ = _full_contract(options)
    plan, code = best["plan"], best["code"]

    assert code.summary.fail_count == 0
    assert {r.floor for r in plan.rooms} == {0, 1}

    # The numeric AP FAR cap is enforced (not the TG "no separate cap" path).
    far = _check(code, "far")
    assert far.status == "pass"
    assert far.required == "<= 1.75"

    # Cite-or-flag law: pack-defined checks carry clause citations.
    cited = [c for c in code.checks if c.citation]
    assert cited, "expected >= 1 clause-cited check from the AP-CRDA pack"
    assert all(c.confidence in ("verified", "needs_verification") for c in cited)

    # Strict-Vastu brief: the winning scheme scores well clear of the floor.
    assert best["vastu"].score >= 70.0


# --------------------------------------------------------------------------- #
# 2. GHMC corner plot, N-facing G+2 duplex on a 12 m road
# --------------------------------------------------------------------------- #
def test_scenario_ghmc_corner_g2_duplex():
    pack = resolve_jurisdiction("TG", "Hyderabad")
    assert pack.pack_id == "tg-ghmc"

    plot = Plot(
        width_m=18.29, depth_m=12.19, facing=Facing.N,
        state=StateCode.TG, city=City.Hyderabad, floors=3,
        corner_plot=True, road_widths_m={"N": 12.0},
    )
    options = generate_options(4, plot, floors=3, code_rules=pack)
    best, _ = _full_contract(options)
    code = best["code"]

    # Corner-plot conservatism (v1, by design): the checker applies the GHMC
    # second-frontage rule — front setback on BOTH flanks — while the generator
    # envelope is corner-unaware, so the flank strip deterministically flags as
    # the ONE failing check. That is the reviewer surface working as intended;
    # everything else on the report passes.
    failing = {c.rule_id for c in code.checks if c.status == "fail"}
    assert failing == {"setbacks"}
    assert code.summary.fail_count == 1

    setbacks = _check(code, "setbacks")
    assert "Corner plot" in setbacks.message and "second frontage" in setbacks.message

    # 12 m abutting road lands in the [12, inf) band: 18 m envelope, G+2 passes.
    height = _check(code, "height_vs_road")
    assert height.status == "pass"
    assert height.required == "<= 18.0 m"

    # 223 m2 plot >= 200 m2: the RWH mandate fires (and the MEP plan satisfies it).
    assert _check(code, "rwh_mandate").status == "pass"

    # Three storeys, with a DIFFERENTIATED top floor (home office or terrace),
    # and the master suite kept intact upstairs.
    plan = best["plan"]
    assert {r.floor for r in plan.rooms} == {0, 1, 2}
    top = [r for r in plan.rooms if (r.floor or 0) == 2]
    has_office = any(r.id == "home_office" and r.type.value == "study" for r in top)
    has_terrace = any(r.id == "terrace" and r.type.value == "balcony" for r in top)
    assert has_office or has_terrace, "top floor was cloned without differentiation"
    assert any(r.type.value == "master_bedroom" for r in top)


# --------------------------------------------------------------------------- #
# 3. Warangal irregular pentagon plot (tg-ulb-common pack)
# --------------------------------------------------------------------------- #
PENTAGON = [(0.0, 0.0), (12.0, 0.0), (12.0, 8.5), (6.0, 12.4), (0.0, 8.5)]


def test_scenario_warangal_irregular_pentagon():
    pack = resolve_jurisdiction("TG", "Warangal")
    assert pack.pack_id == "tg-ulb-common"  # non-GHMC ULBs share the common pack

    plot = Plot(
        width_m=12.0, depth_m=12.4, facing=Facing.E,
        state=StateCode.TG, city=City.Hyderabad, floors=1, polygon=PENTAGON,
    )
    options = generate_options(2, plot, code_rules=pack)
    # The inscribed-rect envelope is tight: two genuinely-distinct schemes survive.
    best, _ = _full_contract(options, min_options=2)
    plan, code, meta = best["plan"], best["code"], best["meta"]

    assert code.summary.fail_count == 0

    # Polygon-mode meta surface.
    assert meta["polygonMode"].startswith("v1-inscribed-rect")
    assert 0.0 < meta["envelopeUtilization"] <= 1.0

    # Every REAL room lies inside the inset envelope polygon.
    env = ShapelyPolygon(meta["envelopePolygon"]).buffer(1e-6)
    real = [r for r in plan.rooms if r.type.value not in _VIRTUAL]
    assert real, "expected enclosed rooms on the pentagon"
    for r in real:
        assert ShapelyPolygon(r.polygon).within(env), (
            f"room '{r.id}' escapes the buildable envelope polygon"
        )

    # The surveyed boundary survives into the plan for the exporters.
    assert plan.plot.polygon is not None and len(plan.plot.polygon) == len(PENTAGON)


# --------------------------------------------------------------------------- #
# 4. Tirupati 20x30 ft 2BHK (ap-tuda pack, small-plot stress)
# --------------------------------------------------------------------------- #
def test_scenario_tirupati_20x30_2bhk():
    pack = resolve_jurisdiction("AP", "Tirupati")
    assert pack.pack_id == "ap-tuda"

    plot = Plot(
        width_m=6.10, depth_m=9.14, facing=Facing.E,
        state=StateCode.AP, city=City.Tirupati, floors=1,
    )
    options = generate_options(2, plot, code_rules=pack)
    # ~27 m2 buildable envelope: one good layout exists; de-dup is honest about it.
    best, _ = _full_contract(options, min_options=1)

    assert best["code"].summary.fail_count == 0
    # Right-sizing engaged rather than cramming an illegal 2BHK onto 55.8 m2.
    assert best["meta"]["downscaled"] is True
    assert _check(best["code"], "far").required == "<= 1.75"  # TUDA inherits AP DPMS


# --------------------------------------------------------------------------- #
# 5. West-facing strict-Vastu 3BHK (KA legacy rules)
# --------------------------------------------------------------------------- #
def test_scenario_west_facing_strict_vastu():
    plot = Plot(
        width_m=9.144, depth_m=12.192, facing=Facing.W,
        state=StateCode.KA, city=City.Bengaluru, floors=1,
    )
    options = generate_options(3, plot, vastu_priority=True)
    best, _ = _full_contract(options)

    assert best["code"].summary.fail_count == 0
    assert best["vastu"].score >= 55.0, "W-facing strict-Vastu brief must stay above 55"

    livings = [r for r in best["plan"].rooms if r.type.value == "living"]
    assert livings
    assert all(r.zone.value != "SW" for r in livings), "living must never sit in the SW zone"


# --------------------------------------------------------------------------- #
# 6. TS-bPASS instant-approval tier (59.5 m2 <= 75 sq yd, single storey)
# --------------------------------------------------------------------------- #
def test_scenario_tsbpass_instant_tier():
    pack = resolve_jurisdiction("TG", "Hyderabad")
    plot = Plot(
        width_m=7.0, depth_m=8.5, facing=Facing.E,
        state=StateCode.TG, city=City.Hyderabad, floors=1,
    )
    options = generate_options(2, plot, code_rules=pack)
    # A 30 m2 envelope admits exactly one good scheme after de-duplication.
    best, _ = _full_contract(options, min_options=1)

    assert best["code"].summary.fail_count == 0
    # 59.5 m2 <= 62.71 m2 (75 sq yd) and est. height 4.0 m <= 7 m: the tier fires.
    instant = _check(best["code"], "instant_approval")
    assert instant.status == "pass"
    assert "62.71" in instant.required


# --------------------------------------------------------------------------- #
# 7. Future vertical expansion: columns sized for a declared extra floor
# --------------------------------------------------------------------------- #
def test_scenario_future_expansion_columns():
    plot = Plot(
        width_m=9.144, depth_m=12.192, facing=Facing.E,
        state=StateCode.KA, city=City.Bengaluru, floors=2,
    )
    options = generate_options(3, plot, floors=2)
    best, base = _full_contract(options)  # base = design_structure(plan), future_floors=0
    assert best["code"].summary.fail_count == 0

    future = design_structure(best["plan"], future_floors=1)
    assert future.future_floor_provision and not base.future_floor_provision

    def max_col_ag(design) -> float:
        return max(m.size_mm[0] * m.size_mm[1] for m in design.members if m.kind == "column")

    def max_col_pu(design) -> float:
        return max(m.design_forces["Pu_kN"] for m in design.members if m.kind == "column")

    # The provision holds: sections never shrink, and the governing column is
    # actually designed for the heavier future load takedown.
    assert max_col_ag(future) >= max_col_ag(base)
    assert max_col_pu(future) > max_col_pu(base)


# --------------------------------------------------------------------------- #
# 8. AP vs TG differential: one brief, two materially different code regimes
# --------------------------------------------------------------------------- #
def test_scenario_ap_vs_tg_differential():
    ap_pack = resolve_jurisdiction("AP", "Kurnool")
    tg_pack = resolve_jurisdiction("TG", "Warangal")
    assert ap_pack.pack_id == "ap-dpms-common"  # non-authority AP ULBs
    assert tg_pack.pack_id == "tg-ulb-common"

    # Identical ~10 x 12.5 m 2BHK brief under both regimes. (10.0 x 12.0 exactly
    # trips a known VastuGridPacker overlap assertion on the AP program mix —
    # tracked engine bug, independent of the jurisdiction differential probed here.)
    def _plot(state: StateCode, city: City) -> Plot:
        return Plot(width_m=10.0, depth_m=12.5, facing=Facing.E, state=state, city=city, floors=1)

    options = generate_options(2, _plot(StateCode.AP, City.Tirupati), code_rules=ap_pack)
    best, _ = _full_contract(options, min_options=1)
    ap_code = best["code"]
    assert ap_code.summary.fail_count == 0

    _, _, tg_code, _ = generate_plan(2, _plot(StateCode.TG, City.Hyderabad), code_rules=tg_pack)
    assert tg_code.summary.fail_count == 0

    # The regimes DIFFER materially on the same brief: AP enforces a numeric
    # FAR ceiling; TG models no separate FAR cap (setback/height-controlled).
    ap_far, tg_far = _check(ap_code, "far"), _check(tg_code, "far")
    assert ap_far.required == "<= 1.75"
    assert float(ap_far.required.removeprefix("<= ")) == 1.75
    assert tg_far.required == "no separate FAR cap"
    assert ap_far.required != tg_far.required
