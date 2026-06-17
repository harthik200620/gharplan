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
    hinge: Optional[Literal["lo", "hi"]] = None  # door leaf pivot jamb (plan swing)
    main: bool = False  # the single main entrance door (drawn prominently)


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


def edge_pos(e: str, r: Rect, i: int, n: int) -> tuple[float, float]:
    """Centre of the i-th of n openings spread evenly along edge e (end margins)."""
    t = (i + 1) / (n + 1)
    if e == "N":
        return (r.x + r.w * t, r.y + r.h)
    if e == "S":
        return (r.x + r.w * t, r.y)
    if e == "E":
        return (r.x + r.w, r.y + r.h * t)
    return (r.x, r.y + r.h * t)  # W


def _opening_width(plan: Plan, room_id: str, kind: str, fallback: float) -> float:
    pool = plan.doors if kind == "door" else plan.windows
    o: Optional[Opening] = next((p for p in pool if p.room_id == room_id), None)
    return o.width_m if o else fallback


_ENSUITE_RE = re.compile(r"^(?:toilet|bath)_(.+)$")


def _ensuite_shared_edge(
    room: Room, r: Rect, plan: Plan
) -> Optional[tuple[str, tuple[float, float]]]:
    """If `room` is an attached bath (id 'toilet_<p>' / 'bath_<p>'), return the bath
    edge that touches its parent bedroom `<p>` on the same floor + the shared-span
    midpoint, so the ensuite door opens FROM the bedroom into the bath. None else."""
    m = _ENSUITE_RE.match(room.id)
    if not m:
        return None
    parent = next(
        (p for p in plan.rooms if p.id == m.group(1) and (p.floor or 0) == (room.floor or 0)),
        None,
    )
    if parent is None:
        return None
    p = bounds(parent.polygon)
    tol = 0.08
    x_ov = min(r.x + r.w, p.x + p.w) - max(r.x, p.x)
    y_ov = min(r.y + r.h, p.y + p.h) - max(r.y, p.y)
    yc = (max(r.y, p.y) + min(r.y + r.h, p.y + p.h)) / 2
    xc = (max(r.x, p.x) + min(r.x + r.w, p.x + p.w)) / 2
    if abs(r.x + r.w - p.x) < tol and y_ov > 0.6:
        return ("E", (r.x + r.w, yc))
    if abs(r.x - (p.x + p.w)) < tol and y_ov > 0.6:
        return ("W", (r.x, yc))
    if abs(r.y + r.h - p.y) < tol and x_ov > 0.6:
        return ("N", (xc, r.y + r.h))
    if abs(r.y - (p.y + p.h)) < tol and x_ov > 0.6:
        return ("S", (xc, r.y))
    return None


def _span(a0: float, a1: float, b0: float, b1: float) -> float:
    return min(a1, b1) - max(a0, b0)


_WET_NB = re.compile(r"toilet|bath")


def _edge_abuts_wet(room: Room, r: Rect, e: str, plan: Plan) -> bool:
    """Does wall `e` of room `r` back onto a toilet/bath on the same floor? You
    never enter a room through a WC, so an entry door avoids such an edge."""
    tol = 0.12
    floor = room.floor or 0
    for nb in plan.rooms:
        if nb.id == room.id or (nb.floor or 0) != floor or not _WET_NB.search(nb.type.value):
            continue
        b = bounds(nb.polygon)
        if e == "N" and abs(b.y - (r.y + r.h)) < tol and _span(r.x, r.x + r.w, b.x, b.x + b.w) > 0.4:
            return True
        if e == "S" and abs(b.y + b.h - r.y) < tol and _span(r.x, r.x + r.w, b.x, b.x + b.w) > 0.4:
            return True
        if e == "E" and abs(b.x - (r.x + r.w)) < tol and _span(r.y, r.y + r.h, b.y, b.y + b.h) > 0.4:
            return True
        if e == "W" and abs(b.x + b.w - r.x) < tol and _span(r.y, r.y + r.h, b.y, b.y + b.h) > 0.4:
            return True
    return False


def _facing_edge(facing) -> str:
    """Street-facing building edge for a plot facing direction (where the main
    entrance opens). Diagonals fold to their dominant cardinal."""
    f = str(getattr(facing, "value", facing) or "E").upper()
    if "E" in f:
        return "E"
    if "W" in f:
        return "W"
    if "N" in f:
        return "N"
    return "S"


def place_openings(plan: Plan) -> list[PlacedOpening]:
    """Infer a sensible door/window placement per room for visualization.

    Doors open onto the interior edge nearest the plot core (circulation);
    windows sit on an exterior edge, preferring Vastu-favourable N/E light.
    """
    w = plan.plot.width_m
    d = plan.plot.depth_m
    core = (w / 2, d / 2)
    fp_by_floor: dict[int, Rect] = {}

    def footprint_for(f: int) -> Rect:
        fp = fp_by_floor.get(f)
        if fp is None:
            fp = building_footprint(plan, f)
            fp_by_floor[f] = fp
        return fp

    out: list[PlacedOpening] = []

    for room in plan.rooms:
        t = room.type.value
        if t in VIRTUAL or t in SITE_OPENINGS:
            continue
        r = bounds(room.polygon)
        if r.w < 0.6 or r.h < 0.6:
            continue
        ext = exterior_edges(r, footprint_for(room.floor or 0))
        edges: list[str] = ["N", "S", "E", "W"]

        # --- door ---
        # An attached bath hinges off the wall it SHARES with its bedroom and opens
        # INTO the bath (a true ensuite); every other room's door sits on the
        # interior wall nearest the circulation core, hinged at the corner nearest
        # that core so the leaf folds flat against a wall instead of sweeping the room.
        shared = _ensuite_shared_edge(room, r, plan)
        hinge = "lo"
        if shared is not None:
            door_edge, (cx, cy) = shared
        else:
            interior = [e for e in edges if not ext[e]]
            door_pool = interior if interior else edges
            # nearest the circulation core, but never opening through a toilet/bath wall.
            door_edge = min(
                door_pool,
                key=lambda e: _dist(edge_mid(e, r), core)
                + (100.0 if _edge_abuts_wet(room, r, e, plan) else 0.0),
            )
            cx, cy = edge_mid(door_edge, r)
        d_w = min(_opening_width(plan, room.id, "door", 0.9), _edge_len(door_edge, r) - 0.3)
        if d_w > 0.4:
            if shared is None:
                horiz = door_edge in ("N", "S")
                lo = (r.x, cy) if horiz else (cx, r.y)
                hi = (r.x + r.w, cy) if horiz else (cx, r.y + r.h)
                margin = d_w / 2 + 0.12
                if _dist(lo, core) <= _dist(hi, core):
                    hinge = "lo"
                    if horiz:
                        cx = r.x + margin
                    else:
                        cy = r.y + margin
                else:
                    hinge = "hi"
                    if horiz:
                        cx = r.x + r.w - margin
                    else:
                        cy = r.y + r.h - margin
            out.append(PlacedOpening(room.id, "door", door_edge, cx, cy, d_w, hinge))  # type: ignore[arg-type]

        # windows: one per ACTUAL plan window for this room, spread across the
        # room's exterior walls so a cross-ventilated corner room shows a window on
        # each face (preferring N > E > W > S). Falls back to a single inferred
        # window for plans authored without an explicit window list.
        win_edges = [e for e in ("N", "E", "W", "S") if ext[e]]
        room_windows = [w for w in plan.windows if w.room_id == room.id]
        if win_edges and room_windows:
            assign = [win_edges[k % len(win_edges)] for k in range(len(room_windows))]
            count_by_edge: dict[str, int] = {}
            for e in assign:
                count_by_edge[e] = count_by_edge.get(e, 0) + 1
            seen_by_edge: dict[str, int] = {}
            for k, win in enumerate(room_windows):
                e = assign[k]
                n = count_by_edge[e]
                i = seen_by_edge.get(e, 0)
                seen_by_edge[e] = i + 1
                w_w = min(win.width_m, _edge_len(e, r) / n - 0.4)
                if w_w > 0.4:
                    cx, cy = edge_pos(e, r, i, n)
                    out.append(PlacedOpening(room.id, "window", e, cx, cy, w_w))  # type: ignore[arg-type]
        elif win_edges:
            e = win_edges[0]
            w_w = min(_opening_width(plan, room.id, "window", 1.2), _edge_len(e, r) - 0.5)
            if w_w > 0.4:
                cx, cy = edge_mid(e, r)
                out.append(PlacedOpening(room.id, "window", e, cx, cy, w_w))  # type: ignore[arg-type]

    # --- main entrance --- one prominent front door on the street-facing wall of
    # the ground-floor entry room (an `entrance` room if present, else the front
    # social room reaching the street edge).
    street = _facing_edge(getattr(plan.plot, "facing", "E"))
    fp0 = footprint_for(0)
    entry_rank = {"entrance": 0, "living": 1, "dining": 2, "kitchen": 3}
    front = [
        r
        for r in plan.rooms
        if (r.floor or 0) == 0
        and r.type.value not in VIRTUAL
        and r.type.value not in SITE_OPENINGS
        and exterior_edges(bounds(r.polygon), fp0)[street]
    ]
    if front:
        front.sort(
            key=lambda r: (
                entry_rank.get(r.type.value, 9),
                -(bounds(r.polygon).w * bounds(r.polygon).h),
            )
        )
        entry = front[0]
        er = bounds(entry.polygon)
        m_w = min(1.2, _edge_len(street, er) - 0.4)
        if m_w > 0.6:
            t = 0.66  # off-centre so the front door clears a centred window
            if street in ("N", "S"):
                cx = er.x + er.w * t
                cy = er.y + er.h if street == "N" else er.y
            else:
                cx = er.x + er.w if street == "E" else er.x
                cy = er.y + er.h * t
            out.append(PlacedOpening(entry.id, "door", street, cx, cy, m_w, None, True))  # type: ignore[arg-type]
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


def building_footprint(plan: Plan, floor: Optional[int] = None) -> Rect:
    """Bounding box of the built mass. With ``floor`` given, only that floor's
    rooms — a G+1's floors are packed independently, so an exterior wall must be
    judged against that floor's own outline, not the union of floors. Without it,
    the whole built mass (the elevation's overall width)."""
    rooms = structural_rooms(plan, floor)
    if not rooms:
        return (Rect(0.0, 0.0, plan.plot.width_m, plan.plot.depth_m)
                if floor is None else building_footprint(plan))
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
