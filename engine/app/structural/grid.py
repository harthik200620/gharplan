"""Structural grid proposal — column lines derived from the ground-floor room walls.

Wall lines (room-rectangle edges) are clustered within 0.3 m, thinned to a minimum
spacing of 2.4 m and capped at ~4.5 m by inserting intermediate lines (economical RCC
spans for residential work). Columns sit at grid intersections that fall on/inside the
building footprint; each gets a half-spacing tributary rectangle clipped to the
footprint (simple rectangle math via shapely).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from shapely.geometry import Point as ShPoint
from shapely.geometry import box
from shapely.ops import unary_union

from app.models.plan import Plan

from .models import GridLine

CLUSTER_TOL_M = 0.3
MAX_SPACING_M = 4.5
MIN_SPACING_M = 2.4
_EDGE_TOL_M = 0.15  # a column "on" the footprint outline counts as inside
_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
# Open landscape — not part of the roofed/framed footprint.
_NON_STRUCTURAL_KINDS = {"garden"}


@dataclass
class ColumnPoint:
    """A proposed column with its grid label and tributary geometry."""

    id: str
    label: str
    x: float
    y: float
    trib_area_m2: float
    trib_lx_m: float  # tributary width along x (half-spacing each side)
    trib_ly_m: float


def _bbox(poly: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def footprint_of(plan: Plan):
    """Union of the ground-floor room rectangles = the framed building footprint."""
    rooms = [
        r
        for r in plan.rooms
        if (r.floor or 0) == 0 and r.type.value not in _NON_STRUCTURAL_KINDS
    ]
    if not rooms:  # degenerate plan — fall back to the plot rectangle
        return box(0.0, 0.0, plan.plot.width_m, plan.plot.depth_m)
    return unary_union([box(*_bbox(r.polygon)) for r in rooms])


def _cluster(values: list[float], tol: float = CLUSTER_TOL_M) -> list[float]:
    """Merge wall lines closer than ``tol`` into their average position."""
    groups: list[list[float]] = []
    for v in sorted(values):
        if groups and v - groups[-1][-1] <= tol:
            groups[-1].append(v)
        else:
            groups.append([v])
    return [sum(g) / len(g) for g in groups]


def _enforce_min_spacing(lines: list[float], min_sp: float = MIN_SPACING_M) -> list[float]:
    """Greedily drop interior lines closer than ``min_sp``; the two edge lines stay."""
    if len(lines) <= 2:
        return lines
    kept = [lines[0]]
    for v in lines[1:-1]:
        if v - kept[-1] >= min_sp:
            kept.append(v)
    if lines[-1] - kept[-1] < min_sp and len(kept) > 1:
        kept.pop()  # keep the building edge, drop the crowding interior line
    kept.append(lines[-1])
    return kept


def _cap_spacing(lines: list[float], max_sp: float = MAX_SPACING_M) -> list[float]:
    """Insert evenly spaced intermediate lines wherever a bay exceeds ``max_sp``."""
    if not lines:
        return lines
    out = [lines[0]]
    for v in lines[1:]:
        gap = v - out[-1]
        if gap > max_sp:
            n = math.ceil(gap / max_sp)
            base = out[-1]
            step = gap / n
            out.extend(base + i * step for i in range(1, n))
        out.append(v)
    return out


def _axis_lines(edges: list[float]) -> list[float]:
    return _cap_spacing(_enforce_min_spacing(_cluster(edges)))


def _label(i: int, axis: str) -> str:
    if axis == "x":
        return _LETTERS[i] if i < len(_LETTERS) else f"A{i}"
    return str(i + 1)


def propose_grid(plan: Plan) -> tuple[list[GridLine], list[ColumnPoint]]:
    """Derive X/Y grid lines + column points from the ground-floor room edges.

    Returns (grid_lines, column_points). Tributary areas are half-spacing
    rectangles clipped to the footprint outline.
    """
    footprint = footprint_of(plan)
    rooms = [
        r
        for r in plan.rooms
        if (r.floor or 0) == 0 and r.type.value not in _NON_STRUCTURAL_KINDS
    ]
    xs_raw: list[float] = []
    ys_raw: list[float] = []
    for r in rooms:
        x0, y0, x1, y1 = _bbox(r.polygon)
        xs_raw.extend((x0, x1))
        ys_raw.extend((y0, y1))
    if not xs_raw:
        x0, y0, x1, y1 = footprint.bounds
        xs_raw, ys_raw = [x0, x1], [y0, y1]

    xs = _axis_lines(xs_raw)
    ys = _axis_lines(ys_raw)

    grid_lines = [
        GridLine(axis="x", label=_label(i, "x"), offset_m=round(x, 3)) for i, x in enumerate(xs)
    ] + [
        GridLine(axis="y", label=_label(j, "y"), offset_m=round(y, 3)) for j, y in enumerate(ys)
    ]

    covered = footprint.buffer(_EDGE_TOL_M)
    columns: list[ColumnPoint] = []
    for i, x in enumerate(xs):
        for j, y in enumerate(ys):
            if not covered.covers(ShPoint(x, y)):
                continue
            lo_x = x - (x - xs[i - 1]) / 2 if i > 0 else x
            hi_x = x + (xs[i + 1] - x) / 2 if i < len(xs) - 1 else x
            lo_y = y - (y - ys[j - 1]) / 2 if j > 0 else y
            hi_y = y + (ys[j + 1] - y) / 2 if j < len(ys) - 1 else y
            trib_lx = max(hi_x - lo_x, 0.5)
            trib_ly = max(hi_y - lo_y, 0.5)
            trib = box(lo_x - 1e-6, lo_y - 1e-6, lo_x + trib_lx, lo_y + trib_ly).intersection(
                footprint
            )
            area = max(trib.area, 0.25)
            label = f"{_label(i, 'x')}{_label(j, 'y')}"
            columns.append(
                ColumnPoint(
                    id=f"C-{label}",
                    label=label,
                    x=round(x, 3),
                    y=round(y, 3),
                    trib_area_m2=round(area, 2),
                    trib_lx_m=round(trib_lx, 2),
                    trib_ly_m=round(trib_ly, 2),
                )
            )
    return grid_lines, columns
