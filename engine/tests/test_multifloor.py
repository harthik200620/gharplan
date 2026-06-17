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
    # one attached bath per bedroom + a common toilet
    assert len(toilets) >= len(bedrooms)
