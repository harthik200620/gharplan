"""Gravity load build-up per IS 875 and the column load take-down.

Dead loads per IS 875 (Part 1):1987 — RCC 25 kN/m³, burnt-clay brick masonry
~19 kN/m³, floor finish 1.0 kPa. Live loads per IS 875 (Part 2):1987 Table 1 —
residential rooms 2.0 kPa, accessible flat roof 1.5 kPa. The governing gravity
combination is 1.5(DL+LL) per IS 456:2000 Table 18.
"""

from __future__ import annotations

from .grid import ColumnPoint

DEAD_RCC_KN_M3 = 25.0  # IS 875-1:1987 Table 1 (plain/reinforced concrete)
DEAD_BRICK_KN_M3 = 19.0  # IS 875-1:1987 (burnt clay brick masonry 18.8–22)
FLOOR_FINISH_KPA = 1.0  # screed + flooring allowance
LL_FLOOR_KPA = 2.0  # IS 875-2:1987 Table 1 — residential rooms
LL_ROOF_KPA = 1.5  # IS 875-2:1987 — flat roof with access
STOREY_HEIGHT_M = 3.0
WALL_LINE_KN_M = round(0.23 * STOREY_HEIGHT_M * DEAD_BRICK_KN_M3, 2)  # ≈13.1 kN/m, 230 wall
PARAPET_KN_M = 4.0  # ~1.0 m masonry parapet + coping on roof perimeter beams
GAMMA_F = 1.5  # IS 456:2000 Table 18 — 1.5(DL+LL)
BEAM_SELF_KN_M = round(0.23 * 0.45 * DEAD_RCC_KN_M3, 2)  # assumed 230×450 rib


def slab_dead_kpa(thickness_mm: float) -> float:
    """Slab self weight + floor finish, kPa. IS 875-1:1987 (RCC 25 kN/m³)."""
    return DEAD_RCC_KN_M3 * thickness_mm / 1000.0 + FLOOR_FINISH_KPA


def slab_factored_kpa(thickness_mm: float, ll_kpa: float = LL_FLOOR_KPA) -> float:
    """Factored slab area load wu = 1.5(DL+LL). IS 456:2000 Table 18."""
    return GAMMA_F * (slab_dead_kpa(thickness_mm) + ll_kpa)


def column_load_takedown(
    column: ColumnPoint | None,
    floors: int,
    trib_area_m2: float | None = None,
    future_floors: int = 0,
    slab_thickness_mm: float = 125.0,
) -> float:
    """Factored axial load Pu (kN) on a column by tributary-area take-down.

    IS 456:2000 Table 18 (combination 1.5(DL+LL)) with IS 875-1/-2 loads.
    Per supported level: slab DL+finish (+roof LL 1.5 kPa on the top level,
    floor LL 2.0 kPa on intermediate levels), beam self weight along both
    tributary axes, one storey of 230 brick wall over ~half the tributary beam
    length (walls do not line every beam), and the column self weight.
    ``future_floors`` adds full extra levels for a declared future expansion.
    """
    area = trib_area_m2 if trib_area_m2 is not None else (column.trib_area_m2 if column else 12.0)
    lx = column.trib_lx_m if column else max(1.0, area**0.5)
    ly = column.trib_ly_m if column else max(1.0, area**0.5)
    levels = max(1, floors + max(0, future_floors))

    roof_kpa = slab_dead_kpa(slab_thickness_mm) + LL_ROOF_KPA
    floor_kpa = slab_dead_kpa(slab_thickness_mm) + LL_FLOOR_KPA
    p = area * roof_kpa + area * floor_kpa * (levels - 1)
    p += BEAM_SELF_KN_M * (lx + ly) * levels  # grid beams framing into the column
    p += WALL_LINE_KN_M * 0.5 * (lx + ly) * levels  # one storey of walls per level
    p += 0.23 * 0.23 * DEAD_RCC_KN_M3 * STOREY_HEIGHT_M * levels  # column self
    return round(GAMMA_F * p, 1)
