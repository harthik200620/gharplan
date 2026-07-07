"""Prescriptive detailing members (plinth beams, lintels) and ductility notes.

These are standard-practice members sized by rule, not calculation — plinth
beams tie the footings and carry the ground-floor masonry (IS 456:2000 Cl.26.5
minima), lintels span wall openings. In seismic Zone III and above the IS
13920:2016 ductile-detailing provisions are flagged for the whole frame.
"""

from __future__ import annotations

import math

from .models import Member


def detailing_members(
    zone: str,
    plinth_total_m: float,
    lintel_openings: list[tuple[float, int]],
) -> list[tuple[Member, list[dict]]]:
    """Typical plinth beam + lintel members (prescriptive; IS 456:2000 Cl.26.5).

    ``lintel_openings`` = [(clear width m, count), …] from the plan's doors and
    windows; every lintel bears 150 mm each side.
    """
    hooks = " (135° hooks)" if zone in ("III", "IV", "V") else ""
    out: list[tuple[Member, list[dict]]] = []

    plinth = Member(
        id="PB1",
        kind="plinth_beam",
        floor=0,
        size_mm=(230, 300),
        rebar=f"4-12# + 2L-8# stirrups @ 200 c/c{hooks} — typical, all grid lines at plinth",
        design_forces={"totalRun_m": round(plinth_total_m, 1)},
        utilization=0.0,
        clause_refs=[
            "IS 456:2000 Cl.26.5.1 (nominal beam detailing)",
            "IS 4326 (plinth band good practice)",
        ],
    )
    run = max(plinth_total_m, 4.0)
    plinth_bars = [
        {"dia": 12, "count": 4, "cut_m": round(run / max(1, round(run / 4.0)) + 1.13, 2), "shape": "straight (typical bay)"},
        {"dia": 8, "count": math.ceil(run * 1000.0 / 200) + 1, "cut_m": 1.16, "shape": "stirrup"},
    ]
    out.append((plinth, plinth_bars))

    n_lintels = sum(c for _, c in lintel_openings) or 1
    widths = [w for w, c in lintel_openings for _ in range(c)] or [1.0]
    avg_len = sum(widths) / len(widths) + 0.3  # +150 bearing each side
    lintel = Member(
        id="L1",
        kind="lintel",
        floor=0,
        size_mm=(230, 150),
        rebar=f"2-10# bottom + 2-8# top{hooks} — typical over all {n_lintels} openings, 150 bearing each side",
        design_forces={"openings": float(n_lintels), "avgSpan_m": round(avg_len, 2)},
        utilization=0.0,
        clause_refs=["IS 456:2000 Cl.26.5.1 (nominal detailing)"],
    )
    lintel_bars = [
        {"dia": 10, "count": 2 * n_lintels, "cut_m": round(avg_len + 0.94, 2), "shape": "straight"},
        {"dia": 8, "count": 2 * n_lintels, "cut_m": round(avg_len + 0.75, 2), "shape": "straight (top)"},
    ]
    out.append((lintel, lintel_bars))
    return out


def ductility_notes(zone: str) -> list[str]:
    """IS 13920:2016 ductile-detailing flags, mandatory in Zone III and above."""
    notes = [
        "Development length Ld ≈ 47Ø (Fe500 on M20) at all terminations and laps.",
        "Column ties and beam stirrups continue through beam-column joints.",
    ]
    if zone in ("III", "IV", "V"):
        notes = [
            "IS 13920:2016 applies (Zone III+): all stirrups/ties with 135° seismic hooks, 10Ø extensions.",
            "Confining reinforcement through beam-column joints and over 'lo' regions at member ends (IS 13920 Cl.7/8).",
            "Minimum web (vertical) reinforcement 0.25% where structural walls are used (IS 13920 Cl.10).",
            "Adopt SMRF proportioning (R = 5) with capacity-design checks by the structural engineer.",
        ] + notes
    return notes
