"""Preliminary RCC beam design per IS 456:2000 (limit state).

All grid beams are 230 wide (match the 230 brick wall). Analysis is the
conservative simply-supported envelope: Mu = w·l²/8, Vu = w·l/2. Depth comes
from the Fe500 singly-reinforced limit Mu,lim ≈ 0.133·fck·b·d² (Cl.38.1,
xu,max/d = 0.456) rounded to 380/450/530 (600 as a deep fallback); steel per
Annex G; shear per Cl.40 with the conservative Table 19 value τc = 0.48 MPa
(M20, pt ≈ 0.5%).
"""

from __future__ import annotations

import math

from .models import Member
from .rc import BAR_AREA_MM2, ast_required_mm2, floor_to, mu_capacity_knm, mu_lim_knm

WIDTH_MM = 230
_DEPTH_LADDER = (380, 450, 530, 600)
_EFF_COVER_MM = 40  # 25 clear + 8 stirrup + half a 16 bar
TAU_C_MPA = 0.48  # IS 456:2000 Table 19 — M20, pt ~0.5% (conservative)
_TAU_C_MAX = {20: 2.8, 25: 3.1}  # IS 456:2000 Table 20


def _pick_bars(ast_req: float) -> tuple[int, int]:
    """Smallest workable bottom-bar set: 2..5 bars of 12/16/20/25."""
    for count in (2, 3, 4, 5):
        for dia in (12, 16, 20, 25):
            if count * BAR_AREA_MM2[dia] >= ast_req:
                return count, dia
    return 5, 25


def design_beam(
    span_m: float,
    w_kn_m: float,
    *,
    fck: float = 20.0,
    fy: float = 500.0,
    beam_id: str = "B1",
    floor: int = 0,
    x_m: float | None = None,
    y_m: float | None = None,
) -> tuple[Member, list[dict]]:
    """Design one beam for a FACTORED uniform load; returns (member, bbs_bars).

    IS 456:2000 Cl.38.1 (limit state flexure, Mu,lim with Fe500), Annex G (Ast),
    Cl.40.1/Table 19 (shear stress), Cl.40.4 (stirrup design), Cl.26.5.1.5/1.6
    (stirrup spacing caps 0.75d/300 and minimum shear steel).
    """
    b = WIDTH_MM
    mu = w_kn_m * span_m * span_m / 8.0
    vu = w_kn_m * span_m / 2.0

    depth = _DEPTH_LADDER[-1]
    for cand in _DEPTH_LADDER:
        if mu <= mu_lim_knm(b, cand - _EFF_COVER_MM, fck):
            depth = cand
            break
    d = depth - _EFF_COVER_MM

    ast_min = 0.85 * b * d / fy  # Cl.26.5.1.1(a)
    ast_flex = ast_required_mm2(mu, b, d, fck, fy)
    ast_req = max(ast_flex if ast_flex is not None else ast_min * 4, ast_min)
    count, dia = _pick_bars(ast_req)
    ast_prov = count * BAR_AREA_MM2[dia]
    util_flex = mu / max(mu_capacity_knm(ast_prov, b, d, fck, fy), 1e-6)

    # Shear — Cl.40.1 nominal stress vs Table 19, stirrups per Cl.40.4.
    tau_v = vu * 1000.0 / (b * d)
    asv = 2 * BAR_AREA_MM2[8]  # 2-legged 8#
    if tau_v <= TAU_C_MPA:
        s = floor_to(0.87 * fy * asv / (0.4 * b), 25)  # Cl.26.5.1.6 minimum stirrups
    else:
        vus_n = vu * 1000.0 - TAU_C_MPA * b * d
        s = floor_to(0.87 * fy * asv * d / vus_n, 25)
    s = max(100, min(s, floor_to(0.75 * d, 25), 300))  # Cl.26.5.1.5 caps
    tau_c_max = _TAU_C_MAX.get(int(fck), 2.8)
    util = max(util_flex, tau_v / tau_c_max)

    member = Member(
        id=beam_id,
        kind="beam",
        floor=floor,
        size_mm=(b, depth),
        rebar=f"{count}-{dia}# bottom + 2-12# top; 2L-8# stirrups @ {s} c/c",
        design_forces={
            "w_kN_m": round(w_kn_m, 2),
            "Mu_kNm": round(mu, 1),
            "Vu_kN": round(vu, 1),
            "span_m": round(span_m, 2),
        },
        utilization=round(util, 2),
        clause_refs=[
            "IS 456:2000 Cl.38.1 (limit state flexure, Fe500 Mu,lim)",
            "IS 456:2000 Annex G (Ast)",
            "IS 456:2000 Cl.40 & Table 19 (shear, τc = 0.48 MPa conservative)",
            "IS 456:2000 Cl.26.5.1 (min steel & stirrup caps)",
        ],
        x_m=x_m,
        y_m=y_m,
    )
    dev = 2 * 47 * dia / 1000.0  # Ld ≈ 47Ø for Fe500/M20, both ends
    bars = [
        {"dia": dia, "count": count, "cut_m": span_m + dev, "shape": "straight"},
        {"dia": 12, "count": 2, "cut_m": span_m + 2 * 47 * 12 / 1000.0, "shape": "straight (top)"},
        {
            "dia": 8,
            "count": math.ceil(span_m * 1000.0 / s) + 1,
            "cut_m": round(2 * (b + depth) / 1000.0 + 0.1, 2),
            "shape": "stirrup",
        },
    ]
    return member, bars
