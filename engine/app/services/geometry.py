"""Polygon geometry helpers (shapely-backed). Pure functions, float math."""

from __future__ import annotations

from shapely.geometry import Polygon
from shapely.validation import explain_validity

Point = tuple[float, float]


def _closed_ring(points: list[Point]) -> list[Point]:
    pts = [(float(x), float(y)) for x, y in points]
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def polygon(points: list[Point]) -> Polygon:
    return Polygon(_closed_ring(points))


def area_of(points: list[Point]) -> float:
    """Unsigned area in square metres (orientation-independent)."""
    return polygon(points).area


def perimeter_of(points: list[Point]) -> float:
    """Full perimeter (exterior ring length, including the closing segment)."""
    return polygon(points).length


def centroid_of(points: list[Point]) -> Point:
    c = polygon(points).centroid
    return (c.x, c.y)


def bounds_of(points: list[Point]) -> tuple[float, float, float, float]:
    """Axis-aligned bounding box (minx, miny, maxx, maxy)."""
    return polygon(points).bounds


def min_side_of(points: list[Point]) -> float:
    """Smaller side of the bounding box — a proxy for minimum room dimension."""
    minx, miny, maxx, maxy = bounds_of(points)
    return min(maxx - minx, maxy - miny)


def union_area(polys: list[list[Point]]) -> float:
    """Area of the union of several polygons (footprint, de-duplicating overlaps)."""
    from shapely.ops import unary_union

    if not polys:
        return 0.0
    return unary_union([polygon(p) for p in polys]).area


def outside_envelope_area(points: list[Point], envelope: tuple[float, float, float, float]) -> float:
    """Area of the polygon falling OUTSIDE the (minx,miny,maxx,maxy) envelope box."""
    from shapely.geometry import box

    minx, miny, maxx, maxy = envelope
    return polygon(points).difference(box(minx, miny, maxx, maxy)).area


def validate_polygon(points: list[Point]) -> tuple[bool, str]:
    """Return (is_valid, reason). Reason is empty when valid."""
    distinct = {(round(x, 6), round(y, 6)) for x, y in points}
    if len(distinct) < 3:
        return False, "polygon needs at least 3 distinct vertices"
    poly = polygon(points)
    if not poly.is_valid:
        return False, f"invalid polygon: {explain_validity(poly)}"
    if poly.area <= 0:
        return False, "polygon has zero area"
    return True, ""
