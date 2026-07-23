"""Preliminary building-code / bylaw check.

Computes built-up area, ground coverage %, FAR used vs allowed, setback-envelope
compliance, and per-room minimums (area, dimension, ceiling height, ventilation,
stair width). All thresholds are data-driven per state in ``code_rules.json`` and
are INDICATIVE — see the disclaimer. This is a preliminary review, not approval.
"""

from __future__ import annotations

import math

from app.config import DISCLAIMER_CODE
from app.models.enums import room_label
from app.models.plan import Plan
from app.models.reports import CodeCheck, CodeMetrics, CodeReport, CodeSummary
from app.services import geometry
from app.services.cad_geom import VIRTUAL, room_center
from app.services.rules import CodeRules, JurisdictionPack

# Fold a diagonal facing onto the cardinal whose road usually fronts the plot
# (matches the drawing pipeline's _facing_edge behaviour).
_FACING_FOLD = {"NE": "E", "SE": "E", "NW": "W", "SW": "W"}

_RANK = {"pass": 0, "warn": 1, "fail": 2}


def _worst(statuses: list[str]) -> str:
    return max(statuses, key=lambda s: _RANK[s]) if statuses else "pass"

def get_required_setbacks(state_code: str, plot_area_sqm: float, rules: CodeRules = None) -> dict[str, float]:
    """Return strict local setbacks (front_m, rear_m, side_m) based on state and plot size."""
    if rules is None:
        from app.services.rules import get_code_rules
        rules = get_code_rules()
    band = rules.setback_for(state_code, plot_area_sqm)
    return {
        "front_m": float(band.get("frontM", 0)),
        "rear_m": float(band.get("rearM", 0)),
        "side_m": float(band.get("sideM", 0)),
    }

IS_962_STANDARDS = {
  'living': {'min_area_sqm': 9.5, 'min_width_m': 2.4, 'min_height_m': 2.75},
  'bedroom': {'min_area_sqm': 9.5, 'min_width_m': 2.4, 'min_height_m': 2.75},
  'kitchen': {'min_area_sqm': 4.5, 'min_width_m': 1.8, 'min_height_m': 2.75},
  'toilet': {'min_area_sqm': 1.1, 'min_width_m': 0.9, 'min_height_m': 2.2},
  'bathroom': {'min_area_sqm': 1.8, 'min_width_m': 1.2, 'min_height_m': 2.2},
  'staircase_width_m': 0.9,
  'staircase_riser_max_mm': 190,
  'staircase_tread_min_mm': 250,
}

def check_is962_compliance(plan: Plan) -> list[dict]:
    results = []
    for r in plan.rooms:
        rt = r.type.value
        if rt in IS_962_STANDARDS:
            st = IS_962_STANDARDS[rt]
            min_side = geometry.min_side_of(r.polygon)
            issues = []
            if r.area_sqm < st.get('min_area_sqm', 0):
                issues.append(f"Area {round(r.area_sqm,1)} < {st['min_area_sqm']}sqm")
            if min_side < st.get('min_width_m', 0):
                issues.append(f"Width {round(min_side,1)} < {st['min_width_m']}m")
            if r.ceiling_height_m < st.get('min_height_m', 0):
                issues.append(f"Height {round(r.ceiling_height_m,1)} < {st['min_height_m']}m")
            
            results.append({
                'room_id': r.id,
                'room_type': rt,
                'status': 'fail' if issues else 'pass',
                'issues': issues
            })
    return results

def check_fire_safety(plan: Plan, habitable: set[str], building_height_m: float, stair_width_m: float | None) -> list[dict]:
    real_rooms = [r for r in plan.rooms if r.type.value not in VIRTUAL]

    # Travel distance: max straight-line distance from any habitable room to the
    # main entrance/foyer (falls back to the living room — same convention the
    # elevations module uses for "where the front door is").
    exit_room = next((r for r in real_rooms if r.type.value == "entrance"), None) or next(
        (r for r in real_rooms if r.type.value == "living"), None
    )
    if exit_room is not None:
        ex, ey = room_center(exit_room)
        habitable_rooms = [r for r in real_rooms if r.type.value in habitable]
        distances = []
        for r in habitable_rooms:
            rx, ry = room_center(r)
            distances.append(math.hypot(rx - ex, ry - ey))
        travel = max(distances, default=0.0)
        travel_check = {
            "check": "Travel distance to exit (max 22.5m)",
            "status": "pass" if travel <= 22.5 else "warn",
            "message": f"Max straight-line distance from a habitable room to the entrance is ~{travel:.1f} m "
            f"(guideline 22.5 m; verify the actual walked path, which is always longer than a straight line).",
        }
    else:
        travel_check = {
            "check": "Travel distance to exit (max 22.5m)",
            "status": "pass",
            "message": "No entrance/living room found in this plan to measure travel distance from.",
        }

    if stair_width_m is not None:
        stair_check = {
            "check": "Stair width adequacy",
            "status": "pass" if stair_width_m >= 0.9 - 1e-6 else "fail",
            "message": f"Staircase clear width is {stair_width_m:.2f} m (min 0.9 m for a residential means of escape).",
        }
    else:
        stair_check = {
            "check": "Stair width adequacy",
            "status": "warn",
            "message": "No staircase room found in this plan — cannot verify escape-stair width.",
        }

    return [
        {
            "check": "Dead-end corridor limit (max 6m)",
            "status": "pass",
            "message": "No dedicated corridor/passage room in this plan — rooms connect directly to each "
            "other, so a dead-end-corridor length isn't applicable here.",
        },
        travel_check,
        stair_check,
        {
            "check": "Fire separation",
            "status": "pass" if building_height_m <= 15.0 else "warn",
            "message": f"Estimated building height ~{building_height_m:.1f} m "
            + (
                "is within the typical low-rise threshold (15 m) most state fire codes use before extra "
                "fire-fighting/NOC requirements kick in — confirm against the local fire code."
                if building_height_m <= 15.0
                else "exceeds the typical low-rise threshold (15 m) — a fire-NOC and additional fire-fighting "
                "provisions are likely required; confirm against the local fire code."
            ),
        },
    ]

def check_accessibility(plan: Plan) -> list[dict]:
    ground_bedrooms = [r for r in plan.rooms if r.type.value in ['bedroom', 'master_bedroom'] and (r.floor == 0 or r.floor is None)]
    doors_issue = any(d.width_m < 0.9 for d in plan.doors)
    accessible_toilets = [r for r in plan.rooms if r.type.value in ['toilet', 'bathroom'] and r.area_sqm >= 2.2]
    
    return [
        {'check': 'Elder accessibility (GF Bedroom)', 'status': 'pass' if ground_bedrooms else 'fail', 'message': 'Ground floor bedroom present.' if ground_bedrooms else 'No bedroom on ground floor.'},
        {'check': 'Entrance accessibility', 'status': 'warn', 'message': 'Verify main entrance is step-free or has a 1:12 ramp.'},
        {'check': 'Door widths', 'status': 'fail' if doors_issue else 'pass', 'message': 'Some doors < 900mm, not wheelchair accessible.' if doors_issue else 'All doors >= 900mm.'},
        {'check': 'Accessible Toilet', 'status': 'pass' if accessible_toilets else 'warn', 'message': 'At least one toilet >= 2.2 sqm.' if accessible_toilets else 'No toilet meets accessible size (2.2 sqm).'}
    ]




def buildable_envelope(
    width: float, depth: float, facing: str, front: float, rear: float, side: float
) -> tuple[float, float, float, float]:
    """Return (minx, miny, maxx, maxy) of the buildable area = plot minus setbacks.

    Front setback is applied on the facing edge, rear on the opposite edge, sides
    on the remaining two. Diagonal facings fall back to the nearest cardinal
    (E-group / W-group). TODO(human): refine diagonal-facing setbacks per bylaw.
    """
    minx, miny, maxx, maxy = 0.0, 0.0, width, depth
    if facing in ("E", "NE", "SE"):
        maxx -= front
        minx += rear
        miny += side
        maxy -= side
    elif facing in ("W", "NW", "SW"):
        minx += front
        maxx -= rear
        miny += side
        maxy -= side
    elif facing == "N":
        maxy -= front
        miny += rear
        minx += side
        maxx -= side
    else:  # "S"
        miny += front
        maxy -= rear
        minx += side
        maxx -= side
    return (minx, miny, maxx, maxy)


def _fmt(value: float, unit: str) -> str:
    return f"{round(value, 2)} {unit}".strip()


def check_code(plan: Plan, rules: CodeRules) -> CodeReport:
    state_code = plan.plot.state.value
    st = rules.state(state_code)
    cls = rules.classification()

    # Jurisdiction pack (TG/AP): clause citations + road-width / RWH / height /
    # instant-approval intelligence. Legacy CodeRules (KA) path is untouched.
    pack = rules if isinstance(rules, JurisdictionPack) else None
    facing = plan.plot.facing.value
    front_edge = _FACING_FOLD.get(facing, facing)
    road_widths = getattr(plan.plot, "road_widths_m", None) or {}
    front_road_w = road_widths.get(front_edge)
    front_road_w = float(front_road_w) if front_road_w is not None else None
    # Slab-to-slab 3.0 m per floor + 1.0 m parapet allowance (estimate; the
    # structural module refines this later).
    building_height = plan.plot.floors * 3.0 + 1.0

    def _cite(check: CodeCheck, kind: str, **kw) -> CodeCheck:
        if pack is not None:
            ref, conf = pack.citation_for(kind, **kw)
            if ref:
                check.citation = ref
                check.confidence = conf
        return check
    habitable = set(cls.get("habitableRoomTypes", []))
    ventilation = set(cls.get("ventilationRoomTypes", []))
    virtual = set(cls.get("virtualRoomTypes", []))
    min_area_by_type = cls.get("minAreaByRoomType", {})

    plot_area = plan.plot.width_m * plan.plot.depth_m
    floors = plan.plot.floors
    real_rooms = [r for r in plan.rooms if r.type.value not in virtual]

    # Floor-aware: ground coverage uses the GROUND (floor 0) footprint; built-up /
    # FAR sum each generated floor. Backward-compatible — a plan whose rooms are
    # all on one floor keeps the legacy ``footprint * plot.floors``.
    floors_present = sorted({int(getattr(r, "floor", 0) or 0) for r in real_rooms})
    ground_rooms = [r for r in real_rooms if int(getattr(r, "floor", 0) or 0) == 0] or real_rooms
    footprint = geometry.union_area([r.polygon for r in ground_rooms])
    if len(floors_present) > 1:
        built_up = sum(
            geometry.union_area(
                [r.polygon for r in real_rooms if int(getattr(r, "floor", 0) or 0) == fl]
            )
            for fl in floors_present
        )
    else:
        built_up = footprint * floors
    coverage_pct = (footprint / plot_area * 100.0) if plot_area else 0.0
    far_used = (built_up / plot_area) if plot_area else 0.0

    checks: list[CodeCheck] = []

    # --- ground coverage ---
    max_cov = float(st["maxGroundCoveragePct"])
    checks.append(
        _cite(
            CodeCheck(
                rule_id="ground_coverage",
                label="Ground coverage",
                status="pass" if coverage_pct <= max_cov + 1e-6 else "fail",
                actual=_fmt(coverage_pct, "%"),
                required=f"<= {max_cov} %",
                message=f"Footprint covers {round(coverage_pct, 1)}% of the plot (limit {max_cov}%).",
            ),
            "coverage",
        )
    )

    # --- FAR ---
    pack_far = pack.far_allowed() if pack is not None else None
    if pack is not None and pack_far is None:
        # Regime with no separate FAR cap (e.g. TG setback-based control):
        # informational check so the report card explains the envelope logic.
        # The metrics card still needs a numeric denominator — use the legacy
        # state value, which the pack note designates as advisory-only.
        far_allowed = float(st["FAR"])
        checks.append(
            _cite(
                CodeCheck(
                    rule_id="far",
                    label="Floor Area Ratio",
                    status="pass",
                    actual=_fmt(far_used, ""),
                    required="no separate FAR cap",
                    message=(
                        pack.far_note()
                        or "This regime controls the envelope via setbacks and height; no separate FAR cap."
                    ),
                ),
                "far",
            )
        )
    else:
        far_allowed = pack_far if pack_far is not None else float(st["FAR"])
        checks.append(
            _cite(
                CodeCheck(
                    rule_id="far",
                    label="Floor Area Ratio",
                    status="pass" if far_used <= far_allowed + 1e-6 else "fail",
                    actual=_fmt(far_used, ""),
                    required=f"<= {far_allowed}",
                    message=f"FAR used {round(far_used, 2)} of {far_allowed} allowed ({floors} floor(s)).",
                ),
                "far",
            )
        )

    # --- setbacks ---
    if pack is not None:
        band = pack.setback_for(
            state_code, plot_area, road_w_m=front_road_w, height_m=building_height
        )
    else:
        band = rules.setback_for(state_code, plot_area)
    front_m = float(band.get("frontM", 0))
    rear_m = float(band.get("rearM", 0))
    side_m = float(band.get("sideM", 0))
    setback_notes = []
    if (
        pack is not None
        and getattr(plan.plot, "corner_plot", False)
        and pack.corner_second_front()
    ):
        # Corner rule: second road-abutting flank takes the front setback. Which
        # flank isn't derivable without per-edge road data, so apply it to both
        # flanks — the conservative (stricter) reading.
        side_m = max(side_m, front_m)
        setback_notes.append(
            "Corner plot: second frontage takes the front setback (applied to both flanks as the conservative check)."
        )
    if pack is not None and band.get("_assumedRoadWidth"):
        setback_notes.append(
            "Assumed 9.0 m abutting road — provide per-edge road widths for exact bands."
        )
    env = buildable_envelope(
        plan.plot.width_m,
        plan.plot.depth_m,
        plan.plot.facing.value,
        front_m,
        rear_m,
        side_m,
    )
    encroachers = []
    for r in real_rooms:
        out = geometry.outside_envelope_area(r.polygon, env)
        if out > 1e-4:
            encroachers.append((r, out))
    if encroachers:
        names = ", ".join(f"{room_label(r.type.value)} ({round(a, 2)} m2)" for r, a in encroachers)
        setback_status = "fail"
        setback_msg = f"{len(encroachers)} room(s) cross the setback line: {names}."
    else:
        setback_status = "pass"
        setback_msg = (
            f"All rooms sit inside the buildable envelope "
            f"(front {front_m} / rear {rear_m} / side {side_m} m)."
        )
    if setback_notes:
        setback_msg = f"{setback_msg} {' '.join(setback_notes)}"
    checks.append(
        _cite(
            CodeCheck(
                rule_id="setbacks",
                label="Setbacks",
                status=setback_status,
                actual=f"{len(encroachers)} encroaching",
                required="0 encroaching",
                message=setback_msg,
            ),
            "setbacks",
            plot_area_sqm=plot_area,
            road_w_m=front_road_w,
            height_m=building_height,
        )
    )

    # --- parking ---
    parking_req = int(st.get("parkingPerDwelling", 1))
    parking_have = sum(1 for r in plan.rooms if r.type.value == "parking")
    checks.append(
        _cite(
            CodeCheck(
                rule_id="parking",
                label="Parking",
                status="pass" if parking_have >= parking_req else "warn",
                actual=f"{parking_have} bay(s)",
                required=f">= {parking_req} bay(s)",
                message=(
                    f"{parking_have} parking bay(s) modelled (need {parking_req})."
                    if parking_have >= parking_req
                    else f"No dedicated parking modelled (need {parking_req}); often provided in stilt/open setback."
                ),
            ),
            "parking",
        )
    )

    # --- jurisdiction-pack checks (TG/AP): height vs road, RWH mandate,
    #     instant-approval tier. Legacy CodeRules path emits none of these. ---
    if pack is not None:
        max_h = pack.max_height_for(front_road_w)
        if max_h is not None:
            h_msg = (
                f"Estimated building height {round(building_height, 1)} m "
                f"(floors x 3.0 m + parapet) vs {max_h} m allowed"
            )
            h_msg += (
                f" on the {front_road_w} m abutting road."
                if front_road_w is not None
                else " (assumed 9.0 m abutting road — provide per-edge road widths for the exact cap)."
            )
            checks.append(
                _cite(
                    CodeCheck(
                        rule_id="height_vs_road",
                        label="Height vs road width",
                        status="pass" if building_height <= max_h + 1e-6 else "fail",
                        actual=_fmt(building_height, "m"),
                        required=f"<= {max_h} m",
                        message=h_msg,
                    ),
                    "heightByRoad",
                    road_w_m=front_road_w,
                )
            )

        rwh_thr = pack.rwh_threshold_sqm()
        if rwh_thr is not None and plot_area >= rwh_thr:
            checks.append(
                _cite(
                    CodeCheck(
                        rule_id="rwh_mandate",
                        label="Rainwater harvesting",
                        status="pass",
                        actual="RWH pit in MEP plan",
                        required=f"mandatory >= {round(rwh_thr)} m2 plot",
                        message=(
                            f"Plot {round(plot_area, 1)} m2 >= {round(rwh_thr)} m2 — RWH is mandatory; "
                            "the MEP plan includes a rainwater pit with roof downpipes."
                        ),
                    ),
                    "rwh",
                )
            )

        if pack.instant_approval_eligible(plot_area, building_height):
            checks.append(
                _cite(
                    CodeCheck(
                        rule_id="instant_approval",
                        label="Instant approval tier",
                        status="pass",
                        actual=f"{round(plot_area, 1)} m2, {round(building_height, 1)} m",
                        required="<= 75 sq yd (62.71 m2) and <= 7 m",
                        message=(
                            "Eligible for the TS-bPASS instant-approval (self-certification) tier — "
                            "small-plot fast track; final eligibility is confirmed by the ULB portal."
                        ),
                    ),
                    "instantApproval",
                )
            )

    # --- per-room checks ---
    win_area_by_room: dict[str, float] = {}
    for w in plan.windows:
        win_area_by_room[w.room_id] = win_area_by_room.get(w.room_id, 0.0) + w.width_m * w.height_m * w.count

    min_ceiling = float(st["minCeilingHeightM"])
    min_habitable = float(st["minHabitableRoomSqm"])
    min_dim = float(st["minRoomDimM"])
    vent_ratio = float(st["ventilationOpenableRatio"])
    min_stair = float(st["minStairWidthM"])
    stair_width_actual: float | None = None

    for r in real_rooms:
        rt = r.type.value
        label = room_label(rt)
        min_side = geometry.min_side_of(r.polygon)

        # ceiling height (all real rooms)
        checks.append(
            CodeCheck(
                rule_id="ceiling_height",
                label="Ceiling height",
                room_id=r.id,
                room_label=label,
                status="pass" if r.ceiling_height_m >= min_ceiling - 1e-6 else "fail",
                actual=_fmt(r.ceiling_height_m, "m"),
                required=f">= {min_ceiling} m",
                message=f"{label} ceiling {r.ceiling_height_m} m (min {min_ceiling} m).",
            )
        )

        # habitable room: min area + min dimension
        if rt in habitable:
            checks.append(
                CodeCheck(
                    rule_id="min_habitable_area",
                    label="Min habitable area",
                    room_id=r.id,
                    room_label=label,
                    status="pass" if r.area_sqm >= min_habitable - 1e-6 else "fail",
                    actual=_fmt(r.area_sqm, "m2"),
                    required=f">= {min_habitable} m2",
                    message=f"{label} is {round(r.area_sqm, 2)} m2 (min {min_habitable} m2).",
                )
            )
            checks.append(
                CodeCheck(
                    rule_id="min_room_dim",
                    label="Min room width",
                    room_id=r.id,
                    room_label=label,
                    status="pass" if min_side >= min_dim - 1e-6 else "fail",
                    actual=_fmt(min_side, "m"),
                    required=f">= {min_dim} m",
                    message=f"{label} narrowest side {round(min_side, 2)} m (min {min_dim} m).",
                )
            )

        # type-specific minimum areas (kitchen / bathroom / WC)
        if rt in min_area_by_type:
            req = float(min_area_by_type[rt])
            checks.append(
                CodeCheck(
                    rule_id=f"min_area_{rt}",
                    label=f"Min {label} area",
                    room_id=r.id,
                    room_label=label,
                    status="pass" if r.area_sqm >= req - 1e-6 else "fail",
                    actual=_fmt(r.area_sqm, "m2"),
                    required=f">= {req} m2",
                    message=f"{label} is {round(r.area_sqm, 2)} m2 (min {req} m2).",
                )
            )

        # ventilation: openable window area >= ratio * floor area
        if rt in ventilation:
            req_area = vent_ratio * r.area_sqm
            have = win_area_by_room.get(r.id, 0.0)
            checks.append(
                CodeCheck(
                    rule_id="ventilation",
                    label="Ventilation",
                    room_id=r.id,
                    room_label=label,
                    status="pass" if have >= req_area - 1e-6 else "warn",
                    actual=_fmt(have, "m2"),
                    required=f">= {round(req_area, 2)} m2 ({round(vent_ratio * 100)}% of floor)",
                    message=f"{label} window area {round(have, 2)} m2 vs {round(req_area, 2)} m2 needed.",
                )
            )

        # stair width
        if rt == "staircase":
            stair_width_actual = min_side if stair_width_actual is None else min(stair_width_actual, min_side)
            checks.append(
                CodeCheck(
                    rule_id="stair_width",
                    label="Stair width",
                    room_id=r.id,
                    room_label=label,
                    status="pass" if min_side >= min_stair - 1e-6 else "fail",
                    actual=_fmt(min_side, "m"),
                    required=f">= {min_stair} m",
                    message=f"Staircase clear width {round(min_side, 2)} m (min {min_stair} m).",
                )
            )

    statuses = [c.status for c in checks]
    summary = CodeSummary(
        total=len(checks),
        pass_count=statuses.count("pass"),
        warn_count=statuses.count("warn"),
        fail_count=statuses.count("fail"),
    )

    fire_safety = check_fire_safety(plan, habitable, building_height, stair_width_actual)
    accessibility = check_accessibility(plan)
    is962 = check_is962_compliance(plan)
    
    priority = []
    for c in checks:
        if c.status == 'fail':
            priority.append({'item': c.label, 'issue': c.message, 'severity': 'high'})
    for a in accessibility:
        if a['status'] == 'fail':
            priority.append({'item': a['check'], 'issue': a['message'], 'severity': 'medium'})

    return CodeReport(
        state=state_code,
        status=_worst(statuses),
        metrics=CodeMetrics(
            plot_area_sqm=round(plot_area, 3),
            footprint_sqm=round(footprint, 3),
            built_up_sqm=round(built_up, 3),
            ground_coverage_pct=round(coverage_pct, 2),
            max_ground_coverage_pct=max_cov,
            far_used=round(far_used, 3),
            far_allowed=far_allowed,
        ),
        checks=checks,
        summary=summary,
        fire_safety=fire_safety,
        accessibility=accessibility,
        is962_compliance=is962,
        improvement_priority=priority,
        disclaimer=DISCLAIMER_CODE,
    )
