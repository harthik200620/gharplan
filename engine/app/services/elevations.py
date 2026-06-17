"""Derive ELEVATIONS and SECTIONS from a floor plan, the way an architect projects
them: horizontal positions come straight off the plan, vertical positions from a
table of standard Indian building levels (NBC 2016 + common practice, in metres).

A faithful Python port of the web app's ``web/lib/drawings.ts``. The geometry
helpers (``LEVELS``, ``structural_rooms``, ``floors_of``, ``building_footprint``,
``front_face``, ``FACE_LABEL``, ``place_openings``, ``bounds``, ``WET``) live in
``app.services.cad_geom`` — imported here, never reimplemented.

Coordinates in metres; origin = plot SW, +x = East, +y = North.
Keep this in lock-step with ``web/lib/drawings.ts``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.models.plan import Plan
from app.services.cad_geom import (
    FACE_LABEL,
    LEVELS,
    WET,
    bounds,
    building_footprint,
    floors_of,
    front_face,
    place_openings,
    structural_rooms,
)

__all__ = [
    "FACE_LABEL",
    "LEVELS",
    "building_footprint",
    "floors_of",
    "front_face",
    "structural_rooms",
    "ElevationOpening",
    "elevation_openings",
    "roof_level",
    "SectionCell",
    "SectionModel",
    "section_model",
    "room_short",
]


@dataclass
class ElevationOpening:
    u: float  # position along the face (metres, from the face origin)
    length: float  # clear width
    kind: Literal["door", "window"]
    sill: float
    lintel: float
    floor: int


def elevation_openings(plan: Plan, face: str, front: str) -> list[ElevationOpening]:
    """Openings visible on one elevation face. Windows come from the inferred plan
    placement (exterior edge === face); the main entrance door is added on the front
    face at the foyer/living position so the front elevation reads correctly.
    """
    placed = place_openings(plan)
    room_by_id = {r.id: r for r in plan.rooms}
    fp = building_footprint(plan)
    horiz = face == "N" or face == "S"
    face_origin = fp.x if horiz else fp.y
    out: list[ElevationOpening] = []

    for op in placed:
        if op.kind != "window" or op.edge != face:
            continue
        room = room_by_id.get(op.room_id)
        if not room:
            continue
        u = (op.cx if horiz else op.cy) - face_origin
        wet = bool(WET.search(room.type.value))
        out.append(
            ElevationOpening(
                u=u,
                length=op.length,
                kind="window",
                sill=LEVELS.SILL_WET if wet else LEVELS.SILL,
                lintel=LEVELS.LINTEL,
                floor=room.floor or 0,
            )
        )

    # Main entrance door on the front elevation, on the ground floor.
    if face == front:
        ground = structural_rooms(plan, 0)
        entry = next((r for r in ground if r.type.value == "entrance"), None)
        if entry is None:
            entry = next((r for r in ground if r.type.value == "living"), None)
        span = fp.w if horiz else fp.h
        u = span / 2
        if entry:
            r = bounds(entry.polygon)
            u = (r.x + r.w / 2 if horiz else r.y + r.h / 2) - face_origin
        out.append(
            ElevationOpening(
                u=u,
                length=LEVELS.DOOR_MAIN_W,
                kind="door",
                sill=0,
                lintel=LEVELS.LINTEL,
                floor=0,
            )
        )
    return out


def roof_level(plan: Plan) -> float:
    """Roof level (top of the top floor slab) for an n-floor building."""
    n = len(floors_of(plan))
    return n * LEVELS.FLOOR_TO_FLOOR - LEVELS.SLAB


@dataclass
class SectionCell:
    u0: float  # left position along the section (metres)
    u1: float
    floor: int
    label: str
    type: str


@dataclass
class SectionModel:
    cut_axis: Literal["x", "y"]  # vertical plane at constant y (x-axis section) or constant x
    cut_at: float  # the constant coordinate of the cut plane
    span: float  # visible width of the section
    origin: float  # u origin (footprint min along the section axis)
    floors: list[int]
    cells: list[SectionCell]  # rooms the cut passes through, per floor


def section_model(plan: Plan) -> SectionModel:
    """Choose a section cut that passes through the staircase and, ideally, a wet area —
    exactly where an architect cuts to reveal the most. Returns the rooms the plane
    intersects (per floor) with their horizontal extent.
    """
    fp = building_footprint(plan)
    ground = structural_rooms(plan, 0)
    stair = next((r for r in ground if r.type.value == "staircase"), None)

    # Cut along the building's longer dimension (an X-axis section if it is wider).
    cut_axis: Literal["x", "y"] = "x" if fp.w >= fp.h else "y"
    # Place the cut through the stair centre if we have one, else mid-building.
    if stair:
        r = bounds(stair.polygon)
        cut_at = r.y + r.h / 2 if cut_axis == "x" else r.x + r.w / 2
    else:
        cut_at = fp.y + fp.h / 2 if cut_axis == "x" else fp.x + fp.w / 2

    span = fp.w if cut_axis == "x" else fp.h
    origin = fp.x if cut_axis == "x" else fp.y
    floors = floors_of(plan)
    cells: list[SectionCell] = []

    for f in floors:
        for room in structural_rooms(plan, f):
            r = bounds(room.polygon)
            lo = r.y if cut_axis == "x" else r.x
            hi = (r.y + r.h) if cut_axis == "x" else (r.x + r.w)
            if cut_at < lo - 1e-6 or cut_at > hi + 1e-6:
                continue  # plane misses this room
            u0 = (r.x if cut_axis == "x" else r.y) - origin
            u1 = u0 + (r.w if cut_axis == "x" else r.h)
            cells.append(
                SectionCell(u0=u0, u1=u1, floor=f, label=room_short(room.type.value), type=room.type.value)
            )
    cells.sort(key=lambda c: (c.floor, c.u0))
    return SectionModel(cut_axis=cut_axis, cut_at=cut_at, span=span, origin=origin, floors=floors, cells=cells)


def room_short(type: str) -> str:
    mapping: dict[str, str] = {
        "living": "Living",
        "master_bedroom": "Master",
        "bedroom": "Bedroom",
        "childrens_bedroom": "Bedroom",
        "kitchen": "Kitchen",
        "dining": "Dining",
        "pooja": "Pooja",
        "toilet": "Toilet",
        "bathroom": "Bath",
        "staircase": "Stair",
        "entrance": "Foyer",
        "utility": "Utility",
        "study": "Study",
        "store": "Store",
        "sitout": "Sit-out",
    }
    return mapping.get(type, type.replace("_", " "))
