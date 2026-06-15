"""Vastu rule evaluation."""

from __future__ import annotations

from app.models.plan import Plan
from app.services.plan_service import normalize
from app.services.rules import get_vastu_rules
from app.services.vastu_service import check_vastu

# Polygons on a 10x10 plot that land in known zones (centroid-based).
NE = [[7, 7], [9, 7], [9, 9], [7, 9]]
SW = [[1, 1], [3, 1], [3, 3], [1, 3]]
SE = [[7, 1], [9, 1], [9, 3], [7, 3]]
CENTER = [[4.5, 4.5], [5.5, 4.5], [5.5, 5.5], [4.5, 5.5]]


def _one(room_type, polygon):
    plan = Plan.model_validate(
        {
            "schemaVersion": "1.0",
            "project": {"id": "t", "name": "t"},
            "plot": {"widthM": 10, "depthM": 10, "facing": "E", "state": "KA", "city": "Bengaluru", "floors": 1},
            "rooms": [{"id": "r", "type": room_type, "polygon": polygon, "ceilingHeightM": 3}],
            "doors": [],
            "windows": [],
        }
    )
    plan, _ = normalize(plan)
    return check_vastu(plan, get_vastu_rules())


def test_kitchen_in_ne_fails():
    r = _one("kitchen", NE)
    assert r.rooms[0].zone == "NE"
    assert r.rooms[0].status == "fail"


def test_toilet_in_ne_fails():
    assert _one("toilet", NE).rooms[0].status == "fail"


def test_pooja_in_ne_passes():
    r = _one("pooja", NE)
    assert r.rooms[0].zone == "NE"
    assert r.rooms[0].status == "pass"


def test_master_in_sw_passes():
    assert _one("master_bedroom", SW).rooms[0].status == "pass"


def test_kitchen_in_se_passes():
    assert _one("kitchen", SE).rooms[0].status == "pass"


def test_kitchen_in_center_fails_brahmasthan():
    r = _one("kitchen", CENTER)
    assert r.rooms[0].zone == "CENTER"
    assert r.rooms[0].status == "fail"
    assert r.brahmasthan.status == "fail"


def test_score_and_grade():
    good = _one("pooja", NE)  # pooja pass + brahmasthan open
    assert good.score == 100.0
    assert good.grade == "Excellent"
    assert _one("kitchen", NE).score < 100.0


def test_fixes_sorted_fail_first():
    r = _one("kitchen", NE)
    assert r.fixes[0].status == "fail"


def test_sample_plan_excellent(sample_plan):
    r = check_vastu(normalize(sample_plan)[0], get_vastu_rules())
    assert r.grade == "Excellent"
    assert r.score >= 90
    assert r.summary.fail_count == 0
