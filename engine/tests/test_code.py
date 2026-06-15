"""Building-code checks."""

from __future__ import annotations

from app.models.plan import Plan
from app.services.code_service import buildable_envelope, check_code
from app.services.plan_service import normalize
from app.services.rules import get_code_rules

BASE_PLOT = {"widthM": 10, "depthM": 10, "facing": "E", "state": "KA", "city": "Bengaluru", "floors": 1}


def _check(rooms, plot=None):
    plan = Plan.model_validate(
        {
            "schemaVersion": "1.0",
            "project": {"id": "t", "name": "t"},
            "plot": plot or BASE_PLOT,
            "rooms": rooms,
            "doors": [],
            "windows": [],
        }
    )
    plan, _ = normalize(plan)
    return check_code(plan, get_code_rules())


def _by_rule(report, rule_id):
    return [c for c in report.checks if c.rule_id == rule_id]


def test_undersized_habitable_room_fails():
    # 2x2 = 4 m2 bedroom, below the 9.5 m2 habitable minimum
    rep = _check([{"id": "b", "type": "bedroom", "polygon": [[3, 3], [5, 3], [5, 5], [3, 5]], "ceilingHeightM": 3}])
    checks = _by_rule(rep, "min_habitable_area")
    assert checks and checks[0].status == "fail"


def test_low_ceiling_fails():
    rep = _check([{"id": "b", "type": "bedroom", "polygon": [[2, 2], [6, 2], [6, 6], [2, 6]], "ceilingHeightM": 2.4}])
    assert _by_rule(rep, "ceiling_height")[0].status == "fail"


def test_setback_violation_fails():
    # room touching plot corner (0,0) crosses front/rear/side setbacks
    rep = _check([{"id": "b", "type": "bedroom", "polygon": [[0, 0], [4, 0], [4, 4], [0, 4]], "ceilingHeightM": 3}])
    assert _by_rule(rep, "setbacks")[0].status == "fail"


def test_stair_width_fails():
    rep = _check([{"id": "s", "type": "staircase", "polygon": [[2, 2], [2.8, 2], [2.8, 5], [2, 5]], "ceilingHeightM": 3}])
    assert _by_rule(rep, "stair_width")[0].status == "fail"


def test_buildable_envelope_east_facing():
    # front (east) 2, rear (west) 1, side 0.5
    assert buildable_envelope(10, 10, "E", 2, 1, 0.5) == (1.0, 0.5, 8.0, 9.5)


def test_buildable_envelope_north_facing():
    assert buildable_envelope(10, 10, "N", 2, 1, 0.5) == (0.5, 1.0, 9.5, 8.0)


def test_sample_plan_no_failures(sample_plan):
    rep = check_code(normalize(sample_plan)[0], get_code_rules())
    assert rep.summary.fail_count == 0
    assert rep.metrics.ground_coverage_pct <= rep.metrics.max_ground_coverage_pct
    assert rep.metrics.far_used <= rep.metrics.far_allowed
