"""Low-level CAD geometry helpers shared by the drawing exporters.

A faithful Python port of the web app's ``web/lib/cad.ts`` plus the structural
helpers from ``web/lib/drawings.ts`` so the engine derives elevations, sections
and MEP from a Plan exactly the way the on-screen CAD viewer does.

Coordinates are in METRES; origin = plot SW corner, +x = East, +y = North.
Keep this in lock-step with ``web/lib/cad.ts`` / ``web/lib/drawings.ts``.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Literal, Optional

from app.models.plan import Opening, Plan, Room

Edge = Literal["N", "S", "E", "W"]


@dataclass
class Rect:
    x: float
    y: float
    w: float
    h: float


@dataclass
class PlacedOpening:
    room_id: str
    kind: Literal["door", "window"]
    edge: Edge
    cx: float  # centre point of the opening, metres
    cy: float
    length: float  # clear width, metres


class LEVELS:
    """Standard vertical levels, metres from finished ground-floor level (+-0.000)."""

    GROUND = -0.15  # natural ground line, ~150 mm below FFL (plinth)
    FFL = 0.0  # finished floor level (datum)
    SILL = 0.9  # window sill - habitable rooms
    SILL_WET = 1.2  # window sill - toilet / kitchen
    LINTEL = 2.1  # door & window head
    CEIL = 2.75  # clear room height (NBC min for habitable)
    FLOOR_TO_FLOOR = 3.0  # FFL to FFL
    SLAB = 0.25  # slab + finish (FLOOR_TO_FLOOR - CEIL)
    SLAB_STRUCT = 0.15  # structural slab thickness shown in section
    PARAPET = 1.0  # parapet above the roof slab
    PLINTH = 0.45  # plinth height above ground
    FOOTING = 1.2  # foundation depth below ground (section)
    CHAJJA = 0.6  # sun-shade projection over openings
    DOOR_MAIN_W = 1.1


# Virtual point markers — never part of the built mass or openings.
VIRTUAL = {"overhead_tank", "borewell", "brahmasthan"}
# Open site zones excluded from the built mass (elevations / sections / 3D).
SITE_STRUCTURAL = {"parking", "sitout", "courtyard", "garden", "service_shaft", "future_expansion"}
# Open zones additionally skipped when inferring openings (cad.ts also drops balcony).
SITE_OPENINGS = SITE_STRUCTURAL | {"balcony"}

WET = re.compile(r"toilet|bath|kitchen|utility|wash")

FACE_LABEL: dict[str, str] = {"N": "North", "S": "South", "E": "East", "W": "West"}


def is_wet(room_type: str) -> bool:
    return bool(WET.search(room_type))


def bounds(poly: list[tuple[float, float]]) -> Rect:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    x, y = min(xs), min(ys)
    return Rect(x=x, y=y, w=max(xs) - x, h=max(ys) - y)


_TOL = 0.06


def exterior_edges(r: Rect, fp: Rect) -> dict[str, bool]:
    # An edge is "exterior" when it lies on the building-footprint perimeter (+- tol),
    # NOT the raw plot - so rooms set back from the plot still get outer walls/windows.
    return {
        "W": r.x <= fp.x + _TOL,
        "E": r.x + r.w >= fp.x + fp.w - _TOL,
        "S": r.y <= fp.y + _TOL,
        "N": r.y + r.h >= fp.y + fp.h - _TOL,
    }


def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _edge_len(e: str, r: Rect) -> float:
    return r.w if e in ("N", "S") else r.h


def edge_mid(e: str, r: Rect) -> tuple[float, float]:
    if e == "N":
        return (r.x + r.w / 2, r.y + r.h)
    if e == "S":
        return (r.x + r.w / 2, r.y)
    if e == "E":
        return (r.x + r.w, r.y + r.h / 2)
    return (r.x, r.y + r.h / 2)  # W


def _opening_width(plan: Plan, room_id: str, kind: str, fallback: float) -> float:
    pool = plan.doors if kind == "door" else plan.windows
    o: Optional[Opening] = next((p for p in pool if p.room_id == room_id), None)
    return o.width_m if o else fallback


def place_openings(plan: Plan) -> list[PlacedOpening]:
    """Infer a sensible door/window placement per room for visualization.

    Doors open onto the interior edge nearest the plot core (circulation);
    windows sit on an exterior edge, preferring Vastu-favourable N/E light.
    """
    w = plan.plot.width_m
    d = plan.plot.depth_m
    core = (w / 2, d / 2)
    fp = building_footprint(plan)
    out: list[PlacedOpening] = []

    for room in plan.rooms:
        t = room.type.value
        if t in VIRTUAL or t in SITE_OPENINGS:
            continue
        r = bounds(room.polygon)
        if r.w < 0.6 or r.h < 0.6:
            continue
        ext = exterior_edges(r, fp)
        edges: list[str] = ["N", "S", "E", "W"]

        # door: interior edge closest to the plot core
        interior = [e for e in edges if not ext[e]]
        door_pool = interior if interior else edges
        door_edge = min(door_pool, key=lambda e: _dist(edge_mid(e, r), core))
        d_w = min(_opening_width(plan, room.id, "door", 0.9), _edge_len(door_edge, r) - 0.3)
        if d_w > 0.4:
            cx, cy = edge_mid(door_edge, r)
            out.append(PlacedOpening(room.id, "door", door_edge, cx, cy, d_w))  # type: ignore[arg-type]

        # window: first available exterior edge, N > E > W > S
        win_edge = next((e for e in ("N", "E", "W", "S") if ext[e]), None)
        if win_edge:
            w_w = min(_opening_width(plan, room.id, "window", 1.2), _edge_len(win_edge, r) - 0.5)
            if w_w > 0.4:
                cx, cy = edge_mid(win_edge, r)
                out.append(PlacedOpening(room.id, "window", win_edge, cx, cy, w_w))  # type: ignore[arg-type]
    return out


def structural_rooms(plan: Plan, floor: Optional[int] = None) -> list[Room]:
    """Rooms that form the built mass (exclude virtual markers + open site zones)."""
    return [
        r
        for r in plan.rooms
        if r.type.value not in VIRTUAL
        and r.type.value not in SITE_STRUCTURAL
        and (floor is None or (r.floor or 0) == floor)
    ]


def floor_rooms(plan: Plan, floor: Optional[int] = None) -> list[Room]:
    """All non-virtual rooms, optionally restricted to one floor (MEP convention)."""
    return [
        r
        for r in plan.rooms
        if r.type.value not in VIRTUAL and (floor is None or (r.floor or 0) == floor)
    ]


def floors_of(plan: Plan) -> list[int]:
    return sorted({(r.floor or 0) for r in plan.rooms})


def building_footprint(plan: Plan) -> Rect:
    """Bounding box of the built mass (all floors) - the elevation's overall width."""
    rooms = structural_rooms(plan)
    if not rooms:
        return Rect(0.0, 0.0, plan.plot.width_m, plan.plot.depth_m)
    pts = [p for r in rooms for p in r.polygon]
    return bounds(pts)


def front_face(plan: Plan) -> str:
    f = str(plan.plot.facing.value if hasattr(plan.plot.facing, "value") else plan.plot.facing).upper()
    if f.startswith("N"):
        return "N"
    if f.startswith("S"):
        return "S"
    if f.startswith("E"):
        return "E"
    if f.startswith("W"):
        return "W"
    return "N"


def room_center(room: Room) -> tuple[float, float]:
    r = bounds(room.polygon)
    if room.centroid:
        return (room.centroid[0], room.centroid[1])
    return (r.x + r.w / 2, r.y + r.h / 2)
