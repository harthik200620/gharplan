"""Parametric scaler — fit a template's fractional rooms into a real plot.

Each template room is a rectangle in [0,1] fractions of the buildable envelope
(plot minus setbacks). The scaler maps those into the actual envelope so the
Vastu zoning is preserved, then the caller runs Vastu + code checks.
"""

from __future__ import annotations

from app.models.plan import Opening, Plan, Plot, Project, Room
from app.services.code_service import buildable_envelope
from app.services.rules import CodeRules


def scale_template(template: dict, plot: Plot, code_rules: CodeRules, project_name: str | None = None) -> Plan:
    plot_area = plot.width_m * plot.depth_m
    band = code_rules.setback_for(plot.state.value, plot_area)
    minx, miny, maxx, maxy = buildable_envelope(
        plot.width_m,
        plot.depth_m,
        plot.facing.value,
        float(band.get("frontM", 0)),
        float(band.get("rearM", 0)),
        float(band.get("sideM", 0)),
    )
    ew, ed = maxx - minx, maxy - miny

    rooms: list[Room] = []
    for tr in template["rooms"]:
        fx0, fy0, fx1, fy1 = tr["rect"]
        x0, x1 = minx + fx0 * ew, minx + fx1 * ew
        y0, y1 = miny + fy0 * ed, miny + fy1 * ed
        rooms.append(
            Room(
                id=tr["id"],
                type=tr["type"],
                polygon=[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
                ceiling_height_m=tr.get("ceilingHeightM", 3.0),
            )
        )

    doors = [Opening.model_validate(d) for d in template.get("doors", [])]
    windows = [Opening.model_validate(w) for w in template.get("windows", [])]

    return Plan(
        project=Project(
            id=f"gen-{template['id']}",
            name=project_name or f"Generated — {template['name']}",
            created_at=None,
        ),
        plot=plot,
        rooms=rooms,
        doors=doors,
        windows=windows,
    )
