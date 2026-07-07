"""Preliminary RCC column design per IS 456:2000 (axially loaded short columns).

Section from the short-column axial capacity Pu = 0.4·fck·Ac + 0.67·fy·Asc
(Cl.39.3 — the 10% strength reduction for minimum eccentricity is built into the
0.4/0.67 constants). Sizes step through the standard 230-form ladder; steel
0.8–4% (Cl.26.5.3.1); lateral ties per Cl.26.5.3.2.
"""

from __future__ import annotations

import math

from .loads import STOREY_HEIGHT_M
from .models import Member
from .rc import BAR_AREA_MM2, floor_to

SIZES_MM = ((230, 230), (230, 300), (230, 380), (230, 450), (300, 450))
# (bar count, dia) options — small sections keep 4 bars, deeper ones may use 6-8.
_LAYOUTS = ((4, 12), (4, 16), (4, 20), (6, 16), (6, 20), (8, 20), (8, 25))


def _max_bars(size: tuple[int, int]) -> int:
    if size == (230, 230):
        return 4
    return 6 if size[1] <= 380 else 8


def design_column(
    pu_kn: float,
    *,
    fck: float = 20.0,
    fy: float = 500.0,
    col_id: str = "C1",
    floors: int = 1,
    future_floors: int = 0,
    x_m: float | None = None,
    y_m: float | None = None,
) -> tuple[Member, list[dict]]:
    """Design one column for factored Pu (kN); returns (member, bbs_bars).

    IS 456:2000 Cl.39.3 (short axially loaded members with min eccentricity),
    Cl.25.1.2 (short-column check lex/D ≤ 12), Cl.26.5.3.1 (0.8–4% steel),
    Cl.26.5.3.2 (ties: ≥ Ø/4, pitch ≤ min(16Ø, 300, least lateral dimension)).
    """
    denom = 0.67 * fy - 0.4 * fck
    chosen = SIZES_MM[-1]
    count, dia = _LAYOUTS[-1]
    for size in SIZES_MM:
        ag = size[0] * size[1]
        asc_req = max(0.008 * ag, (pu_kn * 1000.0 - 0.4 * fck * ag) / denom)
        if asc_req > 0.04 * ag:
            continue
        layout = next(
            (
                (n, dd)
                for n, dd in _LAYOUTS
                if n <= _max_bars(size) and n * BAR_AREA_MM2[dd] >= asc_req
            ),
            None,
        )
        if layout:
            chosen, (count, dia) = size, layout
            break

    b, dd = chosen
    ag = b * dd
    asc = count * BAR_AREA_MM2[dia]
    puz = (0.4 * fck * (ag - asc) + 0.67 * fy * asc) / 1000.0
    util = pu_kn / max(puz, 1e-6)
    pct = 100.0 * asc / ag

    # Short-column check — IS 456:2000 Cl.25.1.2 (braced frame, lex ≈ 0.85·l0).
    slenderness = 0.85 * STOREY_HEIGHT_M * 1000.0 / min(b, dd)
    tie_s = max(100, floor_to(min(16 * dia, 300, min(b, dd)), 25))

    note = f" (sized incl. {future_floors} future floor{'s' if future_floors > 1 else ''})" if future_floors else ""
    member = Member(
        id=col_id,
        kind="column",
        floor=0,
        size_mm=chosen,
        rebar=f"{count}-{dia}# + 8# ties @ {tie_s} c/c ({pct:.1f}%){note}",
        design_forces={"Pu_kN": round(pu_kn, 1), "slenderness_lex_D": round(slenderness, 1)},
        utilization=round(util, 2),
        clause_refs=[
            "IS 456:2000 Cl.39.3 (axial capacity with min eccentricity)",
            "IS 456:2000 Cl.25.1.2 (short column, lex/D ≤ 12)",
            "IS 456:2000 Cl.26.5.3.1 (longitudinal steel 0.8–4%)",
            "IS 456:2000 Cl.26.5.3.2 (lateral ties)",
        ],
        x_m=x_m,
        y_m=y_m,
    )
    height_m = STOREY_HEIGHT_M * max(1, floors) + 0.75  # to footing + kicker
    bars = [
        {"dia": dia, "count": count, "cut_m": height_m + 2 * 47 * dia / 1000.0, "shape": "straight + L (lap/anchor)"},
        {
            "dia": 8,
            "count": math.ceil(height_m * 1000.0 / tie_s) + 1,
            "cut_m": round(2 * (b + dd) / 1000.0 + 0.1, 2),
            "shape": "tie",
        },
    ]
    return member, bars
