"""Preliminary building-code / bylaw check.

Computes built-up area, ground coverage %, FAR used vs allowed, setback-envelope
compliance, and per-room minimums (area, dimension, ceiling height, ventilation,
stair width). All thresholds are data-driven per state in ``code_rules.json`` and
are INDICATIVE — see the disclaimer. This is a preliminary review, not approval.
"""

from __future__ import annotations

from app.config import DISCLAIMER_CODE
from app.models.enums import room_label
from app.models.plan import Plan
from app.models.reports import CodeCheck, CodeMetrics, CodeReport, CodeSummary
from app.services import geometry
from app.services.rules import CodeRules

_RANK = {"pass": 0, "warn": 1, "fail": 2}


def _worst(statuses: list[str]) -> str:
    return max(statuses, key=lambda s: _RANK[s]) if statuses else "pass"


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
    habitable = set(cls.get("habitableRoomTypes", []))
    ventilation = set(cls.get("ventilationRoomTypes", []))
    virtual = set(cls.get("virtualRoomTypes", []))
    min_area_by_type = cls.get("minAreaByRoomType", {})

    plot_area = plan.plot.width_m * plan.plot.depth_m
    floors = plan.plot.floors
    real_rooms = [r for r in plan.rooms if r.type.value not in virtual]

    footprint = geometry.union_area([r.polygon for r in real_rooms])
    built_up = footprint * floors
    coverage_pct = (footprint / plot_area * 100.0) if plot_area else 0.0
    far_used = (built_up / plot_area) if plot_area else 0.0

    checks: list[CodeCheck] = []

    # --- ground coverage ---
    max_cov = float(st["maxGroundCoveragePct"])
    checks.append(
        CodeCheck(
            rule_id="ground_coverage",
            label="Ground coverage",
            status="pass" if coverage_pct <= max_cov + 1e-6 else "fail",
            actual=_fmt(coverage_pct, "%"),
            required=f"<= {max_cov} %",
            message=f"Footprint covers {round(coverage_pct, 1)}% of the plot (limit {max_cov}%).",
        )
    )

    # --- FAR ---
    far_allowed = float(st["FAR"])
    checks.append(
        CodeCheck(
            rule_id="far",
            label="Floor Area Ratio",
            status="pass" if far_used <= far_allowed + 1e-6 else "fail",
            actual=_fmt(far_used, ""),
            required=f"<= {far_allowed}",
            message=f"FAR used {round(far_used, 2)} of {far_allowed} allowed ({floors} floor(s)).",
        )
    )

    # --- setbacks ---
    band = rules.setback_for(state_code, plot_area)
    env = buildable_envelope(
        plan.plot.width_m,
        plan.plot.depth_m,
        plan.plot.facing.value,
        float(band.get("frontM", 0)),
        float(band.get("rearM", 0)),
        float(band.get("sideM", 0)),
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
            f"(front {band.get('frontM')} / rear {band.get('rearM')} / side {band.get('sideM')} m)."
        )
    checks.append(
        CodeCheck(
            rule_id="setbacks",
            label="Setbacks",
            status=setback_status,
            actual=f"{len(encroachers)} encroaching",
            required="0 encroaching",
            message=setback_msg,
        )
    )

    # --- parking ---
    parking_req = int(st.get("parkingPerDwelling", 1))
    parking_have = sum(1 for r in plan.rooms if r.type.value == "parking")
    checks.append(
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
        disclaimer=DISCLAIMER_CODE,
    )
