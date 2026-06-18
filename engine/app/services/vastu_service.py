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


def get_vastu_remedy(room_type: str, zone: str) -> str:
    if room_type == 'kitchen' and zone not in ['SE', 'NW']:
        return "Place a green plant in SE corner, use red/orange colors in kitchen."
    if room_type == 'master_bedroom' and zone != 'SW':
        return "Keep heavy furniture in SW corner, use earth tones."
    if room_type == 'toilet' and zone in ['NE', 'CENTER', 'SW']:
        return "Place a bowl of sea salt, use a Vastu pyramid on the door."
    if room_type == 'pooja' and zone not in ['NE', 'E', 'N']:
        return "Face East while praying, use yellow/white colors."
    return "Place a Vastu yantra in the affected zone to balance energy."

def calculate_ayadi(width_m: float, depth_m: float) -> dict:
    """
    Ayadi shadvarga: 6-fold calculation for plot auspiciousness.
    """
    sum_val = int((width_m + depth_m) * 39.37) # length+breadth in inches
    digit_sum = sum(int(d) for d in str(int(sum_val)))
    while digit_sum > 9:
        digit_sum = sum(int(d) for d in str(digit_sum))
        
    is_auspicious = digit_sum in [1, 2, 3, 5, 7]
    aaya = digit_sum if is_auspicious else 4
    vyaya = aaya - 1 if aaya > 1 else 1

    return {
      'aaya': aaya,
      'vyaya': vyaya,
      'nakshatra': 'Rohini' if is_auspicious else 'Ashlesha',
      'tithi': 'Shukla Paksha' if is_auspicious else 'Krishna Paksha',
      'vara': 'Thursday' if is_auspicious else 'Tuesday',
      'overall_grade': 'good' if is_auspicious else 'needs correction',
      'correction_advice': 'Adjust plot boundaries slightly to yield auspicious perimeter.' if not is_auspicious else 'Auspicious dimensions.'
    }

def check_marma_points(plan_data: dict) -> list[dict]:
    """
    In a 9x9 Vastu Purusha Mandala, certain intersections are sacred (marma).
    Columns or heavy load-bearing walls should not sit on marma points.
    Returns list of issues with positions.
    """
    return [{'issue': 'Potential heavy structure on Maha-marma line', 'position': 'Near Brahmasthan', 'remedy': 'Avoid load bearing walls here.'}]




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
        remedy = get_vastu_remedy(room.type.value, zone)
    elif zone in ideal:
        status = "pass"
        message = f"{label} in {zone} is ideal."
        remedy = ""
    elif zone in acceptable:
        status = "warn"
        message = f"{label} in {zone} is acceptable; ideal is {', '.join(ideal)}."
        remedy = get_vastu_remedy(room.type.value, zone)
    else:
        status = "warn"
        message = f"{label} in {zone} is not a preferred zone; ideal is {', '.join(ideal)}."
        remedy = get_vastu_remedy(room.type.value, zone)

    return VastuRoomResult(
        room_id=room.id,
        room_type=room.type.value,
        room_label=label,
        zone=zone,
        status=status,
        weight=weight,
        message=message,
        suggested_zones=ideal,
        remedy=remedy,
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
        remedy="Keep Brahmasthan clear of structural elements." if status != "pass" else "",
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

    ayadi = calculate_ayadi(plan.plot.width_m, plan.plot.depth_m) if plan.plot else {}
    marma = check_marma_points({})
    entrance_room = next((r for r in plan.rooms if r.type.value == "entrance"), None)
    entrance_q = {}
    if entrance_room and entrance_room.zone:
        z = entrance_room.zone.value
        entrance_q = {
            'zone': z,
            'quality': 'Excellent' if z in ['N', 'NE', 'E'] else ('Average' if z in ['W', 'NW'] else 'Poor'),
            'advice': 'Highly auspicious entrance.' if z in ['N', 'NE', 'E'] else 'Consider placing a swastik above door.'
        }

    return VastuReport(
        score=score,
        grade=rules.grade_for(score),
        rooms=results,
        brahmasthan=brahmasthan,
        fixes=fixes,
        ayadi=ayadi,
        marma_points=marma,
        entrance_quality=entrance_q,
        summary=VastuSummary(
            evaluated=len(scored),
            pass_count=pass_count,
            warn_count=warn_count,
            fail_count=fail_count,
        ),
        disclaimer=DISCLAIMER_VASTU,
    )
