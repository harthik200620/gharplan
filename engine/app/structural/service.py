"""design_structure — orchestrates the preliminary RCC design for a Plan.

Pipeline: grid → loads → slabs → beams → columns → footings → seismic check →
prescriptive detailing → BBS → written design basis. Pure arithmetic end to end
(< 2 s for a G+2). Every number is PRELIMINARY — see ``models.DISCLAIMER``.
"""

from __future__ import annotations

from shapely.geometry import Point as ShPoint
from shapely.geometry import Polygon

from app.models.plan import Plan

from .bbs import build_bbs, totals_by_dia
from .beam import TAU_C_MPA, design_beam
from .column import design_column
from .detailing import detailing_members, ductility_notes
from .footing import SBC_KPA, design_footing
from .grid import ColumnPoint, footprint_of, propose_grid
from .loads import (
    BEAM_SELF_KN_M,
    FLOOR_FINISH_KPA,
    GAMMA_F,
    LL_FLOOR_KPA,
    LL_ROOF_KPA,
    PARAPET_KN_M,
    WALL_LINE_KN_M,
    column_load_takedown,
    slab_factored_kpa,
)
from .models import DISCLAIMER, DesignBasisSection, Member, StructuralDesign
from .seismic import assess_seismic
from .slab import design_slab

# Rooms that never get a representative slab panel (open to sky / minor).
_NO_SLAB_KINDS = {"garden", "courtyard", "parking", "balcony", "sitout"}


def _bbox(poly) -> tuple[float, float, float, float]:
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def _slab_panels(plan: Plan) -> list:
    """The 2–4 largest ground-floor room rectangles as representative panels."""
    ground = [r for r in plan.rooms if (r.floor or 0) == 0]
    good = [r for r in ground if r.type.value not in _NO_SLAB_KINDS and r.area_sqm >= 4.0]
    good.sort(key=lambda r: r.area_sqm, reverse=True)
    if not good and ground:
        good = sorted(ground, key=lambda r: r.area_sqm, reverse=True)[:1]
    return good[:4]


def _wall_length_m(plan: Plan) -> float:
    """Total ground-floor wall run ≈ half the sum of room perimeters (shared walls)."""
    ground = [r for r in plan.rooms if (r.floor or 0) == 0]
    total = sum(r.perimeter_m or 0.0 for r in ground)
    if total <= 0:
        total = sum(Polygon(r.polygon).length for r in ground if len(r.polygon) >= 3)
    return total / 2.0


def _beam_members(
    columns: list[ColumnPoint],
    xs: list[float],
    ys: list[float],
    footprint,
    wu_kpa: float,
    floors: int,
    fck: float,
    fy: float,
) -> list[tuple[Member, list[dict]]]:
    """Grid-beam segments between adjacent columns (perimeter + interior)."""
    boundary = footprint.boundary
    out: list[tuple[Member, list[dict]]] = []
    n = 0

    def _line_load(mid_x: float, mid_y: float) -> float:
        """230 wall on typical floor beams; parapet on roof perimeter (G houses)."""
        if floors >= 2:
            return WALL_LINE_KN_M
        return PARAPET_KN_M if boundary.distance(ShPoint(mid_x, mid_y)) < 0.2 else 0.0

    def _trib_width(offset: float, axis_lines: list[float]) -> float:
        i = min(range(len(axis_lines)), key=lambda k: abs(axis_lines[k] - offset))
        left = (offset - axis_lines[i - 1]) / 2.0 if i > 0 else 0.0
        right = (axis_lines[i + 1] - offset) / 2.0 if i < len(axis_lines) - 1 else 0.0
        return left + right

    def _segments(along_y: bool):
        nonlocal n
        key = (lambda c: c.x) if along_y else (lambda c: c.y)
        sub = (lambda c: c.y) if along_y else (lambda c: c.x)
        lines: dict[float, list[ColumnPoint]] = {}
        for c in columns:
            lines.setdefault(round(key(c), 3), []).append(c)
        for offset, cols in sorted(lines.items()):
            cols.sort(key=sub)
            trib_w = _trib_width(offset, xs if along_y else ys)
            for a, b in zip(cols, cols[1:]):
                span = sub(b) - sub(a)
                if span < 0.5:
                    continue
                mid = ((a.x + b.x) / 2.0, (a.y + b.y) / 2.0)
                if not footprint.buffer(0.15).covers(ShPoint(*mid)):
                    continue
                w = wu_kpa * trib_w + GAMMA_F * (_line_load(*mid) + BEAM_SELF_KN_M)
                n += 1
                member, bars = design_beam(
                    span, w, fck=fck, fy=fy, beam_id=f"B{n}", x_m=round(mid[0], 2), y_m=round(mid[1], 2)
                )
                out.append((member, bars))

    _segments(along_y=True)
    _segments(along_y=False)
    return out


def _design_basis(
    *,
    fck: float,
    concrete: str,
    steel: str,
    floors: int,
    future_floors: int,
    soil_type: str,
    sbc: float,
    seismic: dict,
    slab_t_mm: int,
    n_columns: int,
    steel_totals: dict[int, float],
) -> list[DesignBasisSection]:
    zone = seismic["zone"]
    return [
        DesignBasisSection(
            title="Materials & codes",
            body=(
                f"RCC frame in {concrete} concrete with {steel} (HYSD) reinforcement. Design per "
                "IS 456:2000 (limit state), loads per IS 875 Parts 1–2, seismic check per IS 1893-1:2016, "
                "detailing guidance per IS 13920:2016, foundations per IS 456 Cl.34 on IS 1904 presumptive bearing. "
                f"{concrete} is adopted "
                + ("because the design height is 3+ suspended floors." if fck >= 25 else "for a low-rise (≤ G+1 design height) house.")
            ),
            clause_refs=["IS 456:2000", "IS 875-1/-2:1987", "IS 1893-1:2016", "IS 13920:2016", "IS 1904"],
            assumptions=[
                "Nominal cover: slabs 20, beams 25, columns 40, footings 50 (mild exposure, IS 456 Table 16).",
                "Fe500: design yield 0.87·fy; development length ≈ 47Ø on M20.",
            ],
        ),
        DesignBasisSection(
            title="Loads",
            body=(
                f"Dead: RCC 25 kN/m³, slab self weight from thickness ({slab_t_mm} mm typical), floor finish "
                f"{FLOOR_FINISH_KPA:.1f} kPa, 230 brick wall {WALL_LINE_KN_M:.1f} kN/m line load, parapet {PARAPET_KN_M:.1f} kN/m. "
                f"Live: residential rooms {LL_FLOOR_KPA:.1f} kPa, accessible roof {LL_ROOF_KPA:.1f} kPa. "
                "Governing gravity combination 1.5(DL+LL)."
            ),
            clause_refs=["IS 875-1:1987 Table 1", "IS 875-2:1987 Table 1", "IS 456:2000 Table 18"],
            assumptions=[
                "Wind (IS 875-3) does not govern low-rise houses of this height class; not computed here.",
                "Walls assumed on ~half the tributary beam length in the column take-down.",
            ],
        ),
        DesignBasisSection(
            title="Gravity system & grid",
            body=(
                f"RCC moment frame on {n_columns} columns. Grid lines follow the ground-floor walls: wall lines "
                "clustered within 0.3 m, bays capped at ~4.5 m by intermediate lines, minimum spacing 2.4 m. "
                "Columns at grid intersections on/inside the footprint; each carries a half-spacing tributary "
                "rectangle clipped to the footprint."
            ),
            clause_refs=["IS 456:2000 Cl.22 (structural frames)"],
            assumptions=["Upper floors are assumed to stack over the ground-floor grid (standard practice for these plans)."],
        ),
        DesignBasisSection(
            title="Slab design",
            body=(
                "Representative panels = the largest ground-floor rooms. Two-way where ly/lx ≤ 2 with Annex D "
                "Table 26 interior-panel coefficients; one-way strips otherwise (wl²/8, conservative). Depth by "
                "deflection ratios reduced ×0.8 for Fe500 (two-way lx/D ≤ 32 continuous / 28 simple; one-way "
                "span/d ≤ 20.8), clamped 110–160 mm. Steel per Annex G, minimum 0.12%; main spacing capped at "
                "200 c/c (practice, tighter than 3d/300)."
            ),
            clause_refs=[
                "IS 456:2000 Cl.24.4",
                "IS 456:2000 Cl.23.2.1 & Cl.24.1",
                "IS 456:2000 Annex D Table 26",
                "IS 456:2000 Annex G",
                "IS 456:2000 Cl.26.5.2.1",
            ],
            assumptions=["Interior-panel coefficients applied to all panels (edge/corner variation ignored at this stage)."],
        ),
        DesignBasisSection(
            title="Beam design",
            body=(
                "All grid beams 230 wide (wall width). Loads: slab share as w = wu·lx/2 per loaded side "
                "(trapezoids simplified) + wall/parapet line load + self weight; simply-supported envelope "
                "Mu = wl²/8, Vu = wl/2. Depth from Fe500 Mu,lim ≈ 0.133·fck·b·d² rounded to 380/450/530; steel per "
                f"Annex G; shear vs τc = {TAU_C_MPA} MPa (Table 19, conservative) with 2L-8# stirrups per Cl.40.4, "
                "spacing ≤ 0.75d/300."
            ),
            clause_refs=[
                "IS 456:2000 Cl.38.1",
                "IS 456:2000 Annex G",
                "IS 456:2000 Cl.40 & Table 19",
                "IS 456:2000 Cl.26.5.1",
            ],
            assumptions=[
                "Continuity/redistribution ignored — simply-supported moments are an upper bound.",
                "The typical (worst) suspended-floor beam is designed once and repeated at every level.",
            ],
        ),
        DesignBasisSection(
            title="Column design",
            body=(
                "Axial take-down per tributary area with 1.5(DL+LL). Sections from the short-column capacity "
                "Pu = 0.4·fck·Ac + 0.67·fy·Asc stepping through 230×230 → 300×450; longitudinal steel 0.8–4%; "
                "8# ties at ≤ min(16Ø, 300, least lateral dimension). All columns are short (lex/D ≤ 12 at 3.0 m "
                "storeys)."
                + (
                    f" Sized including {future_floors} declared future floor(s) — see future-floor provision."
                    if future_floors
                    else ""
                )
            ),
            clause_refs=[
                "IS 456:2000 Cl.39.3",
                "IS 456:2000 Cl.25.1.2",
                "IS 456:2000 Cl.26.5.3.1 & Cl.26.5.3.2",
            ],
            assumptions=["Gravity-governed; frame moments from lateral loads to be added by the structural engineer."],
        ),
        DesignBasisSection(
            title="Foundations",
            body=(
                f"Isolated square pads on presumptive SBC {sbc:.0f} kPa for declared soil type '{soil_type}' "
                "(owner-declared / jurisdiction-typical — IS 1904 presumptive value, MUST be verified by a soil "
                "investigation). Bearing area on service load P = Pu/1.5; pads rounded up to 0.1 m (min 1.0 m); "
                "thickness by size band 300/380/450/530 (preliminary one-way-shear proxy); 12# bottom mesh from "
                "bending at the column face (Annex G)."
            ),
            clause_refs=["IS 1904 (presumptive SBC — verify by soil test)", "IS 456:2000 Cl.34", "IS 456:2000 Annex G"],
            assumptions=[
                f"Founding depth ≈ 1.5 m in {soil_type.replace('_', ' ')}; water table below founding level.",
                "Plinth beams tie all footings both ways.",
            ],
        ),
        DesignBasisSection(
            title="Seismic assessment",
            body=(
                f"Zone {zone} (Z = {seismic['Z']}), I = 1.0, R = 3.0 (OMRF, conservative), Ta = {seismic['Ta_s']} s, "
                f"Sa/g = 2.5 (short-period plateau) → Ah = {seismic['Ah']} and base shear ≈ "
                f"{seismic['baseShear_kN']} kN = {seismic['baseShearPctW']}% of the seismic weight "
                f"({seismic['seismicWeight_kN']} kN = DL + 25% floor LL). This is a base-shear magnitude CHECK with "
                "ductile-detailing notes — NOT member-level seismic design; the licensed engineer must distribute "
                "the shear and verify drift and joints. In Zone III+ adopt SMRF (R = 5) with IS 13920 detailing."
            ),
            clause_refs=[
                "IS 1893-1:2016 Cl.6.4.2 & Cl.7.2.1",
                "IS 1893-1:2016 Cl.7.6.2 (Ta)",
                "IS 1893-1:2016 Table 10 (seismic weight)",
                seismic["zoneSource"],
            ],
            assumptions=["Medium (Type II) soil response spectrum; regular plan/elevation assumed."],
        ),
        DesignBasisSection(
            title="Detailing & ductility",
            body=(
                "Plinth beams 230×300 (4-12#) on all grid lines; lintels 230×150 (2-10#) over openings. "
                + " ".join(ductility_notes(zone))
            ),
            clause_refs=["IS 456:2000 Cl.26", "IS 13920:2016", "IS 4326"],
            assumptions=[],
        ),
        DesignBasisSection(
            title="Limitations",
            body=(
                "Preliminary, gravity-governed member sizing for coordination and budgeting: no member-level "
                "seismic/wind design, no serviceability calculations beyond span/depth control, no crack-width or "
                "punching checks, rectangular-room geometry assumed, SBC presumptive. Steel quantities are BBS "
                f"approximations (total ≈ {sum(steel_totals.values()):.0f} kg). Every member must be re-designed "
                "and certified by a licensed structural engineer."
            ),
            clause_refs=["IS 456:2000", "IS 1893-1:2016"],
            assumptions=[DISCLAIMER],
        ),
    ]


def design_structure(plan: Plan, future_floors: int = 0) -> StructuralDesign:
    """Full preliminary RCC design for a normalized Plan (G to G+3).

    Orchestrates grid → IS 875 loads → IS 456 slabs/beams/columns/footings →
    IS 1893 base-shear check → detailing → BBS → design basis. ``future_floors``
    sizes columns/footings for declared future vertical expansion.
    """
    floors = min(max(1, plan.plot.floors or 1), 4)
    future_floors = max(0, min(future_floors, 3))
    design_floors = floors + future_floors
    fck = 25.0 if design_floors >= 3 else 20.0
    concrete = f"M{int(fck)}"
    steel, fy = "Fe500", 500.0

    soil_type = plan.plot.soil_type or "medium_clay"
    sbc = SBC_KPA.get(soil_type, SBC_KPA["medium_clay"])

    grid_lines, columns = propose_grid(plan)
    footprint = footprint_of(plan)
    xs = [g.offset_m for g in grid_lines if g.axis == "x"]
    ys = [g.offset_m for g in grid_lines if g.axis == "y"]

    member_bars: list[tuple[Member, list[dict]]] = []

    # --- Slabs (representative panels = largest ground rooms) ---
    ll_kpa = LL_FLOOR_KPA if floors >= 2 else LL_ROOF_KPA
    slab_members: list[Member] = []
    for i, room in enumerate(_slab_panels(plan), start=1):
        x0, y0, x1, y1 = _bbox(room.polygon)
        cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        m, bars = design_slab(
            max(x1 - x0, 0.5),
            max(y1 - y0, 0.5),
            fck=fck,
            fy=fy,
            ll_kpa=ll_kpa,
            panel_id=f"S{i}",
            x_m=round(cx, 2),
            y_m=round(cy, 2),
        )
        slab_members.append(m)
        member_bars.append((m, bars))
    slab_t = max((m.thickness_mm or 125 for m in slab_members), default=125)
    wu_kpa = slab_factored_kpa(slab_t, ll_kpa)

    # --- Beams (grid segments between adjacent columns) ---
    beam_pairs = _beam_members(columns, xs, ys, footprint, wu_kpa, floors, fck, fy)
    member_bars.extend(beam_pairs)
    plinth_total = sum(p[0].design_forces.get("span_m", 0.0) for p in beam_pairs)

    # --- Columns + footings (take-down per tributary area) ---
    for cp in columns:
        pu = column_load_takedown(cp, floors, future_floors=future_floors, slab_thickness_mm=slab_t)
        col, col_bars = design_column(
            pu, fck=fck, fy=fy, col_id=cp.id, floors=floors,
            future_floors=future_floors, x_m=cp.x, y_m=cp.y,
        )
        member_bars.append((col, col_bars))
        ftg, ftg_bars = design_footing(
            pu, sbc, col_size_mm=col.size_mm, fck=fck, fy=fy,
            footing_id=f"F-{cp.label}", x_m=cp.x, y_m=cp.y,
        )
        member_bars.append((ftg, ftg_bars))

    # --- Seismic base-shear check ---
    seismic = assess_seismic(
        plan.plot.city.value if hasattr(plan.plot.city, "value") else str(plan.plot.city),
        floors,
        footprint.area,
        _wall_length_m(plan),
        slab_thickness_mm=slab_t,
    )

    # --- Prescriptive detailing (plinth beams, lintels) ---
    lintels = [(o.width_m, o.count) for o in (plan.doors or []) + (plan.windows or [])]
    member_bars.extend(detailing_members(seismic["zone"], plinth_total, lintels))

    rows = build_bbs(member_bars)
    members = [m for m, _ in member_bars]

    return StructuralDesign(
        concrete_grade=concrete,
        steel_grade=steel,
        seismic=seismic,
        sbc_kpa=sbc,
        soil_type=soil_type,
        grid=grid_lines,
        members=members,
        bbs=rows,
        future_floor_provision=future_floors > 0,
        design_basis=_design_basis(
            fck=fck,
            concrete=concrete,
            steel=steel,
            floors=floors,
            future_floors=future_floors,
            soil_type=soil_type,
            sbc=sbc,
            seismic=seismic,
            slab_t_mm=slab_t,
            n_columns=len(columns),
            steel_totals=totals_by_dia(rows),
        ),
        disclaimer=DISCLAIMER,
    )
