"""Compass-zone computation for a point relative to the plot centre.

Bearing convention (matches the brief): 0deg = North (+y), 90deg = East (+x),
measured clockwise. Sectors are 45deg wide, half-open ``[lo, hi)``:

    N  = [337.5, 360) U [0, 22.5)     NE = [22.5, 67.5)
    E  = [67.5, 112.5)                SE = [112.5, 157.5)
    S  = [157.5, 202.5)               SW = [202.5, 247.5)
    W  = [247.5, 292.5)               NW = [292.5, 337.5)

CENTER (Brahmasthan) is tested FIRST so the degenerate ``dx==dy==0`` case never
reaches ``atan2(0, 0)``.
"""

from __future__ import annotations

import math

from app.models.enums import Compass

_SECTORS = (
    (22.5, Compass.N),  # [0, 22.5)
    (67.5, Compass.NE),  # [22.5, 67.5)
    (112.5, Compass.E),  # [67.5, 112.5)
    (157.5, Compass.SE),  # [112.5, 157.5)
    (202.5, Compass.S),  # [157.5, 202.5)
    (247.5, Compass.SW),  # [202.5, 247.5)
    (292.5, Compass.W),  # [247.5, 292.5)
    (337.5, Compass.NW),  # [292.5, 337.5)
    # >= 337.5 wraps back to North (handled by the fallback below)
)


def bearing_deg(dx: float, dy: float) -> float:
    """Clockwise compass bearing in [0, 360); 0=North(+y), 90=East(+x)."""
    return math.degrees(math.atan2(dx, dy)) % 360.0


def sector(bearing: float) -> Compass:
    """Map a bearing to one of the 8 principal sectors (half-open intervals)."""
    b = round(bearing % 360.0, 6)
    for upper, comp in _SECTORS:
        if b < upper:
            return comp
    return Compass.N  # [337.5, 360)


def _is_center(
    cx: float,
    cy: float,
    width: float,
    depth: float,
    strategy: str,
    center_fraction: float,
) -> bool:
    if strategy == "grid_3x3":
        # Classical Brahmasthan = central cell of a 3x3 Vastu grid (1/9 ~= 11%).
        return (width / 3.0 <= cx <= 2.0 * width / 3.0) and (
            depth / 3.0 <= cy <= 2.0 * depth / 3.0
        )
    # "area_rect_10pct": concentric rectangle whose area == center_fraction of plot.
    half_w = (math.sqrt(center_fraction) / 2.0) * width
    half_d = (math.sqrt(center_fraction) / 2.0) * depth
    return abs(cx - width / 2.0) <= half_w and abs(cy - depth / 2.0) <= half_d


def zone_of(
    cx: float,
    cy: float,
    width: float,
    depth: float,
    strategy: str = "grid_3x3",
    center_fraction: float = 0.10,
) -> Compass:
    """Compass zone of point (cx, cy) within a width x depth plot (origin SW)."""
    if _is_center(cx, cy, width, depth, strategy, center_fraction):
        return Compass.CENTER
    dx = cx - width / 2.0
    dy = cy - depth / 2.0
    if dx == 0.0 and dy == 0.0:  # exact centre but strategy said not-center
        return Compass.CENTER
    return sector(bearing_deg(dx, dy))
