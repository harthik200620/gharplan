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


# --------------------------------------------------------------------------- #
# Plot-v2 polygon envelope helpers (irregular plot boundaries)
# --------------------------------------------------------------------------- #
def polygon_area(points: list[Point]) -> float:
    """Unsigned shoelace area (m²) of an open or closed ring. Pure float math —
    no shapely round-trip — so it is safe on degenerate/self-touching input."""
    pts = _closed_ring(points)
    s = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        s += x1 * y2 - x2 * y1
    return abs(s) * 0.5


def inset_polygon(points: list[Point], inset_m: float) -> list[Point] | None:
    """Shrink the polygon inward by ``inset_m`` on every edge (mitred offset).

    Returns the exterior ring of the LARGEST resulting piece as an OPEN ring
    [(x, y), ...] (no duplicate closing vertex), or ``None`` when the offset
    swallows the polygon (too small / too irregular for the inset)."""
    if inset_m < 0:
        return None
    poly = polygon(points).buffer(0)  # heal minor self-intersections
    if poly.is_empty or poly.area <= 0:
        return None
    shrunk = poly.buffer(-float(inset_m), join_style=2)  # 2 = mitre (straight walls)
    if shrunk.is_empty:
        return None
    if shrunk.geom_type == "MultiPolygon":
        shrunk = max(shrunk.geoms, key=lambda g: g.area)
    if shrunk.geom_type != "Polygon" or shrunk.area <= 1e-9:
        return None
    ring = list(shrunk.exterior.coords)  # closed (first == last)
    return [(float(x), float(y)) for x, y in ring[:-1]]


def largest_inscribed_rect(
    points: list[Point], grid: float = 0.25
) -> tuple[float, float, float, float] | None:
    """Largest AXIS-ALIGNED rectangle fully inside the polygon.

    Rasterises the polygon's bbox at ``grid`` resolution, marks the cells that lie
    fully inside (vectorised interior test + exact prepared-geometry check on the
    boundary band only), solves maximal-rectangle-of-ones with the classic
    histogram stack, then relaxes the winning rectangle's four edges toward the
    true boundary by bisection so the grid quantisation is not binding. Runs well
    under 0.5 s for a 12-vertex polygon over a 20x30 m bbox. Returns
    (minx, miny, maxx, maxy) or ``None``."""
    import numpy as np
    from shapely import contains_xy
    from shapely.geometry import box
    from shapely.prepared import prep

    poly = polygon(points).buffer(0)
    if poly.is_empty or poly.area <= 0 or grid <= 0:
        return None
    if poly.geom_type == "MultiPolygon":
        poly = max(poly.geoms, key=lambda g: g.area)
    minx, miny, maxx, maxy = poly.bounds
    nx = int((maxx - minx) / grid + 1e-9)
    ny = int((maxy - miny) / grid + 1e-9)
    if nx < 1 or ny < 1:
        return None

    # Cell (i, j): x in [minx + j*grid, minx + (j+1)*grid], y likewise with i.
    cxs = minx + (np.arange(nx) + 0.5) * grid
    cys = miny + (np.arange(ny) + 0.5) * grid
    gx, gy = np.meshgrid(cxs, cys)  # (ny, nx)
    centers_in = contains_xy(poly, gx.ravel(), gy.ravel()).reshape(ny, nx)

    # A cell is certainly fully inside when its centre survives eroding the
    # polygon by the cell circumradius; only the remaining boundary band needs
    # the exact (and slower) full-containment test.
    core = poly.buffer(-grid * 0.7072)  # > grid * sqrt(2)/2
    if core.is_empty:
        core_in = np.zeros((ny, nx), dtype=bool)
    else:
        core_in = contains_xy(core, gx.ravel(), gy.ravel()).reshape(ny, nx)
    inside = core_in.copy()
    tol_poly = prep(poly.buffer(1e-9))
    for i, j in zip(*np.nonzero(centers_in & ~core_in)):
        x0 = minx + j * grid
        y0 = miny + i * grid
        inside[i, j] = tol_poly.contains(box(x0, y0, x0 + grid, y0 + grid))

    # Maximal rectangle of True cells (histogram-stack, O(nx * ny)).
    best_area = 0
    best = None  # (i0, j0, i1, j1) inclusive cell indices
    heights = np.zeros(nx, dtype=np.int64)
    for i in range(ny):
        heights = np.where(inside[i], heights + 1, 0)
        stack: list[tuple[int, int]] = []  # (start_col, height)
        for j in range(nx + 1):
            h = int(heights[j]) if j < nx else 0
            start = j
            while stack and stack[-1][1] >= h:
                js, hs = stack.pop()
                area = hs * (j - js)
                if area > best_area:
                    best_area = area
                    best = (i - hs + 1, js, i, j - 1)
                start = js
            if h > 0 and (not stack or stack[-1][1] < h):
                stack.append((start, h))
    if best is None or best_area <= 0:
        return None
    i0, j0, i1, j1 = best
    rect = [
        minx + j0 * grid, miny + i0 * grid,
        minx + (j1 + 1) * grid, miny + (i1 + 1) * grid,
    ]

    # Relax each edge toward the polygon boundary (bisection on a 'still fully
    # inside' predicate) so an envelope whose true extent falls between grid
    # lines is not needlessly clipped. Two passes let adjacent edges settle.
    grown = poly.buffer(1e-9)

    def _fits(r: list[float]) -> bool:
        return box(r[0], r[1], r[2], r[3]).within(grown)

    bounds = (minx, miny, maxx, maxy)
    for _ in range(2):
        for side in range(4):
            safe = rect[side]
            aggressive = bounds[side]
            if abs(aggressive - safe) < 1e-9:
                continue
            for _ in range(14):
                mid = (safe + aggressive) / 2.0
                trial = list(rect)
                trial[side] = mid
                if _fits(trial):
                    safe = mid
                else:
                    aggressive = mid
            rect[side] = safe
    return (rect[0], rect[1], rect[2], rect[3])
