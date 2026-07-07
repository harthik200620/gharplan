"""Preliminary RCC slab panel design per IS 456:2000.

One-way vs two-way split per Cl.24.4 (ly/lx > 2 → one-way). Depths from
span/effective-depth (Cl.23.2.1) for one-way strips and short-span/overall-depth
(Cl.24.1) for two-way panels; two-way moments from the Annex D Table 26
interior-panel coefficients; steel from Annex G with Cl.26.5.2.1 minimum.

Documented simplifications (preliminary sizing):
- Cl.23.2.1 basic ratio 26 (continuous) is reduced by ~0.8 for the higher Fe500
  service stress → effective ratio 20.8 on the one-way effective depth.
- Cl.24.1 short-span/overall-depth 40 (continuous) / 35 (simply supported) for
  mild steel is likewise ×0.8 for HYSD → 32 / 28.
- The interior-panel coefficient case of Table 26 is applied to every panel;
  edge/corner panels of a small house are close enough for preliminary work.
- Main-bar spacing is capped at 200 c/c (practice cap, tighter than the
  Cl.26.3.3 limit of 3d/300) so crack widths stay unremarkable.
"""

from __future__ import annotations

import math

from .loads import LL_FLOOR_KPA, slab_factored_kpa
from .models import Member
from .rc import BAR_AREA_MM2, ast_required_mm2, ceil_to, floor_to, mu_capacity_knm

MIN_THICKNESS_MM = 110
MAX_THICKNESS_MM = 160
_EFF_COVER_MM = 25  # 20 nominal cover (mild exposure) + half an 8/10 bar

# IS 456:2000 Annex D Table 26 — interior panel (case 1) coefficients.
_RATIOS = (1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0)
_AX_NEG = (0.032, 0.037, 0.043, 0.047, 0.051, 0.053, 0.060, 0.065)
_AX_POS = (0.024, 0.028, 0.032, 0.036, 0.039, 0.041, 0.045, 0.049)
_AY_NEG, _AY_POS = 0.032, 0.024


def _interp(ratio: float, table: tuple[float, ...]) -> float:
    r = min(max(ratio, _RATIOS[0]), _RATIOS[-1])
    for i in range(1, len(_RATIOS)):
        if r <= _RATIOS[i]:
            t = (r - _RATIOS[i - 1]) / (_RATIOS[i] - _RATIOS[i - 1])
            return table[i - 1] + t * (table[i] - table[i - 1])
    return table[-1]


def required_thickness_mm(lx_m: float, two_way: bool, continuous: bool = True) -> int:
    """Overall depth from deflection-control ratios.

    Two-way: IS 456:2000 Cl.24.1 (short span / overall depth 40 or 35 for mild
    steel, ×0.8 for Fe500 → 32 / 28). One-way: Cl.23.2.1 (basic 26 or 20,
    ×0.8 for Fe500 → 20.8 / 16 on the effective depth).
    """
    if two_way:
        ratio = 32.0 if continuous else 28.0
        depth = lx_m * 1000.0 / ratio
    else:
        ratio = 20.8 if continuous else 16.0
        depth = lx_m * 1000.0 / ratio + _EFF_COVER_MM
    return min(MAX_THICKNESS_MM, max(MIN_THICKNESS_MM, ceil_to(depth, 5)))


def _bar_and_spacing(ast_req: float, d_mm: float, main: bool) -> tuple[int, int]:
    """Pick 8/10/12 bar + spacing for a required steel area (mm²/m).

    Spacing caps: IS 456:2000 Cl.26.3.3(b) — 3d/300 for main, 5d/450 for
    distribution — plus practice caps of 200 (main) / 250 (distribution).
    """
    code_cap = min(floor_to(3 * d_mm, 25), 300) if main else min(floor_to(5 * d_mm, 25), 450)
    practice_cap = 200 if main else 250
    for dia in (8, 10, 12):
        s = floor_to(BAR_AREA_MM2[dia] * 1000.0 / ast_req, 25)
        s = min(s, code_cap, practice_cap)
        if s >= 100:
            return dia, s
    return 12, 100


def design_slab(
    lx_m: float,
    ly_m: float,
    *,
    fck: float = 20.0,
    fy: float = 500.0,
    ll_kpa: float = LL_FLOOR_KPA,
    continuous: bool = True,
    panel_id: str = "S1",
    floor: int = 0,
    x_m: float | None = None,
    y_m: float | None = None,
) -> tuple[Member, list[dict]]:
    """Design one slab panel; returns (member, bbs_bar_dicts).

    IS 456:2000 Cl.24.4 (one-way/two-way split), Cl.23.2.1/Cl.24.1 (depth),
    Annex D Table 26 (two-way moments), Annex G (Ast), Cl.26.5.2.1 (min steel).
    """
    lx, ly = min(lx_m, ly_m), max(lx_m, ly_m)
    two_way = (ly / lx) <= 2.0
    thk = required_thickness_mm(lx, two_way, continuous)
    d = thk - _EFF_COVER_MM
    wu = slab_factored_kpa(thk, ll_kpa)

    if two_way:
        ratio = ly / lx
        mu_main = _interp(ratio, _AX_NEG) * wu * lx * lx  # support strip governs
        clause_span = "IS 456:2000 Cl.24.4 & Annex D Table 26 (two-way moments)"
        clause_depth = "IS 456:2000 Cl.24.1 (short-span/depth, ×0.8 for Fe500)"
    else:
        mu_main = wu * lx * lx / 8.0  # conservative simply-supported strip
        clause_span = "IS 456:2000 Cl.24.4 (one-way, ly/lx > 2)"
        clause_depth = "IS 456:2000 Cl.23.2.1 (span/depth 26×0.8 ≈ 20.8)"

    ast_min = 0.0012 * 1000.0 * thk  # Cl.26.5.2.1 — 0.12% of gross for HYSD
    ast_flex = ast_required_mm2(mu_main, 1000.0, d, fck, fy)
    ast_req = max(ast_flex if ast_flex is not None else ast_min * 3, ast_min)

    dia, s = _bar_and_spacing(ast_req, d, main=True)
    ast_prov = BAR_AREA_MM2[dia] * 1000.0 / s
    util = mu_main / max(mu_capacity_knm(ast_prov, 1000.0, d, fck, fy), 1e-6)

    bars: list[dict]
    if two_way:
        rebar = f"{dia}# @ {s} c/c both ways (short-span steel; Annex D distribution)"
        bars = [
            {"dia": dia, "count": math.ceil(ly * 1000 / s) + 1, "cut_m": lx + 2 * 47 * dia / 1000, "shape": "straight"},
            {"dia": dia, "count": math.ceil(lx * 1000 / s) + 1, "cut_m": ly + 2 * 47 * dia / 1000, "shape": "straight"},
        ]
    else:
        d_dia, d_s = _bar_and_spacing(ast_min, d, main=False)
        rebar = f"{dia}# @ {s} c/c (main) + {d_dia}# @ {d_s} c/c (distribution)"
        bars = [
            {"dia": dia, "count": math.ceil(ly * 1000 / s) + 1, "cut_m": lx + 2 * 47 * dia / 1000, "shape": "straight"},
            {"dia": d_dia, "count": math.ceil(lx * 1000 / d_s) + 1, "cut_m": ly + 2 * 47 * d_dia / 1000, "shape": "straight"},
        ]

    member = Member(
        id=panel_id,
        kind="slab",
        floor=floor,
        size_mm=(int(round(lx * 1000)), int(round(ly * 1000))),
        thickness_mm=thk,
        rebar=rebar,
        design_forces={"wu_kN_m2": round(wu, 2), "Mu_kNm_m": round(mu_main, 2)},
        utilization=round(util, 2),
        clause_refs=[
            clause_depth,
            clause_span,
            "IS 456:2000 Annex G (Ast)",
            "IS 456:2000 Cl.26.5.2.1 (min steel 0.12%)",
        ],
        x_m=x_m,
        y_m=y_m,
    )
    return member, bars
