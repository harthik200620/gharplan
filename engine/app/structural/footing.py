"""Preliminary isolated pad footings per IS 456:2000 Cl.34 on presumptive SBC.

Bearing on the SERVICE load (P = Pu/1.5, exact for the 1.5(DL+LL) combination).
Safe bearing capacities are IS 1904 presumptive values by declared soil type and
MUST be verified by a soil investigation. Pad thickness is a preliminary band
chosen by pad size (a one-way-shear proxy); the mesh comes from bending at the
column face (Cl.34.2.3.2) with Annex G steel.
"""

from __future__ import annotations

import math

from .models import Member
from .rc import BAR_AREA_MM2, ast_required_mm2, mu_capacity_knm

# IS 1904 presumptive safe bearing capacity, kPa — verify by soil test.
SBC_KPA: dict[str, float] = {
    "hard_rock": 440.0,
    "soft_rock": 245.0,
    "dense_sand": 245.0,
    "medium_clay": 100.0,
    "soft_clay": 50.0,
    "filled": 50.0,
}
_EFF_COVER_MM = 75  # 50 clear on soil + half bar + blinding tolerance


def _thickness_mm(side_m: float) -> int:
    """Preliminary pad depth band by size (one-way shear proxy, documented)."""
    if side_m <= 1.5:
        return 300
    if side_m <= 2.0:
        return 380
    if side_m <= 2.6:
        return 450
    return 530


def design_footing(
    pu_kn: float,
    sbc_kpa: float,
    *,
    col_size_mm: tuple[int, int] = (230, 230),
    fck: float = 20.0,
    fy: float = 500.0,
    footing_id: str = "F1",
    x_m: float | None = None,
    y_m: float | None = None,
) -> tuple[Member, list[dict]]:
    """Design one isolated square pad; returns (member, bbs_bars).

    IS 456:2000 Cl.34.1 (bearing area on service load), Cl.34.2.3.2 (bending at
    the column face), Annex G (Ast), IS 1904 (presumptive SBC — verify by soil
    test), Cl.26.5.2.1 (min steel 0.12%).
    """
    p_service = pu_kn / 1.5
    area_req = p_service / sbc_kpa
    side = max(1.0, math.ceil(math.sqrt(area_req) * 10.0) / 10.0)  # round up to 0.1 m
    thk = _thickness_mm(side)
    d = thk - _EFF_COVER_MM

    q_u = pu_kn / (side * side)  # factored soil pressure, kPa
    proj = (side - min(col_size_mm) / 1000.0) / 2.0  # governing cantilever
    mu = q_u * proj * proj / 2.0  # kNm per metre strip at the column face

    ast_min = 0.0012 * 1000.0 * thk  # Cl.26.5.2.1
    ast_flex = ast_required_mm2(mu, 1000.0, d, fck, fy)
    ast_req = max(ast_flex if ast_flex is not None else ast_min * 3, ast_min)
    s = int(math.floor(BAR_AREA_MM2[12] * 1000.0 / ast_req / 25.0) * 25)
    s = max(100, min(s, 200))
    ast_prov = BAR_AREA_MM2[12] * 1000.0 / s

    util_bearing = area_req / (side * side)
    util_flex = mu / max(mu_capacity_knm(ast_prov, 1000.0, d, fck, fy), 1e-6)
    util = max(util_bearing, util_flex)

    member = Member(
        id=footing_id,
        kind="footing",
        floor=0,
        size_mm=(int(side * 1000), int(side * 1000)),
        thickness_mm=thk,
        rebar=f"12# @ {s} c/c both ways (bottom mesh)",
        design_forces={
            "Pu_kN": round(pu_kn, 1),
            "P_service_kN": round(p_service, 1),
            "Mu_kNm_m": round(mu, 1),
        },
        utilization=round(util, 2),
        clause_refs=[
            "IS 1904 (presumptive SBC — verify by soil test)",
            "IS 456:2000 Cl.34.1 (bearing area on service load)",
            "IS 456:2000 Cl.34.2.3.2 & Annex G (bending at column face)",
        ],
        x_m=x_m,
        y_m=y_m,
    )
    n_bars = math.ceil(side * 1000.0 / s) + 1
    bars = [
        {
            "dia": 12,
            "count": 2 * n_bars,  # both ways
            "cut_m": round(side - 0.1 + 0.3, 2),  # cover both ends + 150 end hooks
            "shape": "mesh (L-hooked)",
        }
    ]
    return member, bars
