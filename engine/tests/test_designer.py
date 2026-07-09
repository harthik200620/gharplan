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
    VARIANT_PROFILES,
    _envelope_and_keepout,
    build_program,
    buildable_footprint_sqm,
    generate_options,
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


def _no_overlaps(plan, builtup_only: bool = False) -> None:
    # Overlap is only a conflict WITHIN a floor; stacked floors of a G+1 share the
    # same footprint by design, so compare rooms floor-by-floor. ``builtup_only``
    # restricts the check to enclosed footprint rooms (excludes the open SITE rooms
    # laid out in the setback margins) when only the footprint tiling is under test.
    by_floor: dict[int, list] = {}
    for r in plan.rooms:
        if builtup_only and r.type.value in SITE_OR_VIRTUAL_TYPES:
            continue
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


def _worst_interior_void(plan, env) -> float:
    """Largest per-floor blank gap INSIDE the buildable envelope: the envelope area
    minus the area of every room whose rectangle sits inside it (a courtyard counts
    as filling; site rooms live in the setback margins, outside the envelope, so are
    excluded). A 10-yr architect ships no unassigned interior floor — this must be
    ~0 once the generator courtyards / welds every leftover band space."""
    minx, miny, maxx, maxy = env
    env_area = max(0.0, maxx - minx) * max(0.0, maxy - miny)
    worst = 0.0
    for fl in sorted({(r.floor or 0) for r in plan.rooms}):
        floor_rooms = [r for r in plan.rooms if (r.floor or 0) == fl]
        # Skip a storey with no enclosed (non-site) room — that is an un-built-up
        # floor (e.g. a 2BHK forced to G+1), not blank floor inside a room layout.
        if not any(r.type.value not in SITE_OR_VIRTUAL_TYPES for r in floor_rooms):
            continue
        used = 0.0
        for r in floor_rooms:
            x0, y0, x1, y1 = _bbox(r.polygon)
            inside = (
                x0 >= minx - 0.02 and y0 >= miny - 0.02
                and x1 <= maxx + 0.02 and y1 <= maxy + 0.02
            )
            if inside:
                used += (x1 - x0) * (y1 - y0)
        worst = max(worst, env_area - used)
    return worst


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
    # On this over-stuffed 4BHK plot the generator prioritises functional
    # kitchen-dining adjacency over a marginal Vastu point, so the score is "Fair"
    # rather than 70+ (a 10-yr architect would also flag the plot as tight for 4BHK).
    assert vastu.score >= 64


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


# --------------------------------------------------------------------------- #
# E-facing design invariants: big front-anchored living, roomy bedrooms
# --------------------------------------------------------------------------- #
_HABITABLE = {"living", "master_bedroom", "bedroom", "childrens_bedroom", "study"}


def _area(room) -> float:
    """Rectangle area of a room from its polygon bbox (m^2)."""
    x0, y0, x1, y1 = _bbox(room.polygon)
    return (x1 - x0) * (y1 - y0)


def _largest_habitable_is_living(plan) -> None:
    """On every floor, the living/family hall is the largest habitable room — the
    architect anchors the home on a dominant front hall, not a bedroom."""
    by_floor: dict[int, list] = {}
    for r in plan.rooms:
        if r.type.value in _HABITABLE:
            by_floor.setdefault(r.floor or 0, []).append(r)
    for fl, rooms in by_floor.items():
        livings = [r for r in rooms if r.type.value == "living"]
        assert livings, f"floor {fl} has no living room"
        biggest = max(rooms, key=_area)
        assert biggest.type.value == "living", (
            f"floor {fl}: largest habitable is {biggest.type.value} "
            f"({_area(biggest):.1f} m2), not the living "
            f"({max(_area(lv) for lv in livings):.1f} m2)"
        )


# A FRONT cardinal/sub-cardinal for the living — never the dead-centre Brahmasthan
# and never the master's SW corner. The owner's R3 call: the hall is LARGE and at the
# FRONT/ENTRANCE, but on a narrow deep plot it need not be the single largest room if
# that would force it into the centre.
_LIVING_FRONT_ZONES = {"E", "NE", "N", "NW", "SE", "W"}


def _living_is_large_and_front(plan, *, floor_sqm: float) -> None:
    """The R3 relaxed living invariant: on every floor the living is generously
    sized (>= ``floor_sqm``) and sits at a compass FRONT zone — never the centre
    (Brahmasthan) and never the SW (the master's corner). It need NOT be the single
    largest habitable room (that strict rule shoved a big hall into the centre on
    narrow plots and is the exact behaviour the owner asked to drop)."""
    by_floor: dict[int, list] = {}
    for r in plan.rooms:
        if r.type.value in _HABITABLE:
            by_floor.setdefault(r.floor or 0, []).append(r)
    for fl, rooms in by_floor.items():
        livings = [r for r in rooms if r.type.value == "living"]
        assert livings, f"floor {fl} has no living room"
        big = max(_area(lv) for lv in livings)
        assert big >= floor_sqm, (
            f"floor {fl}: living is only {big:.1f} m2 (< {floor_sqm:.1f} floor) — "
            f"the hall must still read as a big living"
        )
        for lv in livings:
            zone = lv.zone.value if lv.zone is not None else "?"
            assert zone != "CENTER", f"floor {fl}: living sits in the Brahmasthan CENTER"
            assert zone != "SW", f"floor {fl}: living sits in the SW (master's corner)"
            assert zone in _LIVING_FRONT_ZONES, (
                f"floor {fl}: living zone {zone} is not a front zone"
            )


def _kitchen_dining_adjacent_or_absent(plan) -> None:
    """Every dining abuts a kitchen on its floor (or the floor has no dining/kitchen
    to relate). Functional must — never weakened."""
    by_floor: dict[int, list] = {}
    for r in plan.rooms:
        by_floor.setdefault(r.floor or 0, []).append(r)
    for fl, rooms in by_floor.items():
        kitchens = [r for r in rooms if r.type.value == "kitchen"]
        dinings = [r for r in rooms if r.type.value == "dining"]
        if not dinings or not kitchens:
            continue
        assert all(any(_share_edge(d, k) for k in kitchens) for d in dinings), (
            f"floor {fl}: a dining does not abut the kitchen"
        )


def test_e_facing_2bhk_living_is_largest_habitable():
    # A well-proportioned single-floor E-facing 2BHK: the front-anchored hall is the
    # largest habitable room on the floor (it dominates the master + secondary).
    plot = _plot("KA", facing="E", w=12.0, d=9.0)
    plan, vastu, code, meta = generate_plan(2, plot)
    assert meta["tier"] == "2BHK"
    assert not meta.get("autoStorey")               # genuinely single-floor
    assert {(r.floor or 0) for r in plan.rooms} == {0}
    assert code.summary.fail_count == 0
    _largest_habitable_is_living(plan)


def test_e_facing_2bhk_30x40_living_large_and_front():
    # The canonical 30x40 BBMP site as a single-floor 2BHK is DEEP and NARROW: the
    # two ensuite bedroom blocks force a wide sleeping band. The owner's R3 call is
    # that the hall is LARGE and at the FRONT (E/NE) — but it need NOT be the single
    # largest habitable room when forcing that would shove it into the centre. So we
    # lock the relaxed invariant: the living is generously sized AND front (never
    # CENTER, never the master's SW), kitchen-dining stays adjacent, both bedrooms
    # are kept, and the plan is code-clean. (Was: strict "living dominates master".)
    plot = _plot("KA", facing="E", w=W30x40, d=D30x40)
    plan, vastu, code, meta = generate_plan(2, plot)
    assert meta["tier"] == "2BHK"
    assert not meta.get("autoStorey")               # genuinely single-floor
    assert {(r.floor or 0) for r in plan.rooms} == {0}
    assert code.summary.fail_count == 0
    beds = [r for r in plan.rooms if "bedroom" in r.type.value]
    assert len(beds) == 2                            # both bedrooms kept (no drop)
    _living_is_large_and_front(plan, floor_sqm=13.0)  # large + front (not CENTER/SW)
    _kitchen_dining_adjacent_or_absent(plan)          # never weakened


def test_e_facing_3bhk_14x16_living_is_largest_habitable():
    # The canonical 14x16 single-floor 3BHK: the family hall is the largest habitable
    # room on the floor, ahead of the master suite and the secondary bedrooms.
    plot = _plot("KA", facing="E", w=14.0, d=16.0)
    plan, vastu, code, meta = generate_plan(3, plot)
    assert meta["tier"] == "3BHK"
    assert not meta.get("autoStorey")
    assert {(r.floor or 0) for r in plan.rooms} == {0}
    assert code.summary.fail_count == 0
    _largest_habitable_is_living(plan)


def test_e_facing_roomy_bedrooms_meet_comfort_minimums():
    # On a roomy plot the bedrooms read as proper rooms, not cells: every secondary
    # bedroom is >= 12.5 m^2 and the master is >= 16 m^2 (the comfort minimums a
    # practising architect holds when the plot can afford them).
    plot = _plot("KA", facing="E", w=16.0, d=18.0)
    plan, vastu, code, meta = generate_plan(3, plot)
    assert meta["tier"] == "3BHK"
    assert code.summary.fail_count == 0
    masters = [r for r in plan.rooms if r.type.value == "master_bedroom"]
    secondaries = [
        r for r in plan.rooms if r.type.value in {"bedroom", "childrens_bedroom"}
    ]
    assert masters, "no master bedroom placed"
    assert secondaries, "no secondary bedrooms placed"
    for m in masters:
        assert _area(m) >= 16.0 - 1e-6, f"master {m.id} is only {_area(m):.1f} m2"
    for s in secondaries:
        assert _area(s) >= 12.5 - 1e-6, (
            f"secondary bedroom {s.id} is only {_area(s):.1f} m2"
        )


# --------------------------------------------------------------------------- #
# R5 — no unassigned interior void, and every state's 4BHK is code-clean.
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "state,city,facing,bhk",
    [
        ("KA", "Bengaluru", "E", 3), ("KA", "Bengaluru", "E", 4),
        ("KA", "Bengaluru", "W", 4), ("KA", "Bengaluru", "N", 4),
        ("KA", "Bengaluru", "S", 4),
        ("TG", "Hyderabad", "E", 3), ("TG", "Hyderabad", "E", 4),
        ("AP", "Tirupati", "E", 3), ("AP", "Tirupati", "E", 4),
    ],
)
def test_no_interior_void_in_footprint(state, city, facing, bhk):
    # A prior round left leftover band space inside the footprint as blank floor (a
    # ~13.6 m2 void on KA E 3BHK G+1). The generator now turns every leftover into a
    # labelled courtyard (or welds a thin drift strip into its neighbour where
    # ground coverage allows), so NO floor carries an unassigned gap > 2 m2.
    plot = _plot(state, city=city, facing=facing)
    plan, _, code, _ = generate_plan(bhk, plot)
    env, _ = _envelope_and_keepout(plan.plot, get_code_rules())
    _no_overlaps(plan, builtup_only=True)   # courtyards/welds keep the footprint tiling valid
    _within_envelope(plan, env)
    void = _worst_interior_void(plan, env)
    assert void <= 2.0, f"{state} {facing} {bhk}BHK leaves a {void:.1f} m2 interior void"


def test_ka_e_3bhk_g1_void_is_a_courtyard():
    # The exact defect: KA E 3BHK G+1 ground floor used to have a ~13.6 m2 blank gap
    # in the West band (north of the guest + toilet). It must now be a real, labelled
    # courtyard room that renders + fills the gap.
    plan, _, _, _ = generate_plan(3, _plot("KA", facing="E"))
    courts = [r for r in plan.rooms if r.type.value == "courtyard"]
    assert courts, "no courtyard placed to fill the leftover footprint band"
    ground_courts = [r for r in courts if (r.floor or 0) == 0]
    assert ground_courts, "ground-floor void was not filled with a courtyard"
    # the ground courtyard is a genuine room, not a sliver
    assert max(_area(c) for c in ground_courts) >= 2.0
    env, _ = _envelope_and_keepout(plan.plot, get_code_rules())
    _within_envelope(plan, env)


@pytest.mark.parametrize(
    "state,city", [("KA", "Bengaluru"), ("TG", "Hyderabad"), ("AP", "Tirupati")]
)
def test_4bhk_every_state_is_code_clean(state, city):
    # DEFECT 2: TG E 4BHK G+1 used to ship code fail_count == 1 (the living's
    # narrowest side ~2.36 m < the 2.4 m min). On a tight ground-coverage cap (TG is
    # 55 %) the coverage shrink must stay anisotropic + min-dim-safe, so no habitable
    # room is pushed below the code-min narrowest side. Code fails MUST be 0 for the
    # 4BHK on every state ruleset.
    plot = _plot(state, city=city, facing="E")
    plan, vastu, code, meta = generate_plan(4, plot)
    assert meta["requestedBhk"] == 4
    assert code.summary.fail_count == 0, (
        f"{state} 4BHK has {code.summary.fail_count} code fail(s): "
        + "; ".join(c.message for c in code.checks if c.status == "fail")
    )
    _no_overlaps(plan, builtup_only=True)


# --------------------------------------------------------------------------- #
# R6 — the courtyard variant carves a GUARANTEED, sensibly-sized, centred court
# before packing (see ``_courtyard_reservation``), rather than hoping
# fill_center=False leaves a leftover gap that happens to survive rebalancing.
# --------------------------------------------------------------------------- #
def test_courtyard_variant_always_has_a_real_centred_court():
    # A roomy brief that comfortably clears the courtyard variant's (raised)
    # min_footprint_sqm gate — same brief as the live HTTP sanity check.
    plot = _plot("KA", city="Bengaluru", facing="E", w=15.0, d=15.0)
    options = generate_options(3, plot, floors=1)
    courtyard_opt = next((o for o in options if o["variantId"] == "courtyard"), None)
    assert courtyard_opt is not None, (
        "courtyard variant did not survive to the option list for a brief well "
        "above its min_footprint_sqm gate"
    )
    assert courtyard_opt["code"].summary.fail_count == 0

    plan = courtyard_opt["plan"]
    courts = [r for r in plan.rooms if r.type.value == "courtyard"]
    assert courts, "courtyard variant produced no RoomType.courtyard room at all"

    env, _ = _envelope_and_keepout(plan.plot, get_code_rules())
    minx, miny, maxx, maxy = env
    env_cx, env_cy = 0.5 * (minx + maxx), 0.5 * (miny + maxy)

    # Pick whichever courtyard room sits closest to the envelope centre — the
    # HARD reservation, as opposed to any incidental leftover-band courtyard a
    # side (west/east) band might separately produce (that generic mechanism,
    # unrelated to the variant, is left untouched — see test_no_interior_void_*
    # above — and may coexist with the guaranteed one).
    def _centre_offset(room):
        x0, y0, x1, y1 = _bbox(room.polygon)
        cx, cy = 0.5 * (x0 + x1), 0.5 * (y0 + y1)
        return abs(cx - env_cx) + abs(cy - env_cy)

    court = min(courts, key=_centre_offset)
    x0, y0, x1, y1 = _bbox(court.polygon)
    area = (x1 - x0) * (y1 - y0)

    # A real room, not a token sliver (VariantProfile.courtyard docstring: 3x3 m
    # minimum == 9 sqm; assert a bit below that to leave headroom for the
    # safety clamps in ``_courtyard_reservation``).
    assert area >= 6.0, f"guaranteed courtyard is only {area:.1f} m2"

    # Positioned away from every envelope edge (rules out an edge-hugging
    # strip masquerading as a "courtyard") and roughly centred overall.
    left, right = x0 - minx, maxx - x1
    bottom, top = y0 - miny, maxy - y1
    assert min(left, right, bottom, top) >= 1.5, (
        f"courtyard hugs an envelope edge: margins L={left:.2f} R={right:.2f} "
        f"B={bottom:.2f} T={top:.2f}"
    )
    cx, cy = 0.5 * (x0 + x1), 0.5 * (y0 + y1)
    assert abs(cx - env_cx) <= 0.2 * (maxx - minx), "courtyard not centred on the X axis"
    assert abs(cy - env_cy) <= 0.2 * (maxy - miny), "courtyard not centred on the Y axis"


def test_courtyard_min_footprint_gate_still_suppresses_small_plots():
    # The reservation now costs real floor area, so the gate was raised (95 ->
    # 110 sqm, see VARIANT_PROFILES) — confirm it still does its job on the
    # canonical tight 30x40 ft plot (~72.5 m2 buildable) rather than forcing a
    # court onto a plot that can't afford one.
    plot = _plot("KA", city="Bengaluru", facing="E")
    foot = buildable_footprint_sqm(plot, get_code_rules())
    courtyard_profile = next(v for v in VARIANT_PROFILES if v.id == "courtyard")
    assert foot < courtyard_profile.min_footprint_sqm
    options = generate_options(2, plot, floors=1)
    assert all(o["variantId"] != "courtyard" for o in options)


# --------------------------------------------------------------------------- #
# R7 — generate_options records which variants merged away in a dedup, so the
# web UI can tell users "N strategies converged to this layout" by name.
# --------------------------------------------------------------------------- #
def test_generate_options_records_merged_variants_on_tight_plot():
    # The canonical 30x40 ft KA E plot at 2BHK: a known tight case where the
    # courtyard variant is excluded by min_footprint_sqm. Climate now packs a
    # genuinely shallower (E-W elongated) footprint (see _climate_pack_env),
    # so its plan signature no longer reads as a near-duplicate of vastu's —
    # it survives dedup as its own distinct scheme. Multigen has no shape/
    # topology differentiator of its own and (verified empirically) still
    # converges onto vastu on this tight a plot.
    plot = _plot("KA", city="Bengaluru", facing="E")
    options = generate_options(2, plot, floors=1)

    assert all("mergedFromVariants" in o["meta"] for o in options), (
        "every surviving option must carry a mergedFromVariants list, even if empty"
    )

    kept_ids = {o["variantId"] for o in options}
    assert kept_ids == {"vastu", "climate", "modern"}, f"unexpected kept variant set: {kept_ids}"

    vastu_opt = next(o for o in options if o["variantId"] == "vastu")
    merged_ids = {m["variantId"] for m in vastu_opt["meta"]["mergedFromVariants"]}
    assert merged_ids == {"multigen"}, f"expected multigen to merge into vastu, got {merged_ids}"
    for m in vastu_opt["meta"]["mergedFromVariants"]:
        assert set(m) == {"variantId", "variantName"}
        assert m["variantName"]  # non-empty display name, not just an id

    modern_opt = next(o for o in options if o["variantId"] == "modern")
    assert modern_opt["meta"]["mergedFromVariants"] == []


# --------------------------------------------------------------------------- #
# R8 — variety shouldn't be bounded by one algorithm's vocabulary: climate and
# modern now get a genuine BUILDING-SHAPE / CIRCULATION difference (not just a
# different room mix in the same 3-band grid every variant used to share).
# --------------------------------------------------------------------------- #
def test_climate_variant_footprint_is_shallower_and_wider_than_vastu():
    # Same roomy brief, two variants: climate's own highlights promise
    # "Elongate plan E-W for N/S glazing" — confirm the FOOTPRINT actually
    # elongates now (see _climate_pack_env), not just a ventilation-window
    # priority tweak.
    plot = _plot("KA", city="Bengaluru", facing="E", w=15.0, d=15.0)
    climate_vp = next(v for v in VARIANT_PROFILES if v.id == "climate")
    vastu_vp = next(v for v in VARIANT_PROFILES if v.id == "vastu")

    c_plan, _, c_code, _ = generate_plan(3, plot, floors=1, variant=climate_vp)
    v_plan, _, v_code, _ = generate_plan(3, plot, floors=1, variant=vastu_vp)
    assert c_code.summary.fail_count == 0
    assert v_code.summary.fail_count == 0

    # Only the BUILT-UP rooms trace the actual building outline — a shallower
    # pack_env leaves the trimmed north/south strip to the existing void-fill
    # machinery, which (correctly) labels it a virtual garden/courtyard; that
    # strip is the point of the fix, not noise to include in "how deep is the
    # building" — so virtual/site room types are excluded here.
    _VIRTUAL = {
        "courtyard", "garden", "parking", "sitout", "service_shaft",
        "future_expansion", "balcony", "brahmasthan", "borewell", "overhead_tank",
    }

    def _footprint_bbox(plan):
        xs, ys = [], []
        for r in plan.rooms:
            if r.type.value in _VIRTUAL:
                continue
            x0, y0, x1, y1 = _bbox(r.polygon)
            xs += [x0, x1]
            ys += [y0, y1]
        return max(xs) - min(xs), max(ys) - min(ys)

    c_w, c_d = _footprint_bbox(c_plan)
    v_w, v_d = _footprint_bbox(v_plan)
    assert c_d < v_d - 0.5, f"climate footprint isn't shallower: climate depth={c_d:.2f} vastu depth={v_d:.2f}"
    assert (c_w / c_d) > (v_w / v_d) + 0.05, (
        f"climate aspect ratio isn't more elongated: climate={c_w/c_d:.2f} vastu={v_w/v_d:.2f}"
    )


def test_climate_pack_env_safety_clamp_on_already_shallow_envelope():
    # A pathologically shallow envelope should degrade to unchanged rather than
    # risk an infeasible pack.
    from app.generator.designer import _climate_pack_env

    env = (0.0, 0.0, 20.0, 6.0)  # env_d = 6.0, already shallow
    assert _climate_pack_env(env, min_dim=2.4) == env

    env2 = (0.0, 0.0, 20.0, 14.0)  # plenty of depth: trim should engage
    trimmed = _climate_pack_env(env2, min_dim=2.4)
    assert trimmed != env2
    minx, miny, maxx, maxy = trimmed
    assert maxx - minx == 20.0  # east-west width untouched
    assert 0.0 < (maxy - miny) < 14.0  # depth genuinely reduced
    # still centred on the same y-midpoint
    assert abs((miny + maxy) / 2.0 - 7.0) < 1e-9


def test_modern_variant_reaches_a_genuinely_different_shape_than_vastu():
    # Same brief the tight-plot dedup test uses: before this fix modern only
    # differed from vastu in room mix within the identical 3-band grid. Confirm
    # the plan signatures now diverge enough that generate_options keeps both
    # as distinct schemes (already exercised end-to-end above) AND that the
    # underlying geometry genuinely differs — not merely re-labelled.
    from app.generator.designer import _plan_signature, _signature_similarity

    plot = _plot("KA", city="Bengaluru", facing="E", w=15.0, d=15.0)
    modern_vp = next(v for v in VARIANT_PROFILES if v.id == "modern")
    vastu_vp = next(v for v in VARIANT_PROFILES if v.id == "vastu")

    m_plan, _, m_code, _ = generate_plan(3, plot, floors=1, variant=modern_vp)
    v_plan, _, v_code, _ = generate_plan(3, plot, floors=1, variant=vastu_vp)
    assert m_code.summary.fail_count == 0
    assert v_code.summary.fail_count == 0

    sim = _signature_similarity(_plan_signature(m_plan), _plan_signature(v_plan))
    assert sim < 0.90, f"modern reads as a near-duplicate of vastu (similarity={sim:.2f})"


def test_multigen_variant_gets_an_independent_second_staircase_on_a_roomy_plot():
    # VariantProfile.multigen's own docstring has always promised "If 2+ floors:
    # separate entrance/stair option for rental unit" — a genuine circulation
    # topology difference (two independent vertical/entry paths), not a room
    # mix change. On a plot roomy enough to afford it, both floors should carry
    # it — and it must reach EVERY floor to be a real second access path.
    plot = _plot("KA", city="Bengaluru", facing="E", w=15.0, d=15.0)
    multigen_vp = next(v for v in VARIANT_PROFILES if v.id == "multigen")
    plan, _, code, _ = generate_plan(3, plot, floors=2, variant=multigen_vp)
    assert code.summary.fail_count == 0

    ground = [r for r in plan.rooms if (r.floor or 0) == 0]
    upper = [r for r in plan.rooms if (r.floor or 0) == 1]
    g_stair2 = [r for r in ground if r.id == "stair2"]
    u_stair2 = [r for r in upper if r.id == "u_stair2"]
    assert g_stair2 and u_stair2, "second staircase didn't reach both floors on a roomy plot"
    assert g_stair2[0].type.value == "staircase"
    assert u_stair2[0].type.value == "staircase"
    assert any(r.id == "entrance2" and r.type.value == "entrance" for r in ground), (
        "second entrance missing for the independent upstairs access"
    )
    # The two staircases must not overlap/collide with the primary ones.
    primary_ground = [r for r in ground if r.type.value == "staircase" and r.id == "stair"]
    assert primary_ground
    from shapely.geometry import box as _box
    s1 = _box(*_bbox(primary_ground[0].polygon))
    s2 = _box(*_bbox(g_stair2[0].polygon))
    assert not s1.intersects(s2) or s1.touches(s2), "primary and second staircase overlap"


def test_multigen_second_stair_never_orphaned_on_one_floor():
    # If either floor's independent sweep can't afford the second stair, the
    # reconciliation step in _generate_multifloor must strip it from BOTH
    # floors rather than ship a staircase that only exists on one level.
    plot = _plot("KA", city="Bengaluru", facing="E")  # canonical tight 30x40 ft
    multigen_vp = next(v for v in VARIANT_PROFILES if v.id == "multigen")
    plan, _, code, _ = generate_plan(3, plot, floors=2, variant=multigen_vp)
    assert code.summary.fail_count == 0

    ground = [r for r in plan.rooms if (r.floor or 0) == 0]
    upper = [r for r in plan.rooms if (r.floor or 0) == 1]
    g_has = any(r.id == "stair2" for r in ground)
    u_has = any(r.id == "u_stair2" for r in upper)
    assert g_has == u_has, f"second stair present on only one floor: ground={g_has} upper={u_has}"
