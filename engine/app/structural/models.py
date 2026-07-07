"""Wire models for the preliminary RCC structural-design module.

Everything here is PRELIMINARY sizing for early coordination (grids, member
sections, indicative rebar, a bar-bending summary and a written design basis).
It is NOT a construction design — see ``DISCLAIMER``.
"""

from __future__ import annotations

from typing import Literal, Optional

from app.models.base import CamelModel

DISCLAIMER = (
    "Preliminary structural design for early coordination only — NOT for construction. "
    "All members must be designed/verified and the drawings signed by a licensed "
    "structural engineer before any statutory submission or site work."
)


class GridLine(CamelModel):
    """One structural grid line. ``axis='x'`` = a line at constant x (labelled A, B, C…);
    ``axis='y'`` = a line at constant y (labelled 1, 2, 3…). Offsets in metres from the
    plot SW origin (same coordinate system as the Plan)."""

    axis: Literal["x", "y"]
    label: str
    offset_m: float


class BarRow(CamelModel):
    """One row of the approximate bar-bending schedule (BBS)."""

    mark: str
    member_id: str
    bar_dia_mm: int
    shape: str
    count: int
    cut_length_m: float
    total_kg: float


class Member(CamelModel):
    """One designed RCC member with its preliminary section, rebar and utilization."""

    id: str
    kind: Literal["column", "beam", "slab", "footing", "plinth_beam", "lintel"]
    floor: int = 0
    size_mm: tuple[int, int]  # (b, D) for beams/columns, (L, B) plan for footings/slabs
    thickness_mm: Optional[int] = None  # slab depth / footing thickness
    rebar: str  # human string e.g. "4-16# + 8# ties @ 175 c/c"
    design_forces: dict[str, float] = {}
    utilization: float = 0.0  # demand / capacity, 0..1 (may slightly exceed on warnings)
    clause_refs: list[str] = []
    # Plan position (columns / footings) so the UI can draw the column layout.
    x_m: Optional[float] = None
    y_m: Optional[float] = None


class DesignBasisSection(CamelModel):
    title: str
    body: str
    clause_refs: list[str] = []
    assumptions: list[str] = []


class StructuralDesign(CamelModel):
    schema_version: Literal["1.0"] = "1.0"
    concrete_grade: str
    steel_grade: str
    seismic: dict  # zone, Z, I, R, Sa_g, Ah, seismicWeight_kN, baseShear_kN, clause…
    sbc_kpa: float
    soil_type: str
    grid: list[GridLine]
    members: list[Member]
    bbs: list[BarRow]
    future_floor_provision: bool = False
    design_basis: list[DesignBasisSection]
    disclaimer: str
