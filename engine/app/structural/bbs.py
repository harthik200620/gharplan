"""Approximate bar-bending schedule (BBS) assembly.

Cut lengths are preliminary: member length + development 2×47Ø/1000 for straight
bars (Ld ≈ 47Ø for Fe500 on M20 per IS 456:2000 Cl.26.2.1), closed perimeter +
hook allowance for stirrups/ties, and pad width + end hooks for footing mesh —
the designers supply the per-bar dicts, this module prices them. Unit weight =
Ø²/162 kg/m (standard steel-table identity).
"""

from __future__ import annotations

from .models import BarRow, Member


def build_bbs(member_bars: list[tuple[Member, list[dict]]]) -> list[BarRow]:
    """Flatten (member, bar-dict) pairs into marked BarRows with weights."""
    rows: list[BarRow] = []
    for member, bars in member_bars:
        for i, bar in enumerate(bars, start=1):
            dia = int(bar["dia"])
            count = int(bar["count"])
            cut = float(bar["cut_m"])
            kg = (dia * dia / 162.0) * cut * count
            rows.append(
                BarRow(
                    mark=f"{member.id}/{i}",
                    member_id=member.id,
                    bar_dia_mm=dia,
                    shape=str(bar.get("shape", "straight")),
                    count=count,
                    cut_length_m=round(cut, 2),
                    total_kg=round(kg, 1),
                )
            )
    return rows


def totals_by_dia(rows: list[BarRow]) -> dict[int, float]:
    """Total steel (kg) per bar diameter — the BBS summary line."""
    totals: dict[int, float] = {}
    for r in rows:
        totals[r.bar_dia_mm] = round(totals.get(r.bar_dia_mm, 0.0) + r.total_kg, 1)
    return dict(sorted(totals.items()))
