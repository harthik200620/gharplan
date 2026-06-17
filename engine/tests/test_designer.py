"""Deterministic Vastu-aware floor-plan generator (app.generator.designer).

Covers the realistic-Indian-home rework:
  * RIGHT-SIZING — the buildable footprint picks the largest sensible tier
    (Studio / 1BHK / 2BHK / 3BHK / 4BHK); a too-large requested bhk DOWNSCALES.
  * ATTACHED BATHROOMS — every bedroom in a 2BHK+ gets its OWN toilet sharing an
    edge, and NO standalone common toilet (owner brief: ensuite baths only).
  * Geometry stays valid (axis-aligned, non-overlapping, inside the envelope),
    Vastu stays sound (key rooms in their sectors, baths never NE), code-clean.

Plans are asserted for 30x40-ft KA (the canonical BBMP site), a larger KA/AP plot
that genuinely fits a 3BHK, a tiny studio plot, and the AP (Tirupati) ruleset.
"""

from __future__ import annotations

import pytest
from shapely.geometry import box

from app.generator.designer import (
    _envelope_and_keepout,
    build_program,
    buildable_footprint_sqm,
    generate_plan,
    resolve_tier,
)
from app.models.plan import Plot
from app.services.code_service import check_code
from app.services.plan_service import normalize
from app.services.rules import get_code_rules, get_vastu_rules

# 30x40 ft in metres (the canonical Bengaluru site).
W30x40 = 9.144
D30x40 = 12.192

# Rooms that must always be placed for the EFFECTIVE (right-sized) tier; dropping
# one means the brief is unmet. Optional service rooms (utility, entrance, dining,
# pooja) may be dropped on a tight plot.
ESSENTIAL_TYPES = {
    "master_bedroom",
    "bedroom",
    "childrens_bedroom",
    "living",
    "kitchen",
    "toilet",
    "staircase",
}

SITE_OR_VIRTUAL_TYPES = {
    "parking",
    "sitout",
    "courtyard",
    "garden",
    "service_shaft",
    "future_expansion",
    "balcony",
    "overhead_tank",
    "borewell",
    "brahmasthan",
}


def _plot(bhk_state="KA", city="Bengaluru", facing="E", w=W30x40, d=D30x40):
    return Plot.model_validate(
        {
            "widthM": w,
            "depthM": d,
            "facing": facing,
            "state": bhk_state,
            "city": city,
            "floors": 1,
        }
    )


def _bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return (min(xs), min(ys), max(xs), max(ys))


def _no_overlaps(plan) -> None:
    # Overlap is only a conflict WITHIN a floor; stacked floors of a G+1 share the
    # same footprint by design, so compare rooms floor-by-floor.
    by_floor: dict[int, list] = {}
    for r in plan.rooms:
        by_floor.setdefault(r.floor or 0, []).append(r)
    for fl, rooms in by_floor.items():
        polys = [box(*_bbox(r.polygon)) for r in rooms]
        for i in range(len(polys)):
            for j in range(i + 1, len(polys)):
                inter = polys[i].intersection(polys[j]).area
                assert inter < 1e-6, (
                    f"rooms {rooms[i].id} & {rooms[j].id} (floor {fl}) overlap by {inter:.4f} m2"
                )


def _all_rectangles(plan) -> None:
    """Every room is an axis-aligned rectangle (4 distinct corners, right angles).
    The 2D/3D renderers draw bounding rectangles, so non-rectangular rooms are
    forbidden — the guillotine-split baths must keep this invariant."""
    for r in plan.rooms:
        ring = r.polygon[:-1] if r.polygon[0] == r.polygon[-1] else r.polygon
        xs = sorted({round(p[0], 6) for p in ring})
        ys = sorted({round(p[1], 6) for p in ring})
        assert len(ring) == 4 and len(xs) == 2 and len(ys) == 2, (
            f"room {r.id} is not an axis-aligned rectangle: {r.polygon}"
        )


def _within_envelope(plan, env) -> None:
    minx, miny, maxx, maxy = env
    for r in plan.rooms:
        if r.type.value in SITE_OR_VIRTUAL_TYPES:
            continue
        x0, y0, x1, y1 = _bbox(r.polygon)
        assert x0 >= minx - 1e-6 and y0 >= miny - 1e-6
        assert x1 <= maxx + 1e-6 and y1 <= maxy + 1e-6


def _share_edge(a, b, tol=0.05) -> bool:
    """True when rectangles a and b share a wall segment of non-trivial length."""
    ax0, ay0, ax1, ay1 = _bbox(a.polygon)
    bx0, by0, bx1, by1 = _bbox(b.polygon)
    # vertical shared wall
    if (abs(ax1 - bx0) < tol or abs(bx1 - ax0) < tol) and (
        min(ay1, by1) - max(ay0, by0) > 0.4
    ):
        return True
    # horizontal shared wall
    if (abs(ay1 - by0) < tol or abs(by1 - ay0) < tol) and (
        min(ax1, bx1) - max(ax0, bx0) > 0.4
    ):
        return True
    return False


def _effective_tier(plot, bhk):
    foot = buildable_footprint_sqm(plot, get_code_rules())
    return resolve_tier(bhk, foot)[0]


def _expected_essentials_present(plan, bhk: int) -> None:
    """Every essential room in the program for the *effective* (right-sized) tier
    must be in the plan. We rebuild the very program ``generate_plan`` used (same
    tier + footprint), then check none of its essentials were dropped. Per-bedroom
    baths are carved post-pack, so they are checked separately (see ensuite test)."""
    plot = plan.plot
    env, _ = _envelope_and_keepout(plot, get_code_rules())
    ew, ed = env[2] - env[0], env[3] - env[1]
    foot = buildable_footprint_sqm(plot, get_code_rules())
    tier = resolve_tier(bhk, foot)[0]
    program = build_program(bhk, 1, ew, ed, 9.5, 5.0, 1.1, get_vastu_rules(), tier=tier, footprint=foot)
    want = [p.id for p in program if p.type.value in ESSENTIAL_TYPES]
    have = {r.id for r in plan.rooms}
    missing = [i for i in want if i not in have]
    assert not missing, f"essential rooms dropped: {missing}"


# --------------------------------------------------------------------------- #
# Geometry + program validity (30x40 KA, requested 2 & 3 BHK)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("bhk", [2, 3])
def test_ka_30x40_east_is_valid(bhk):
    plan, vastu, code, meta = generate_plan(bhk, _plot("KA"))
    env, _ = _envelope_and_keepout(plan.plot, get_code_rules())

    # (a) geometry: rectangles, no overlaps, all inside the buildable envelope
    _all_rectangles(plan)
    _no_overlaps(plan)
    _within_envelope(plan, env)

    # (b) all essential program rooms are present. A 3BHK on 30x40 now auto-promotes
    # to G+1 (architect's call), so the single-floor essential-id check only applies
    # to single-floor plans; for a G+1 we assert all requested bedrooms are kept.
    multifloor = len({(r.floor or 0) for r in plan.rooms}) > 1
    if multifloor:
        beds = [r for r in plan.rooms if "bedroom" in r.type.value]
        assert len(beds) >= bhk
        assert meta.get("autoStorey") is True
    else:
        _expected_essentials_present(plan, bhk)

    # (c) Vastu: score >= 70 and grade not failing
    assert vastu.score >= 70
    assert vastu.grade in {"Fair", "Good", "Excellent"}
    assert meta["vastuGrade"] == vastu.grade

    # (d) zero code hard-fails (advisory warns allowed)
    assert code.summary.fail_count == 0
    assert meta["codeFails"] == 0

    # (e) key Vastu zones land in their ideal sectors
    zones = {r.type.value: r.zone.value for r in plan.rooms}
    assert zones["kitchen"] in {"SE", "S", "E"}
    assert zones["master_bedroom"] in {"SW", "S", "W"}
    if "pooja" in zones:
        assert zones["pooja"] in {"NE", "N", "E"}


# --------------------------------------------------------------------------- #
# RIGHT-SIZING — footprint picks the tier; over-large bhk downscales
# --------------------------------------------------------------------------- #
def test_tiny_plot_is_a_studio_no_bedrooms():
    # ~6x7.5 m (=> ~22 m2 buildable) is a Studio: a living-cum-bedroom + a
    # kitchenette + ONE bath, and NO separate bedrooms.
    plan, vastu, code, meta = generate_plan(2, _plot("KA", w=6.0, d=7.5))
    assert meta["tier"] == "STUDIO"
    assert meta["downscaled"] is True
    assert code.summary.fail_count == 0          # tiny but code-clean
    bedrooms = [r for r in plan.rooms if "bedroom" in r.type.value]
    assert bedrooms == []                         # no separate bedrooms
    types = {r.type.value for r in plan.rooms}
    assert "living" in types and "toilet" in types
    _all_rectangles(plan)
    _no_overlaps(plan)


def test_medium_plot_is_a_2bhk():
    # ~9x9 m sits in the 1BHK/2BHK range; a clean, valid plan with at least one
    # bedroom and no code fails. (Exact tier depends on the post-setback footprint;
    # the point is right-sizing yields a sound, fully-bathroomed home.)
    plot = _plot("KA", w=9.0, d=9.0)
    plan, vastu, code, meta = generate_plan(2, plot)
    assert meta["tier"] in {"1BHK", "2BHK"}
    assert meta["tier"] == _effective_tier(plot, 2)
    assert code.summary.fail_count == 0
    assert vastu.score >= 70
    beds = [r for r in plan.rooms if "bedroom" in r.type.value]
    assert len(beds) >= 1
    _all_rectangles(plan)
    _no_overlaps(plan)


def test_bhk4_on_30x40_goes_g1_and_is_clean():
    # The 30x40 KA footprint (~72 m2) can't hold a 4BHK with an attached bath per
    # bedroom on ONE floor, so — like a practising architect — the generator builds
    # UP (G+1) to keep all four bedrooms rather than cramming sub-minimum rooms or
    # dropping a bedroom. The result is still code-clean and overlap-free.
    plan, vastu, code, meta = generate_plan(4, _plot("KA"))
    assert meta["requestedBhk"] == 4
    assert meta["autoStorey"] is True
    assert meta["floorsGenerated"] >= 2
    assert meta["tier"] == "4BHK"
    assert meta["note"]                            # a human-readable reason
    beds = [r for r in plan.rooms if "bedroom" in r.type.value]
    assert len(beds) >= 4                          # all four bedrooms kept across floors
    env, _ = _envelope_and_keepout(plan.plot, get_code_rules())
    _all_rectangles(plan)
    _no_overlaps(plan)
    _within_envelope(plan, env)
    assert code.summary.fail_count == 0
    assert vastu.score >= 70


def test_bhk_request_honoured_when_smaller_than_fits():
    # A 1BHK requested on a plot that could hold a 2BHK is honoured (no upscaling).
    big = _plot("KA", w=12.0, d=15.0)
    assert _effective_tier(big, 2) == "2BHK"       # the plot CAN do 2BHK
    plan, vastu, code, meta = generate_plan(1, big)
    assert meta["tier"] == "1BHK"
    assert meta["downscaled"] is False
    beds = [r for r in plan.rooms if "bedroom" in r.type.value]
    assert len(beds) == 1


def test_meta_right_sizing_fields():
    plan, vastu, code, meta = generate_plan(3, _plot("KA"))
    for k in ("tier", "requestedBhk", "downscaled", "note"):
        assert k in meta
    assert meta["requestedBhk"] == 3
    assert isinstance(meta["downscaled"], bool)
    assert meta["tier"] in {"STUDIO", "1BHK", "2BHK", "3BHK", "4BHK"}


# --------------------------------------------------------------------------- #
# ATTACHED BATHROOMS — every bedroom has its own ensuite, NO common toilet
# --------------------------------------------------------------------------- #
def _ensuite_check(plan, *, expect_bedrooms: int) -> None:
    bedrooms = [r for r in plan.rooms if "bedroom" in r.type.value]
    toilets = [r for r in plan.rooms if r.type.value == "toilet"]
    assert len(bedrooms) == expect_bedrooms, (
        f"expected {expect_bedrooms} bedrooms, got {len(bedrooms)}"
    )
    # Owner brief: NO standalone common/powder WC — every toilet is an attached
    # bath sharing an edge with its bedroom (id 'toilet_<bedroom>').
    assert not [t for t in toilets if t.id in ("toilet_common", "u_toilet_common")], (
        "a standalone common toilet was generated — owner brief is ensuite-only"
    )
    # exactly one attached bath per bedroom — and nothing else
    assert len(toilets) == expect_bedrooms, (
        f"expected {expect_bedrooms} attached baths (one per bedroom), got {len(toilets)}"
    )
    for bed in bedrooms:
        own = [t for t in toilets if t.id == f"toilet_{bed.id}"]
        assert len(own) == 1, f"bedroom {bed.id} has no dedicated attached bath"
        assert _share_edge(bed, own[0]), (
            f"attached bath {own[0].id} does not share an edge with bedroom {bed.id}"
        )
    # attached baths are never in the NE (the cardinal Vastu rule), prefer W/NW/S
    for t in toilets:
        assert t.zone.value != "NE", f"attached bath {t.id} fell in the NE"


def test_2bhk_attached_baths_ensuite_only():
    # 30x40 KA at bhk=2 -> a genuine 2BHK: 2 ensuite bedrooms, NO common toilet.
    plan, vastu, code, meta = generate_plan(2, _plot("KA"))
    assert meta["tier"] == "2BHK"
    _ensuite_check(plan, expect_bedrooms=2)
    assert code.summary.fail_count == 0


def test_3bhk_attached_baths_ensuite_only():
    # A plot that genuinely fits a 3BHK (~122 m2 footprint): 3 ensuite bedrooms
    # each with its OWN adjacent toilet and NO common toilet (3 toilets total).
    plot = _plot("KA", w=14.0, d=16.0)
    assert _effective_tier(plot, 3) == "3BHK"
    plan, vastu, code, meta = generate_plan(3, plot)
    assert meta["tier"] == "3BHK"
    assert meta["downscaled"] is False
    _ensuite_check(plan, expect_bedrooms=3)
    assert code.summary.fail_count == 0
    assert vastu.score >= 70


def test_baths_on_w_nw_side_not_ne():
    # All attached baths sit on the W/NW/S side, never NE.
    plan, _, _, _ = generate_plan(3, _plot("KA", w=14.0, d=16.0))
    toilets = [r for r in plan.rooms if r.type.value == "toilet"]
    for t in toilets:
        assert t.zone.value != "NE"


# --------------------------------------------------------------------------- #
# Vastu zoning + Brahmasthan
# --------------------------------------------------------------------------- #
def test_zoning_kitchen_se_master_sw_pooja_ne():
    plan, vastu, _, _ = generate_plan(3, _plot("KA", w=14.0, d=16.0))
    zones = {r.type.value: r.zone.value for r in plan.rooms}
    assert zones["kitchen"] in {"SE", "S", "E"}
    assert zones["master_bedroom"] in {"SW", "S", "W"}
    assert zones["pooja"] in {"NE", "N", "E"}
    assert vastu.score >= 70


def test_brahmasthan_kept_open_when_feasible():
    plan, vastu, _, _ = generate_plan(2, _plot("KA"))
    assert vastu.brahmasthan.status in {"pass", "warn"}
    forbidden = {"toilet", "bathroom", "kitchen", "staircase"}
    center = [r for r in plan.rooms if r.zone and r.zone.value == "CENTER"]
    assert not [r for r in center if r.type.value in forbidden]


# --------------------------------------------------------------------------- #
# AP / Tirupati ruleset
# --------------------------------------------------------------------------- #
def test_ap_tirupati_is_valid():
    # A plot sized so AP/Tirupati genuinely fits a 2BHK (~100 m2 footprint).
    plot = _plot("AP", city="Tirupati", w=11.0, d=14.0)
    plan, vastu, code, meta = generate_plan(2, plot)
    env, _ = _envelope_and_keepout(plan.plot, get_code_rules())

    _all_rectangles(plan)
    _no_overlaps(plan)
    _within_envelope(plan, env)
    _expected_essentials_present(plan, 2)

    assert code.state == "AP"
    assert code.summary.fail_count == 0
    assert vastu.score >= 70
    assert vastu.grade in {"Fair", "Good", "Excellent"}
    assert meta["tier"] in {"2BHK", "3BHK"}

    zones = {r.type.value: r.zone.value for r in plan.rooms}
    assert zones["kitchen"] in {"SE", "S", "E"}
    assert zones["master_bedroom"] in {"SW", "S", "W"}


def test_ap_tirupati_3bhk_attached_baths():
    # AP (Tirupati) on a plot that fits a 3BHK -> per-bedroom attached baths.
    plot = _plot("AP", city="Tirupati", w=12.0, d=15.0)
    assert _effective_tier(plot, 3) == "3BHK"
    plan, vastu, code, meta = generate_plan(3, plot)
    assert meta["tier"] == "3BHK"
    _ensuite_check(plan, expect_bedrooms=3)
    assert code.summary.fail_count == 0


# --------------------------------------------------------------------------- #
# Determinism, openings, AP code-ruleset
# --------------------------------------------------------------------------- #
def test_meta_shape_and_determinism():
    a = generate_plan(2, _plot("KA"))
    b = generate_plan(2, _plot("KA"))
    # deterministic: same brief -> identical room geometry + score
    assert [r.polygon for r in a[0].rooms] == [r.polygon for r in b[0].rooms]
    assert a[3]["vastuScore"] == b[3]["vastuScore"]
    for k in ("vastuScore", "vastuGrade", "codeFails", "droppedRooms", "attempts",
              "tier", "requestedBhk", "downscaled", "note"):
        assert k in a[3]


def test_doors_and_windows_present_and_referential():
    plan, _, _, _ = generate_plan(2, _plot("KA"))
    room_ids = {r.id for r in plan.rooms}
    enclosed = [r for r in plan.rooms if r.type.value not in SITE_OR_VIRTUAL_TYPES]
    # exactly one door per enclosed room, all referencing real rooms
    assert len(plan.doors) == len(enclosed)
    for o in (*plan.doors, *plan.windows):
        assert o.room_id in room_ids
        assert o.width_m > 0 and o.height_m > 0


def test_ap_code_rules_load_and_validate():
    rules = get_code_rules()
    ap = rules.state("AP")
    assert ap["label"] == "Andhra Pradesh"
    assert ap.get("verify") is True  # flagged for human verification
    band = rules.setback_for("AP", 111.5)  # 30x40 ~ 111.5 m2
    assert band["frontM"] > 0 and band["sideM"] > 0

    plan, _, _, _ = generate_plan(2, _plot("AP", city="Tirupati", w=11.0, d=14.0))
    plan, _ = normalize(plan)
    report = check_code(plan, rules)
    assert report.state == "AP"
    assert report.metrics.far_allowed == ap["FAR"]
    assert report.metrics.ground_coverage_pct <= report.metrics.max_ground_coverage_pct
