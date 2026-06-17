"""Multi-floor generation: ground = social core, upper = living + bedrooms only."""

from app.generator.designer import generate_plan
from app.models.enums import City, Facing, StateCode
from app.models.plan import Plot


def _plot(floors: int = 2) -> Plot:
    return Plot(
        width_m=9.144, depth_m=12.192, facing=Facing.E,
        state=StateCode.KA, city=City.Bengaluru, floors=floors,
    )


def test_g1_generates_two_floors():
    plan, vastu, code, meta = generate_plan(3, _plot(2), floors=2)
    assert {r.floor for r in plan.rooms} == {0, 1}
    assert meta["floorsGenerated"] == 2
    assert code.summary.fail_count == 0


def test_upper_floor_is_living_and_bedrooms_only():
    plan, _, _, _ = generate_plan(3, _plot(2), floors=2)
    upper = {r.type.value for r in plan.rooms if r.floor == 1}
    # no kitchen / dining / pooja upstairs
    assert "kitchen" not in upper
    assert "dining" not in upper
    assert "pooja" not in upper
    assert "master_bedroom" in upper  # bedrooms live upstairs


def test_ground_floor_is_social_core_with_guest_bedroom():
    # A G+1 keeps the social core downstairs PLUS (from 3BHK) one ensuite
    # guest/parents bedroom so elders avoid the stairs — the Indian convention. The
    # MASTER is always upstairs; at most one bedroom sits on the ground floor.
    plan, _, _, _ = generate_plan(3, _plot(2), floors=2)
    ground = [r for r in plan.rooms if r.floor == 0]
    gtypes = {r.type.value for r in ground}
    assert "kitchen" in gtypes
    assert "master_bedroom" not in gtypes          # master is upstairs
    ground_beds = [r for r in ground if "bedroom" in r.type.value]
    assert len(ground_beds) <= 1                    # only the single guest bedroom


def test_no_utility_anywhere():
    for floors in (1, 2):
        plan, _, _, _ = generate_plan(2, _plot(floors), floors=floors)
        assert not any(r.type.value == "utility" for r in plan.rooms)


def test_single_floor_all_ground():
    plan, _, _, meta = generate_plan(2, _plot(1), floors=1)
    assert {r.floor for r in plan.rooms} == {0}


def test_each_upper_bedroom_has_attached_bath():
    plan, _, _, _ = generate_plan(3, _plot(2), floors=2)
    upper = [r for r in plan.rooms if r.floor == 1]
    bedrooms = [r for r in upper if "bedroom" in r.type.value]
    toilets = [r for r in upper if r.type.value == "toilet"]
    # owner brief: one attached bath per bedroom and NO common toilet upstairs
    assert not any(t.id == "u_toilet_common" for t in toilets)
    assert len(toilets) == len(bedrooms)
    for bed in bedrooms:
        assert any(t.id == f"toilet_{bed.id}" for t in toilets)


def _bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def _share_edge(a, b, tol: float = 0.12) -> bool:
    """True when rectangles a and b abut along a shared wall of real length."""
    ax0, ay0, ax1, ay1 = _bbox(a.polygon)
    bx0, by0, bx1, by1 = _bbox(b.polygon)
    y_ov = min(ay1, by1) - max(ay0, by0)
    x_ov = min(ax1, bx1) - max(ax0, bx0)
    if y_ov > 0.5 and (abs(ax1 - bx0) < tol or abs(bx1 - ax0) < tol):
        return True
    if x_ov > 0.5 and (abs(ay1 - by0) < tol or abs(by1 - ay0) < tol):
        return True
    return False


def test_e_facing_g1_kitchen_dining_adjacent_on_every_floor():
    # Rung 2 (non-negotiable): wherever a floor has BOTH a kitchen and a dining,
    # the dining must abut the kitchen (you serve from one into the other). The
    # big front-living must never crowd the dining off the kitchen. This locks the
    # kitchen->dining->living spine on the canonical E-facing 30x40 3BHK G+1.
    plan, vastu, code, meta = generate_plan(3, _plot(2), floors=2)
    assert {r.floor for r in plan.rooms} == {0, 1}
    assert code.summary.fail_count == 0
    by_floor: dict[int, list] = {}
    for r in plan.rooms:
        by_floor.setdefault(r.floor or 0, []).append(r)
    saw_pair = False
    for fl, rooms in by_floor.items():
        kitchens = [r for r in rooms if r.type.value == "kitchen"]
        dinings = [r for r in rooms if r.type.value == "dining"]
        if not kitchens or not dinings:
            continue
        saw_pair = True
        for d in dinings:
            assert any(_share_edge(d, k) for k in kitchens), (
                f"floor {fl}: dining {d.id} does not abut any kitchen"
            )
    assert saw_pair, "expected a floor with both a kitchen and a dining to check"


def test_e_facing_g1_stair_touches_living_on_both_floors():
    # On an E-facing G+1 3BHK the staircase lands against the family hall on BOTH
    # floors — you arrive into the living, not a dead corridor. (Soft preference:
    # the stair-on-hall link is pursued only where it does not push a core Vastu
    # room off its sector; on this plot it holds on both floors.)
    plan, vastu, code, meta = generate_plan(3, _plot(2), floors=2)
    assert {r.floor for r in plan.rooms} == {0, 1}
    assert code.summary.fail_count == 0
    by_floor: dict[int, list] = {}
    for r in plan.rooms:
        by_floor.setdefault(r.floor or 0, []).append(r)
    for fl, rooms in by_floor.items():
        stairs = [r for r in rooms if r.type.value == "staircase"]
        livings = [r for r in rooms if r.type.value == "living"]
        assert stairs, f"floor {fl} has no staircase"
        assert livings, f"floor {fl} has no living"
        assert any(_share_edge(s, lv) for s in stairs for lv in livings), (
            f"floor {fl}: staircase does not share a wall with any living"
        )
