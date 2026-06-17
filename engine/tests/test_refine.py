"""Single-prompt plan editing: the NL parser + the /plan/refine endpoint.

A refinement re-runs the whole generator with folded-in overrides, so the result
is always a valid plan (non-overlapping, code-checked); these tests assert the
instruction actually changed the plan in the intended direction."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.generator.designer import VARIANT_PROFILES, generate_plan
from app.main import app
from app.models.enums import City, Facing, StateCode
from app.models.plan import Plot
from app.services.refine_service import parse_edits

client = TestClient(app)


def _plot(floors=1):
    return Plot(width_m=9.144, depth_m=12.192, facing=Facing.E,
                state=StateCode.KA, city=City.Bengaluru, floors=floors)


def _gen(instructions, bhk=3, floors=1, w=9.144, d=12.192):
    res = parse_edits(instructions, base_bhk=bhk, base_floors=floors)
    variant = next((v for v in VARIANT_PROFILES if v.id == res.variant_id), None)
    plot = Plot(width_m=w, depth_m=d, facing=Facing.E, state=StateCode.KA,
                city=City.Bengaluru, floors=res.floors)
    plan, vastu, code, meta = generate_plan(
        bhk=res.bhk, plot=plot, floors=res.floors, variant=variant, edits=res.edits
    )
    return res, plan, vastu, code, meta


def _area(plan, type_value):
    return max((r.area_sqm for r in plan.rooms if r.type.value == type_value), default=0.0)


# --------------------------------------------------------------------------- #
# Parser
# --------------------------------------------------------------------------- #
def test_parser_maps_common_instructions():
    res = parse_edits(
        ["make the master bedroom bigger", "move the kitchen to the south-east",
         "add a study", "more cross ventilation", "make it two floors"],
        base_bhk=2, base_floors=1,
    )
    assert res.edits.area_scale.get("master", 1) > 1
    assert res.edits.zones.get("kitchen") == ["SE"]
    assert "study" in res.edits.add
    assert res.edits.ventilation_boost is True
    assert res.floors == 2
    assert not res.unmatched


def test_parser_splits_compound_instruction():
    res = parse_edits(["shrink the dining and make the living bigger"], base_bhk=2, base_floors=1)
    assert res.edits.area_scale.get("dining", 1) < 1
    assert res.edits.area_scale.get("living", 1) > 1
    assert not res.unmatched


def test_parser_bedroom_add_changes_bhk_not_room_list():
    res = parse_edits(["add a bedroom"], base_bhk=2, base_floors=1)
    assert res.bhk == 3
    assert not res.edits.add  # not added as a generic room


def test_parser_records_unmatched():
    res = parse_edits(["paint the walls blue"], base_bhk=2, base_floors=1)
    assert res.unmatched == ["paint the walls blue"]
    assert not res.applied


# --------------------------------------------------------------------------- #
# Regeneration stays valid + reflects the edit
# --------------------------------------------------------------------------- #
def test_resize_grows_the_room_and_stays_clean():
    _, base, _, _, _ = _gen([], bhk=2)
    _, plan, _, code, _ = _gen(["make the living much bigger"], bhk=2)
    assert _area(plan, "living") > _area(base, "living")
    assert code.summary.fail_count == 0


def test_add_room_appears_and_remove_drops_it():
    # add on a roomy plot so the study has somewhere to land
    _, added, _, code, _ = _gen(["add a study"], bhk=3, w=12.5, d=15.5)
    assert any(r.type.value == "study" for r in added.rooms)
    assert code.summary.fail_count == 0
    _, removed, _, _, _ = _gen(["remove the dining"], bhk=2)
    assert not any(r.type.value == "dining" for r in removed.rooms)


def test_move_sends_room_to_requested_zone():
    _, plan, _, _, _ = _gen(["move the kitchen to the south-east"], bhk=2)
    kitchen = next(r for r in plan.rooms if r.type.value == "kitchen")
    assert kitchen.zone.value in {"SE", "S", "E"}


# --------------------------------------------------------------------------- #
# Endpoint
# --------------------------------------------------------------------------- #
def _brief(**kw):
    base = {"bhk": 2, "plotWidthM": 9.144, "plotDepthM": 12.192, "facing": "E",
            "state": "KA", "city": "Bengaluru", "floors": 1, "vastuPriority": True}
    base.update(kw)
    return base


def test_refine_endpoint_applies_and_reports():
    r = client.post("/plan/refine", json={
        **_brief(bhk=3), "instructions": ["move the kitchen to the south-east", "more cross ventilation"]})
    assert r.status_code == 200
    body = r.json()
    assert body["code"]["summary"]["failCount"] == 0
    assert body["meta"]["appliedEdits"]
    assert not body["meta"]["unmatchedEdits"]


def test_refine_endpoint_no_instructions_is_baseline():
    r = client.post("/plan/refine", json={**_brief(bhk=2), "instructions": []})
    assert r.status_code == 200
    assert r.json()["meta"]["appliedEdits"] == []
