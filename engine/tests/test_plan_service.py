"""Plan normalization + validation."""

from __future__ import annotations

import pytest

from app.models.plan import Plan
from app.services.plan_service import PlanValidationError, normalize


def test_normalize_synthetic_recomputes_geometry(synthetic_plan):
    plan, warnings = normalize(synthetic_plan)
    room = plan.rooms[0]
    assert room.area_sqm == 12.0
    assert room.perimeter_m == 14.0
    assert room.centroid == (2.0, 1.5)
    assert room.zone is not None
    assert plan.plot.area_sqm == 12.0
    assert warnings == []


def test_normalize_fixture_zones(sample_plan):
    plan, _ = normalize(sample_plan)
    zones = {r.id: r.zone.value for r in plan.rooms}
    assert zones["kitchen"] == "SE"
    assert zones["master"] == "SW"
    assert zones["pooja"] == "NE"
    assert zones["toilet1"] == "W"
    assert zones["living"] == "E"


def _plan(rooms, doors=None):
    return Plan.model_validate(
        {
            "schemaVersion": "1.0",
            "project": {"id": "x", "name": "x"},
            "plot": {"widthM": 5, "depthM": 5, "facing": "E", "state": "KA", "city": "Bengaluru", "floors": 1},
            "rooms": rooms,
            "doors": doors or [],
            "windows": [],
        }
    )


def test_zero_area_polygon_raises():
    plan = _plan([{"id": "r", "type": "bedroom", "polygon": [[0, 0], [1, 0], [2, 0]], "ceilingHeightM": 3}])
    with pytest.raises(PlanValidationError):
        normalize(plan)


def test_dangling_opening_raises():
    plan = _plan(
        [{"id": "r", "type": "bedroom", "polygon": [[0, 0], [4, 0], [4, 3], [0, 3]], "ceilingHeightM": 3}],
        doors=[{"id": "d", "roomId": "ghost", "kind": "door", "widthM": 1, "heightM": 2, "count": 1}],
    )
    with pytest.raises(PlanValidationError):
        normalize(plan)


def test_duplicate_room_id_raises():
    poly = [[0, 0], [2, 0], [2, 2], [0, 2]]
    plan = _plan(
        [
            {"id": "dup", "type": "bedroom", "polygon": poly, "ceilingHeightM": 3},
            {"id": "dup", "type": "kitchen", "polygon": poly, "ceilingHeightM": 3},
        ]
    )
    with pytest.raises(PlanValidationError):
        normalize(plan)
