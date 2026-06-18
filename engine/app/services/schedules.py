"""Door/Window schedule, Finishes schedule and Area statement — the DATA layer.

A faithful Python port of the non-React logic in
``web/components/studio/schedules.tsx``. Only the data derivation is ported; the
JSX/presentation is the web app's concern. Numbers, branch order and strings
mirror the TypeScript exactly.

Keep this in lock-step with ``web/components/studio/schedules.tsx``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from app.models.enums import room_label
from app.models.plan import Opening, Plan

SQM_TO_SQFT = 10.7639

__all__ = [
    "to_mm",
    "sqft",
    "OpeningGroup",
    "default_height",
    "opening_schedule",
    "type_label",
    "Finish",
    "FINISH_DEFAULT",
    "FINISHES",
    "finish_for",
    "present_types",
    "floor_name",
    "per_floor_built_up",
    "area_statement",
]


def to_mm(m: float) -> int:
    """metres -> masonry-opening size in mm, e.g. 0.9 -> 900. Rounded to nearest 5 mm.

    Mirrors JS ``Math.round((m * 1000) / 5) * 5`` (round half up).
    """
    return int(math.floor((m * 1000) / 5 + 0.5)) * 5


def sqft(sqm: float) -> str:
    """Square metres rendered as square feet with thousands separators, no decimals."""
    v = sqm * SQM_TO_SQFT
    return f"{round(v):,}"


# ---------------------------------------------------------------------------
# Door & Window schedule
# ---------------------------------------------------------------------------


@dataclass
class OpeningGroup:
    mark: str
    kind: str  # "door" | "window"
    is_vent: bool
    width_m: float
    height_m: float
    qty: int
    description: str
    type_detail: str = ""
    frame_material: str = ""
    hardware: str = ""
    glazing: str = ""
    u_value: str = ""
    shgc: str = ""
    remarks: str = ""


def default_height(o: Opening) -> float:
    """Default leaf height (m) when an opening omits it."""
    if o.kind == "door":
        return 2.1
    # Windows: sill 0.9 + a ~1.2 m vent ~= 1.2 m typical; ventilators are short.
    return 0.45 if o.width_m <= 0.6 else 1.2


def _door_description(width_m: float) -> str:
    if width_m >= 1.0:
        return "Main entrance door"
    if width_m >= 0.75:
        return "Flush door"
    return "Bathroom door"


def _window_description(width_m: float, is_vent: bool) -> str:
    if is_vent:
        return "Ventilator"
    if width_m >= 1.8:
        return "Large window"
    if width_m >= 1.2:
        return "Window"
    return "Small window"


@dataclass
class _Acc:
    kind: str
    is_vent: bool
    width_m: float
    height_m: float
    qty: int


def opening_schedule(plan: Plan) -> list[OpeningGroup]:
    """Group raw openings by (kind, width, height) and assign D#/W#/V# marks."""
    groups: dict[str, _Acc] = {}

    def collect(items: list[Opening]) -> None:
        for o in items:
            width_m = o.width_m
            height_m = o.height_m if (o.height_m and o.height_m > 0) else default_height(o)
            is_vent = o.kind == "window" and width_m <= 0.6 and height_m <= 0.6
            key = f"{o.kind}|{to_mm(width_m)}|{to_mm(height_m)}|{'v' if is_vent else ''}"
            count = o.count if (o.count and o.count > 0) else 1
            prev = groups.get(key)
            if prev:
                prev.qty += count
            else:
                groups[key] = _Acc(kind=o.kind, is_vent=is_vent, width_m=width_m, height_m=height_m, qty=count)

    collect(plan.doors or [])
    collect(plan.windows or [])

    all_groups = list(groups.values())

    def by_width_desc(g: _Acc) -> tuple[float, float]:
        # JS comparator: b.widthM - a.widthM || b.heightM - a.heightM (descending)
        return (-g.width_m, -g.height_m)

    doors = sorted([g for g in all_groups if g.kind == "door"], key=by_width_desc)
    windows = sorted([g for g in all_groups if g.kind == "window" and not g.is_vent], key=by_width_desc)
    vents = sorted([g for g in all_groups if g.kind == "window" and g.is_vent], key=by_width_desc)

    out: list[OpeningGroup] = []
    for i, g in enumerate(doors):
        out.append(
            OpeningGroup(
                mark=f"D{i + 1}",
                kind=g.kind,
                is_vent=g.is_vent,
                width_m=g.width_m,
                height_m=g.height_m,
                qty=g.qty,
                description=_door_description(g.width_m),
                type_detail="Panel/Teak" if g.width_m >= 1.0 else "Flush",
                frame_material="Sal wood / WPC",
                hardware="SS Mortise lock, 3 hinges, door stopper",
                remarks="Ensure 5mm bottom clearance."
            )
        )
    for i, g in enumerate(windows):
        out.append(
            OpeningGroup(
                mark=f"W{i + 1}",
                kind=g.kind,
                is_vent=g.is_vent,
                width_m=g.width_m,
                height_m=g.height_m,
                qty=g.qty,
                description=_window_description(g.width_m, False),
                type_detail="Sliding (2.5 track)",
                frame_material="UPVC / Aluminum",
                glazing="6mm toughened clear",
                u_value="< 3.0 W/m²K",
                shgc="< 0.4",
                remarks="Include mosquito mesh."
            )
        )
    for i, g in enumerate(vents):
        out.append(
            OpeningGroup(
                mark=f"V{i + 1}",
                kind=g.kind,
                is_vent=g.is_vent,
                width_m=g.width_m,
                height_m=g.height_m,
                qty=g.qty,
                description="Ventilator",
            )
        )
    return out


def type_label(g: OpeningGroup) -> str:
    if g.is_vent:
        return "Ventilator"
    return "Door" if g.kind == "door" else "Window"


# ---------------------------------------------------------------------------
# Finishes schedule
# ---------------------------------------------------------------------------


@dataclass
class Finish:
    floor: str
    dado: str
    walls: str
    ceiling: str


FINISH_DEFAULT = Finish(
    floor="Vitrified tiles",
    dado="100 mm skirting",
    walls="Putty + emulsion",
    ceiling="POP + paint",
)

FINISHES: dict[str, Finish] = {
    "living": Finish("Vitrified tiles", "100 mm skirting", "Putty + emulsion", "POP + paint"),
    "dining": Finish("Vitrified tiles", "100 mm skirting", "Putty + emulsion", "POP + paint"),
    "bedroom": Finish("Vitrified tiles", "100 mm skirting", "Putty + emulsion", "POP + paint"),
    "master_bedroom": Finish("Vitrified tiles", "100 mm skirting", "Putty + emulsion", "POP + paint"),
    "childrens_bedroom": Finish("Vitrified tiles", "100 mm skirting", "Putty + emulsion", "POP + paint"),
    "study": Finish("Vitrified tiles", "100 mm skirting", "Putty + emulsion", "POP + paint"),
    "kitchen": Finish("Anti-skid tiles", "600 mm dado tiles", "Emulsion", "POP + paint"),
    "toilet": Finish("Anti-skid tiles", "2100 mm full-height dado", "Waterproof emulsion", "Grid ceiling"),
    "bathroom": Finish("Anti-skid tiles", "2100 mm full-height dado", "Waterproof emulsion", "Grid ceiling"),
    "pooja": Finish("Vitrified / marble", "100 mm skirting", "Emulsion", "POP"),
    "staircase": Finish("Granite / Kota", "100 mm skirting", "Emulsion", "Paint"),
    "balcony": Finish("Anti-skid tiles", "150 mm skirting", "Exterior emulsion", "Exterior paint"),
    "sitout": Finish("Anti-skid tiles", "150 mm skirting", "Exterior emulsion", "Exterior paint"),
    "utility": Finish("Anti-skid tiles", "150 mm skirting", "Exterior emulsion", "Exterior paint"),
    "parking": Finish("Paver / Tremix", "—", "Cement paint", "—"),
}


def finish_for(type: str) -> Finish:
    return FINISHES.get(type, FINISH_DEFAULT)


def present_types(plan: Plan) -> list[str]:
    """Distinct room types present, in first-seen order."""
    seen: set[str] = set()
    out: list[str] = []
    for r in plan.rooms or []:
        t = r.type.value
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out

def tiered_finish_schedule(plan: Plan, tier: str) -> list[dict]:
    """Returns a room-by-room finish schedule based on the given tier."""
    # We use a simplified mapping similar to boq_service
    out = []
    types = present_types(plan)
    for rt in types:
        label = room_label(rt)
        if tier == 'economy':
            floor = "Vitrified tiles 600x600mm" if rt not in ['toilet', 'bathroom'] else "Ceramic anti-skid 300x300mm"
            wall = "OBD paint 2 coats" if rt not in ['toilet', 'bathroom'] else "Ceramic dado full height"
            ceiling = "POP punning on RCC"
        elif tier == 'premium':
            floor = "Italian Marble / Engineered Wood" if rt not in ['toilet', 'bathroom'] else "Large format anti-skid 600x600mm"
            wall = "Premium emulsion / Wallpaper" if rt not in ['toilet', 'bathroom'] else "Large format dado full height"
            ceiling = "Designer gypsum false ceiling"
        else:
            floor = "Vitrified tiles 800x800mm" if rt not in ['toilet', 'bathroom'] else "Anti-skid 300x300mm"
            wall = "Acrylic emulsion paint" if rt not in ['toilet', 'bathroom'] else "Designer dado full height"
            ceiling = "Gypsum false ceiling"
            
        out.append({
            "room": label,
            "floor": floor,
            "wall": wall,
            "ceiling": ceiling
        })
    return out

def column_schedule(plan: Plan) -> list[dict]:
    """Provides a structural column schedule."""
    return [
        {
            "mark": "C1",
            "position": "Corners / High load",
            "size": "230x450mm (9x18\")",
            "reinforcement": "6-16mm dia TMT, 8mm links @ 150c/c",
            "concrete_grade": "M25"
        },
        {
            "mark": "C2",
            "position": "Intermediate",
            "size": "230x230mm (9x9\")",
            "reinforcement": "4-16mm dia TMT, 8mm links @ 150c/c",
            "concrete_grade": "M25"
        }
    ]



# ---------------------------------------------------------------------------
# Area statement
# ---------------------------------------------------------------------------


def floor_name(f: int) -> str:
    if f == 0:
        return "Ground floor"
    if f == 1:
        return "First floor"
    if f == 2:
        return "Second floor"
    if f == 3:
        return "Third floor"
    return f"Floor {f}"


def per_floor_built_up(plan: Plan) -> list[tuple[int, float]] | None:
    """Built-up area (sqm) per distinct floor from room areas, or None if single-floor."""
    by_floor: dict[int, float] = {}
    for r in plan.rooms or []:
        f = r.floor or 0
        by_floor[f] = by_floor.get(f, 0.0) + (r.area_sqm or 0.0)
    if len(by_floor) <= 1:
        return None
    return sorted(by_floor.items(), key=lambda kv: kv[0])


def area_statement(plan: Plan, metrics: Any) -> list[dict]:
    """Mirror the ``areaRows`` array in the TSX: Plot area, Built-up area,
    Ground coverage, FAR (used/allowed), Number of floors.
    """
    m = metrics
    floor_count = (
        (plan.plot.floors or 0)
        or len({(r.floor or 0) for r in plan.rooms})
        or 1
    )
    return [
        {
            "label": "Plot area",
            "metric": f"{m.plot_area_sqm:.1f} m²",
            "imperial": f"{sqft(m.plot_area_sqm)} ft²",
        },
        {
            "label": "Built-up area",
            "metric": f"{m.built_up_sqm:.1f} m²",
            "imperial": f"{sqft(m.built_up_sqm)} ft²",
        },
        {
            "label": "Ground coverage",
            "metric": f"{m.ground_coverage_pct:.1f}%",
            "imperial": f"{m.footprint_sqm:.1f} m² footprint",
        },
        {
            "label": "FAR (used / allowed)",
            "metric": f"{m.far_used:.2f} / {m.far_allowed:.2f}",
            "imperial": "—",
        },
        {
            "label": "Number of floors",
            "metric": str(floor_count),
            "imperial": "G" + (f"+{floor_count - 1}" if floor_count > 1 else ""),
        },
    ]
