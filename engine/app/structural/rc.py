"""Shared limit-state RC arithmetic (IS 456:2000) used by slab/beam/column/footing.

Pure-python helpers only; all stresses in N/mm² (MPa), moments in kNm, areas in mm².
"""

from __future__ import annotations

import math

# Cross-sectional area of one bar, mm² (pi*d^2/4).
BAR_AREA_MM2: dict[int, float] = {
    8: 50.3,
    10: 78.5,
    12: 113.1,
    16: 201.1,
    20: 314.2,
    25: 490.9,
}


def ceil_to(value: float, step: int) -> int:
    """Round up to the next multiple of ``step`` (e.g. slab depths to 5 mm)."""
    return int(math.ceil(value / step) * step)


def floor_to(value: float, step: int) -> int:
    """Round down to a multiple of ``step`` (bar spacings to 25 mm)."""
    return int(math.floor(value / step) * step)


def ast_required_mm2(mu_knm: float, b_mm: float, d_mm: float, fck: float, fy: float) -> float | None:
    """Tension steel for a singly-reinforced rectangular section.

    IS 456:2000 Annex G, G-1.1(b):
    ``Ast = 0.5*fck/fy * (1 - sqrt(1 - 4.6*Mu/(fck*b*d^2))) * b*d``
    Returns None when the section is inadequate (radicand < 0 → increase depth).
    """
    if mu_knm <= 0:
        return 0.0
    k = 4.6 * mu_knm * 1e6 / (fck * b_mm * d_mm * d_mm)
    if k >= 1.0:
        return None
    return 0.5 * fck / fy * (1.0 - math.sqrt(1.0 - k)) * b_mm * d_mm


def mu_capacity_knm(ast_mm2: float, b_mm: float, d_mm: float, fck: float, fy: float) -> float:
    """Moment of resistance of the PROVIDED steel (under-reinforced).

    IS 456:2000 Annex G, G-1.1(b): ``Mu = 0.87*fy*Ast*d*(1 - Ast*fy/(b*d*fck))``.
    """
    if ast_mm2 <= 0:
        return 0.0
    lever = 1.0 - ast_mm2 * fy / (b_mm * d_mm * fck)
    return 0.87 * fy * ast_mm2 * d_mm * max(0.1, lever) / 1e6


def mu_lim_knm(b_mm: float, d_mm: float, fck: float) -> float:
    """Limiting moment of a singly-reinforced section with Fe500.

    IS 456:2000 Cl.38.1: xu,max/d = 0.456 for Fe500 → Mu,lim ≈ 0.133*fck*b*d².
    """
    return 0.133 * fck * b_mm * d_mm * d_mm / 1e6
