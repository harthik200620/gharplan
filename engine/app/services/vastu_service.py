"""Vastu evaluation — validate a plan against the data-driven ruleset.

Each ruled room is scored pass / warn / fail by comparing its computed zone to
the rule's ideal / acceptable / forbidden lists. The 0-100 score is a
weight-weighted average of the per-room status scores plus the Brahmasthan rule.
This VALIDATES a given plan; it does not generate one.
"""

from __future__ import annotations

from app.config import DISCLAIMER_VASTU
from app.models.enums import room_label
from app.models.plan import Plan
from app.models.reports import VastuReport, VastuRoomResult, VastuSummary
from app.services.rules import VastuRules


def _evaluate_room(room, rule: dict) -> VastuRoomResult:
    zone = room.zone.value if room.zone else "?"
    ideal = rule.get("ideal", [])
    acceptable = rule.get("acceptable", [])
    forbidden = rule.get("forbidden", [])
    weight = int(rule.get("weight", 1))
    label = room_label(room.type.value)

    if zone in forbidden:
        status = "fail"
        message = f"{label} in {zone} is a Vastu dosha — avoid {', '.join(forbidden)}."
    elif zone in ideal:
        status = "pass"
        message = f"{label} in {zone} is ideal."
    elif zone in acceptable:
        status = "warn"
        message = f"{label} in {zone} is acceptable; ideal is {', '.join(ideal)}."
    else:
        status = "warn"
        message = f"{label} in {zone} is not a preferred zone; ideal is {', '.join(ideal)}."

    return VastuRoomResult(
        room_id=room.id,
        room_type=room.type.value,
        room_label=label,
        zone=zone,
        status=status,
        weight=weight,
        message=message,
        suggested_zones=ideal,
    )


def _evaluate_brahmasthan(plan: Plan, rules: VastuRules) -> VastuRoomResult:
    cfg = rules.brahmasthan()
    weight = int(cfg.get("weight", 4))
    forbidden = set(cfg.get("forbiddenOccupants", []))

    center_rooms = [r for r in plan.rooms if r.zone and r.zone.value == "CENTER"]
    heavy = [r for r in center_rooms if r.type.value in forbidden]
    if heavy:
        status = "fail"
        names = ", ".join(room_label(r.type.value) for r in heavy)
        message = f"Centre (Brahmasthan) occupied by {names} — keep it open."
    elif center_rooms:
        status = "warn"
        names = ", ".join(room_label(r.type.value) for r in center_rooms)
        message = f"Centre (Brahmasthan) has {names}; keeping it open is preferred."
    else:
        status = "pass"
        message = "Centre (Brahmasthan) is open."

    return VastuRoomResult(
        room_id=None,
        room_type="brahmasthan",
        room_label="Brahmasthan",
        zone="CENTER",
        status=status,
        weight=weight,
        message=message,
        suggested_zones=[],
    )


_RANK = {"fail": 0, "warn": 1, "pass": 2}


def check_vastu(plan: Plan, rules: VastuRules) -> VastuReport:
    results: list[VastuRoomResult] = []
    for room in plan.rooms:
        rule = rules.rule_for(room.type.value)
        if rule is None:
            continue  # room type has no Vastu rule (e.g. utility, parking)
        results.append(_evaluate_room(room, rule))

    brahmasthan = _evaluate_brahmasthan(plan, rules)

    scored = results + [brahmasthan]
    total_weight = sum(r.weight for r in scored)
    if total_weight > 0:
        weighted = sum(r.weight * rules.status_score(r.status) for r in scored)
        score = round(100.0 * weighted / total_weight, 1)
    else:
        score = 100.0

    pass_count = sum(1 for r in scored if r.status == "pass")
    warn_count = sum(1 for r in scored if r.status == "warn")
    fail_count = sum(1 for r in scored if r.status == "fail")

    # Fixes: every non-pass result, worst + heaviest first.
    fixes = sorted(
        [r for r in scored if r.status != "pass"],
        key=lambda r: (_RANK[r.status], -r.weight),
    )

    return VastuReport(
        score=score,
        grade=rules.grade_for(score),
        rooms=results,
        brahmasthan=brahmasthan,
        fixes=fixes,
        summary=VastuSummary(
            evaluated=len(scored),
            pass_count=pass_count,
            warn_count=warn_count,
            fail_count=fail_count,
        ),
        disclaimer=DISCLAIMER_VASTU,
    )
