"""Plan normalization — the authoritative pass that fills computed fields.

``normalize`` recomputes ``area_sqm``, ``perimeter_m``, ``centroid`` and ``zone``
for every room from its polygon (and the plot), overwriting whatever the client
sent. Invalid geometry raises :class:`PlanValidationError` (surfaced as HTTP 422).
"""

from __future__ import annotations

from app import config
from app.models.plan import Plan
from app.services import geometry
from app.services.zones import zone_of


class PlanValidationError(ValueError):
    """Raised when a plan cannot be normalized (bad geometry / dangling refs)."""


def normalize(plan: Plan, strategy: str | None = None) -> tuple[Plan, list[str]]:
    """Return (normalized_plan, warnings). Mutates and returns the same Plan."""
    strategy = strategy or config.BRAHMASTHAN_STRATEGY
    warnings: list[str] = []

    # Plot area is always width*depth; warn if the supplied value disagreed.
    computed_area = plan.plot.width_m * plan.plot.depth_m
    if plan.plot.area_sqm and abs(plan.plot.area_sqm - computed_area) > 0.5:
        warnings.append(
            f"plot.areaSqm {plan.plot.area_sqm} replaced with computed {round(computed_area, 3)}"
        )
    plan.plot.area_sqm = round(computed_area, 3)

    room_ids: set[str] = set()
    for room in plan.rooms:
        if room.id in room_ids:
            raise PlanValidationError(f"duplicate room id '{room.id}'")
        room_ids.add(room.id)

        ok, reason = geometry.validate_polygon(room.polygon)
        if not ok:
            raise PlanValidationError(f"room '{room.id}': {reason}")

        cx, cy = geometry.centroid_of(room.polygon)
        room.area_sqm = round(geometry.area_of(room.polygon), 3)
        room.perimeter_m = round(geometry.perimeter_of(room.polygon), 3)
        room.centroid = (round(cx, 4), round(cy, 4))
        room.zone = zone_of(cx, cy, plan.plot.width_m, plan.plot.depth_m, strategy)

    # Openings must reference a real room.
    for opening in (*plan.doors, *plan.windows):
        if opening.room_id not in room_ids:
            raise PlanValidationError(
                f"{opening.kind} '{opening.id}' references unknown room '{opening.room_id}'"
            )

    return plan, warnings
