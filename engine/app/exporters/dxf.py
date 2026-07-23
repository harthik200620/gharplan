"""DXF export (ezdxf, R2010) — a multi-view CAD sheet in model space.

The plot + room plan (per floor) sits at the origin; four elevations, a section
through the staircase, an MEP services overlay (plumbing + electrical), and the
working-drawing schedules are laid out around it on named layers, all to scale in
metres. Every view is projected from the canonical Plan with the same shared
geometry the on-screen viewer and the PDF use.
"""

from __future__ import annotations

import io
from typing import TYPE_CHECKING, Optional

import ezdxf
from ezdxf.enums import TextEntityAlignment

if TYPE_CHECKING:  # optional structural overlay — no hard runtime dependency
    from app.structural.models import StructuralDesign

from app.config import DISCLAIMER_EXPORT
from app.models.enums import room_label
from app.models.plan import Plan
from app.models.reports import CodeReport
from app.services import schedules as sched
from app.services.cad_geom import (
    LEVELS,
    WALL_T,
    bounds,
    building_footprint,
    derive_walls,
    floors_of,
    front_face,
    place_openings,
    room_center,
    structural_rooms,
    wall_segment_rect,
)
from app.services.design_narrative_service import get_design_narrative
from app.services.vastu_service import check_vastu
from app.services.rules import get_vastu_rules
from app.services.elevations import elevation_openings, roof_level, section_model
from app.services.mep_model import build_mep_model

# AutoCAD Color Index per room type (cosmetic).
ROOM_ACI = {
    "kitchen": 1,
    "pooja": 2,
    "master_bedroom": 5,
    "bedroom": 5,
    "childrens_bedroom": 4,
    "living": 3,
    "dining": 30,
    "toilet": 6,
    "bathroom": 6,
    "staircase": 8,
    "entrance": 40,
    "study": 5,
    "store": 9,
    "utility": 9,
    "balcony": 3,
    "parking": 8,
    "overhead_tank": 6,
    "borewell": 6,
    "brahmasthan": 2,
}

# Service line ACI (cold blue, hot red, soil brown, waste green, vent cyan).
SERVICE_ACI = {"cold": 5, "hot": 1, "soil": 34, "waste": 3, "vent": 4, "rainwater": 6}
FIXTURE_CODE = {
    "wc": "WC",
    "basin": "WB",
    "shower": "SH",
    "sink": "KS",
    "floor_drain": "FD",
    "washing_machine": "WM",
}
ELEC_CODE = {
    "light": "L",
    "fan": "F",
    "socket6a": "6A",
    "socket16a": "16A",
    "ac": "AC",
    "exhaust": "EF",
    "geyser": "GY",
    "bell": "BL",
    "switchboard": "SB",
}
# Whole-house services plant — short code drawn beside each node symbol.
NODE_CODE = {
    "oht": "OHT",
    "sump": "SUMP",
    "pump": "P",
    "meter": "kWh",
    "inspection": "IC",
    "septic": "ST",
    "rainpit": "RWH",
    "earthpit": "EP",
}


def _ascii(s: str) -> str:
    """DXF text stays in the ASCII subset of cp1252 so every CAD reader is happy."""
    return (
        s.replace("²", "2").replace("³", "3").replace("×", "x").replace("—", "-")
        .replace("–", "-").replace("·", "-").replace("∅", "dia").replace("°", "deg")
    )


def _layer_name(room_type: str) -> str:
    return f"ROOM_{room_type.upper()}"


def _ensure(doc, name: str, color: int = 7) -> None:
    if name not in doc.layers:
        doc.layers.add(name, color=color)


def _off(pts, dx: float, dy: float):
    return [(float(x) + dx, float(y) + dy) for x, y in pts]


def _text(msp, s: str, x: float, y: float, h: float, layer: str, align=TextEntityAlignment.LEFT):
    msp.add_text(s, dxfattribs={"layer": layer, "height": h}).set_placement((x, y), align=align)


def _rect(msp, x: float, y: float, w: float, h: float, layer: str):
    msp.add_lwpolyline(
        [(x, y), (x + w, y), (x + w, y + h), (x, y + h)], close=True, dxfattribs={"layer": layer}
    )


# --------------------------------------------------------------------------- #
# Plan
# --------------------------------------------------------------------------- #


def _draw_plan(msp, doc, plan: Plan, floor: Optional[int], dx: float, dy: float, mep_base: bool = False):
    w = plan.plot.width_m
    d = plan.plot.depth_m
    plot_layer = "MEP_ROOM" if mep_base else "PLOT"
    _ensure(doc, plot_layer, 8 if mep_base else 7)
    boundary = getattr(plan.plot, "polygon", None)
    if boundary and len(boundary) >= 3:
        # Plot-v2: draw the TRUE surveyed boundary instead of the bbox rectangle.
        msp.add_lwpolyline(
            _off([(float(x), float(y)) for x, y in boundary], dx, dy),
            close=True,
            dxfattribs={"layer": plot_layer},
        )
    else:
        _rect(msp, dx, dy, w, d, plot_layer)

    for room in plan.rooms:
        if floor is not None and (room.floor or 0) != floor:
            continue
        if mep_base:
            layer = "MEP_ROOM"
        else:
            layer = _layer_name(room.type.value)
            _ensure(doc, layer, ROOM_ACI.get(room.type.value, 7))
        msp.add_lwpolyline(_off(room.polygon, dx, dy), close=True, dxfattribs={"layer": layer})
        if not mep_base:
            cx, cy = (room.centroid or (0.0, 0.0))
            label = f"{room_label(room.type.value)}\\P{round(room.area_sqm, 2)} m2"
            mt = msp.add_mtext(label, dxfattribs={"layer": layer, "char_height": 0.18})
            mt.set_location((float(cx) + dx, float(cy) + dy), attachment_point=5)

    # walls — true double-line masonry (230mm exterior / 115mm interior),
    # derived from the room layout, on their own toggleable layers.
    if not mep_base:
        _ensure(doc, "WALL_EXT", 8)
        _ensure(doc, "WALL_INT", 9)
        for seg in derive_walls(plan, floor):
            wr = wall_segment_rect(seg)
            layer = "WALL_EXT" if seg.kind == "ext" else "WALL_INT"
            _rect(msp, dx + wr.x, dy + wr.y, wr.w, wr.h, layer)

    # openings as wall breaks on a dedicated layer
    if not mep_base:
        _ensure(doc, "OPENINGS", 8)
        ids = {r.id for r in plan.rooms if floor is None or (r.floor or 0) == floor}
        for op in place_openings(plan):
            if op.room_id not in ids:
                continue
            half = op.length / 2
            if op.edge in ("N", "S"):
                a, b = (op.cx - half, op.cy), (op.cx + half, op.cy)
            else:
                a, b = (op.cx, op.cy - half), (op.cx, op.cy + half)
            msp.add_lwpolyline(_off([a, b], dx, dy), dxfattribs={"layer": "OPENINGS"})


def _north_arrow(msp, doc, x: float, y: float):
    _ensure(doc, "NORTH", 1)
    msp.add_lwpolyline([(x, y), (x, y + 1.2)], dxfattribs={"layer": "NORTH"})
    msp.add_lwpolyline(
        [(x - 0.18, y + 0.85), (x, y + 1.2), (x + 0.18, y + 0.85)], dxfattribs={"layer": "NORTH"}
    )
    _text(msp, "N", x, y + 1.4, 0.3, "NORTH", TextEntityAlignment.MIDDLE_CENTER)


# --------------------------------------------------------------------------- #
# Elevation
# --------------------------------------------------------------------------- #


def _draw_elevation(msp, doc, plan: Plan, face: str, front: str, dx: float, dy: float):
    """One elevation with FFL at (dx, dy)."""
    _ensure(doc, "ELEV", 8)
    _ensure(doc, "ELEV_OPENING", 5)
    _ensure(doc, "ELEV_TEXT", 7)
    fp = building_footprint(plan)
    face_len = fp.w if face in ("N", "S") else fp.h
    roof = roof_level(plan)

    # ground
    msp.add_lwpolyline(
        [(dx - 0.4, dy + LEVELS.GROUND), (dx + face_len + 0.4, dy + LEVELS.GROUND)],
        dxfattribs={"layer": "ELEV"},
    )
    # mass + parapet
    _rect(msp, dx, dy, face_len, roof, "ELEV")
    _rect(msp, dx, dy + roof, face_len, LEVELS.PARAPET, "ELEV")
    # floor lines
    for f in floors_of(plan):
        yf = f * LEVELS.FLOOR_TO_FLOOR
        if yf > 0:
            msp.add_lwpolyline(
                [(dx, dy + yf), (dx + face_len, dy + yf)], dxfattribs={"layer": "ELEV"}
            )
    # openings
    for op in elevation_openings(plan, face, front):
        base = op.floor * LEVELS.FLOOR_TO_FLOOR
        x0 = op.u - op.length / 2
        _rect(msp, dx + x0, dy + base + op.sill, op.length, op.lintel - op.sill, "ELEV_OPENING")
    _text(msp, f"{face} ELEVATION", dx, dy + LEVELS.GROUND - 0.6, 0.3, "ELEV_TEXT")


# --------------------------------------------------------------------------- #
# Section
# --------------------------------------------------------------------------- #


def _draw_section(msp, doc, plan: Plan, dx: float, dy: float):
    """Section with FFL of the ground floor at (dx, dy)."""
    _ensure(doc, "SECTION", 8)
    _ensure(doc, "SECTION_POCHE", 7)
    _ensure(doc, "SECTION_TEXT", 7)
    sm = section_model(plan)
    span = sm.span
    roof = roof_level(plan)

    # ground line
    msp.add_lwpolyline(
        [(dx - 0.4, dy + LEVELS.GROUND), (dx + span + 0.4, dy + LEVELS.GROUND)],
        dxfattribs={"layer": "SECTION"},
    )
    # footing pads + plinth
    for ex in (0.0, span - WALL_T.EXT):
        _rect(msp, dx + ex - 0.25, dy - LEVELS.FOOTING, WALL_T.EXT + 0.5, LEVELS.FOOTING + LEVELS.GROUND, "SECTION_POCHE")
    _rect(msp, dx, dy + LEVELS.GROUND, span, -LEVELS.GROUND, "SECTION")

    floors = sm.floors or [0]
    for f in floors:
        base = f * LEVELS.FLOOR_TO_FLOOR
        # perimeter walls — 230mm exterior
        _rect(msp, dx, dy + base, WALL_T.EXT, LEVELS.CEIL, "SECTION_POCHE")
        _rect(msp, dx + span - WALL_T.EXT, dy + base, WALL_T.EXT, LEVELS.CEIL, "SECTION_POCHE")
        # partitions + labels — 115mm interior
        cells = [cc for cc in sm.cells if cc.floor == f]
        for cc in cells:
            for ux in (cc.u0, cc.u1):
                if 0.2 < ux < span - 0.2:
                    _rect(msp, dx + ux - WALL_T.INT / 2, dy + base, WALL_T.INT, LEVELS.CEIL, "SECTION_POCHE")
            _text(
                msp, cc.label, dx + (cc.u0 + cc.u1) / 2, dy + base + LEVELS.CEIL / 2, 0.2,
                "SECTION_TEXT", TextEntityAlignment.MIDDLE_CENTER,
            )
        # floor slab
        _rect(msp, dx, dy + base - LEVELS.SLAB_STRUCT, span, LEVELS.SLAB_STRUCT, "SECTION")
    # roof slab + parapet
    _rect(msp, dx, dy + roof - LEVELS.SLAB_STRUCT, span, LEVELS.SLAB_STRUCT, "SECTION")
    _rect(msp, dx, dy + roof, WALL_T.EXT, LEVELS.PARAPET, "SECTION_POCHE")
    _rect(msp, dx + span - WALL_T.EXT, dy + roof, WALL_T.EXT, LEVELS.PARAPET, "SECTION_POCHE")
    _text(msp, "SECTION A-A (through staircase)", dx, dy - LEVELS.FOOTING - 0.6, 0.3, "SECTION_TEXT")


# --------------------------------------------------------------------------- #
# MEP overlay
# --------------------------------------------------------------------------- #


def _draw_mep(msp, doc, plan: Plan, floor: Optional[int], dx: float, dy: float):
    _draw_plan(msp, doc, plan, floor, dx, dy, mep_base=True)
    m = build_mep_model(plan, floor)
    for name, aci in [
        ("MEP_SHAFT", 2), ("MEP_FIXTURE", 7), ("MEP_ELEC", 2), ("MEP_DB", 1),
        # conductor runs on separate layers by class, the way a real electrical DXF
        # keeps sub-mains, switch-legs and dedicated radials independently toggleable
        ("MEP_CONDUIT_SUBMAIN", 6), ("MEP_CONDUIT_SWITCHLEG", 8),
        ("MEP_CONDUIT_DEDICATED", 4), ("MEP_EARTH", 3), ("MEP_NODE", 30), ("MEP_TEXT", 7),
    ]:
        _ensure(doc, name, aci)
    for s, aci in SERVICE_ACI.items():
        _ensure(doc, f"MEP_{s.upper()}", aci)

    if m.shaft:
        sh = m.shaft
        _rect(msp, dx + sh.x, dy + sh.y, sh.w, sh.h, "MEP_SHAFT")
        _text(msp, "SHAFT", dx + sh.x + sh.w / 2, dy + sh.y + sh.h / 2, 0.12, "MEP_TEXT", TextEntityAlignment.MIDDLE_CENTER)

    for run in m.pipes:
        msp.add_lwpolyline(_off(run.points, dx, dy), dxfattribs={"layer": f"MEP_{run.service.upper()}"})
    for fx in m.fixtures:
        msp.add_circle((dx + fx.x, dy + fx.y), 0.18, dxfattribs={"layer": "MEP_FIXTURE"})
        _text(msp, FIXTURE_CODE.get(fx.kind, "?"), dx + fx.x, dy + fx.y, 0.12, "MEP_FIXTURE", TextEntityAlignment.MIDDLE_CENTER)

    _conduit_layer = {
        "home_run": "MEP_CONDUIT_SUBMAIN",
        "switch_leg": "MEP_CONDUIT_SWITCHLEG",
        "dedicated": "MEP_CONDUIT_DEDICATED",
        "earth": "MEP_EARTH",
    }
    for cd in m.conduits:
        msp.add_lwpolyline(
            _off(cd.points, dx, dy),
            dxfattribs={"layer": _conduit_layer.get(cd.kind, "MEP_CONDUIT_SUBMAIN")},
        )
    for ep in m.elec:
        if ep.kind == "db":
            continue
        msp.add_circle((dx + ep.x, dy + ep.y), 0.07, dxfattribs={"layer": "MEP_ELEC"})
        code = ELEC_CODE.get(ep.kind)
        if code:
            _text(msp, code, dx + ep.x + 0.12, dy + ep.y, 0.1, "MEP_ELEC")
    if m.db:
        _rect(msp, dx + m.db.x - 0.2, dy + m.db.y - 0.15, 0.4, 0.3, "MEP_DB")
        _text(msp, "DB", dx + m.db.x, dy + m.db.y, 0.12, "MEP_DB", TextEntityAlignment.MIDDLE_CENTER)

    # whole-house services plant (OHT, sump, pump, meter, IC, septic, RWH pit)
    for nd in m.nodes:
        msp.add_circle((dx + nd.x, dy + nd.y), 0.25, dxfattribs={"layer": "MEP_NODE"})
        code = NODE_CODE.get(nd.kind, "?")
        _text(msp, code, dx + nd.x, dy + nd.y, 0.12, "MEP_NODE", TextEntityAlignment.MIDDLE_CENTER)
        _text(msp, _ascii(nd.label), dx + nd.x, dy + nd.y - 0.42, 0.1, "MEP_NODE", TextEntityAlignment.MIDDLE_CENTER)

    # circuit schedule (final sub-circuits off the DB with their MCB ratings)
    if m.circuits:
        sched_txt = _ascii(" - ".join(f"{ck.name} {ck.mcb_a}A" for ck in m.circuits))
        _text(msp, "CIRCUITS: " + sched_txt, dx, dy - 0.6, 0.16, "MEP_TEXT")

    _text(msp, "MEP SERVICES (plumbing + electrical)", dx, dy + plan.plot.depth_m + 0.5, 0.3, "MEP_TEXT")


# --------------------------------------------------------------------------- #
# Reflected Ceiling & Lighting Plan (GFC-08)
# --------------------------------------------------------------------------- #

_RCP_LABEL = {"gypsum": "GYPSUM FALSE CEILING", "grid": "GRID / PVC CEILING", "none": "EXPOSED SLAB"}
_RCP_COVE_SQM = 12.0


def _draw_rcp(msp, doc, plan: Plan, floor: Optional[int], dx: float, dy: float, tier: str = "standard"):
    """Reflected Ceiling & Lighting Plan (GFC-08): mirrored left-right per the
    standard RCP convention, room ceiling treatment + real light/fan points.
    Indicative coordination drawing, not engineered."""
    for name, aci in [("RCP_CEILING", 44), ("RCP_COVE", 45), ("RCP_FIXTURE", 41), ("RCP_TEXT", 7)]:
        _ensure(doc, name, aci)
    w_m = plan.plot.width_m

    def mx(x):  # mirror left-right — the reflected-ceiling convention
        return w_m - x

    rooms = [r for r in structural_rooms(plan, floor) if bounds(r.polygon).w >= 0.6 and bounds(r.polygon).h >= 0.6]
    for room in rooms:
        r = bounds(room.polygon)
        t = sched.ceiling_treatment_for(room.type.value, tier)
        rx = mx(r.x + r.w)
        _rect(msp, dx + rx, dy + r.y, r.w, r.h, "RCP_CEILING")
        # DXF has no coloured-fill legend fallback (unlike the PDF/on-screen views),
        # so always keep a label — fall back to the short category name (no drop
        # suffix) rather than let the full text overflow into the next room.
        full_label = _ascii(f"{_RCP_LABEL.get(t.kind, t.kind)} - {t.drop_mm}mm" if t.kind != "none" else _RCP_LABEL["none"])
        short_label = _ascii(_RCP_LABEL.get(t.kind, t.kind))
        label = full_label if len(full_label) * 0.085 <= r.w - 0.1 else short_label
        _text(
            msp, label, dx + rx + r.w / 2, dy + r.y + r.h / 2, 0.13, "RCP_TEXT", TextEntityAlignment.MIDDLE_CENTER,
        )
        if t.kind == "gypsum" and r.w * r.h >= _RCP_COVE_SQM:
            inset = 0.3
            _rect(msp, dx + rx + inset, dy + r.y + inset, max(r.w - inset * 2, 0.1), max(r.h - inset * 2, 0.1), "RCP_COVE")

    m = build_mep_model(plan, floor)
    for p in m.elec:
        if p.kind not in ("light", "fan"):
            continue
        msp.add_circle((dx + mx(p.x), dy + p.y), 0.09, dxfattribs={"layer": "RCP_FIXTURE"})
        _text(msp, "L" if p.kind == "light" else "F", dx + mx(p.x), dy + p.y, 0.09, "RCP_FIXTURE", TextEntityAlignment.MIDDLE_CENTER)

    _text(msp, "REFLECTED CEILING & LIGHTING PLAN (GFC-08) - mirrored per RCP convention", dx, dy + plan.plot.depth_m + 0.5, 0.3, "RCP_TEXT")


# --------------------------------------------------------------------------- #
# Schedules (text blocks)
# --------------------------------------------------------------------------- #


def _draw_general_notes(msp, doc, plan: Plan, dx: float, dy: float):
    _ensure(doc, "GENERAL_NOTES", 7)
    
    bhk = len([r for r in plan.rooms if r.type.value == "Bedroom"])
    narrative = get_design_narrative(plan.variant_id or "vastu", {"width": plan.plot.width_m}, "Composite", bhk, plan.plot.family_persona)
    vastu = check_vastu(plan, get_vastu_rules())
    
    lines = ["GENERAL NOTES"]
    lines.append("")
    lines.append("1. PROJECT INFO:")
    lines.append(f"   Project: {plan.project.name}")
    lines.append(f"   Plot: {plan.plot.width_m}x{plan.plot.depth_m}m ({plan.plot.facing.value})")
    lines.append(f"   BHK: {bhk}")
    lines.append("")
    lines.append("2. DESIGN CONCEPT:")
    lines.append(f"   {narrative['concept_title']}")
    # wrap text simply by splitting, or just rely on MText width wrapping if supported?
    # MText does not auto-wrap unless we set width, so we will just put it as a single line and let CAD users wrap,
    # or manually wrap it loosely.
    import textwrap
    wrapped_concept = textwrap.wrap(narrative['concept_statement'], width=60)
    for line in wrapped_concept:
        lines.append(f"   {line}")
    lines.append("")
    lines.append("3. VASTU SUMMARY:")
    lines.append(f"   Score: {vastu.score}/100 ({vastu.grade})")
    wrapped_vastu = textwrap.wrap(narrative['vastu_approach'], width=60)
    for line in wrapped_vastu:
        lines.append(f"   {line}")
    lines.append("")
    lines.append("4. MATERIAL NOTES:")
    wrapped_mat = textwrap.wrap(narrative['material_palette'], width=60)
    for line in wrapped_mat:
        lines.append(f"   {line}")
    lines.append("")
    lines.append("5. STANDARD DISCLAIMERS:")
    wrapped_disc = textwrap.wrap(DISCLAIMER_EXPORT, width=60)
    for line in wrapped_disc:
        lines.append(f"   {line}")

    body = _ascii("\\P".join(lines))
    mt = msp.add_mtext(body, dxfattribs={"layer": "GENERAL_NOTES", "char_height": 0.22})
    mt.set_location((dx, dy), attachment_point=7)  # 7 = top-left

def _draw_schedules(msp, doc, plan: Plan, code: Optional[CodeReport], dx: float, dy: float):
    _ensure(doc, "SCHEDULE", 7)
    lines = ["DOOR & WINDOW SCHEDULE", "Mark  Type     Size WxH mm    Qty  Frame material"]
    for g in sched.opening_schedule(plan):
        lines.append(
            f"{g.mark:<5} {sched.type_label(g):<8} {sched.to_mm(g.width_m)}x{sched.to_mm(g.height_m):<7} "
            f"{g.qty:<4} {g.frame_material}"
        )
    lines.append("")
    lines.append("AREA STATEMENT")
    if code is not None:
        for r in sched.area_statement(plan, code.metrics):
            lines.append(f"{r['label']:<22} {r['metric']}")
    body = _ascii("\\P".join(lines))
    mt = msp.add_mtext(body, dxfattribs={"layer": "SCHEDULE", "char_height": 0.22})
    mt.set_location((dx, dy), attachment_point=7)  # 7 = top-left


# --------------------------------------------------------------------------- #
# Structural overlay (preliminary RCC grid / columns / footings)
# --------------------------------------------------------------------------- #


def _draw_structural(msp, doc, plan: Plan, structural: "StructuralDesign", dx: float, dy: float):
    """Column-layout sheet: grid lines w/ labels, column + footing rectangles,
    and a footing schedule note block. Preliminary — mirrors the disclaimer."""
    for name, aci in [
        ("STRUCT-GRID", 8), ("STRUCT-COL", 1), ("STRUCT-FOOTING", 30), ("STRUCT-TEXT", 7),
    ]:
        _ensure(doc, name, aci)
    w = plan.plot.width_m
    d = plan.plot.depth_m
    _rect(msp, dx, dy, w, d, "STRUCT-GRID")

    for gl in structural.grid:
        if gl.axis == "x":  # a line of constant x, labelled A, B, C…
            msp.add_lwpolyline(
                _off([(gl.offset_m, -0.8), (gl.offset_m, d + 0.8)], dx, dy),
                dxfattribs={"layer": "STRUCT-GRID"},
            )
            _text(msp, _ascii(gl.label), dx + gl.offset_m, dy + d + 1.1, 0.25,
                  "STRUCT-GRID", TextEntityAlignment.MIDDLE_CENTER)
        else:  # constant y, labelled 1, 2, 3…
            msp.add_lwpolyline(
                _off([(-0.8, gl.offset_m), (w + 0.8, gl.offset_m)], dx, dy),
                dxfattribs={"layer": "STRUCT-GRID"},
            )
            _text(msp, _ascii(gl.label), dx - 1.1, dy + gl.offset_m, 0.25,
                  "STRUCT-GRID", TextEntityAlignment.MIDDLE_CENTER)

    footings = []
    for m in structural.members:
        if m.x_m is None or m.y_m is None:
            continue
        if m.kind == "column":
            b = m.size_mm[0] / 1000.0
            h = m.size_mm[1] / 1000.0
            _rect(msp, dx + m.x_m - b / 2, dy + m.y_m - h / 2, b, h, "STRUCT-COL")
            _text(msp, _ascii(f"{m.id} {m.size_mm[0]}x{m.size_mm[1]}"),
                  dx + m.x_m + b / 2 + 0.1, dy + m.y_m, 0.14, "STRUCT-COL")
        elif m.kind == "footing":
            fl = m.size_mm[0] / 1000.0
            fb = m.size_mm[1] / 1000.0
            _rect(msp, dx + m.x_m - fl / 2, dy + m.y_m - fb / 2, fl, fb, "STRUCT-FOOTING")
            footings.append(m)

    lines = [
        f"STRUCTURAL LAYOUT (PRELIMINARY) - {structural.concrete_grade} / {structural.steel_grade}",
        f"SBC {structural.sbc_kpa:g} kPa ({structural.soil_type})",
        "",
        "FOOTING SCHEDULE",
        "Mark      Size LxB mm   Thk mm  Rebar",
    ]
    for m in footings:
        lines.append(
            f"{m.id:<9} {m.size_mm[0]}x{m.size_mm[1]:<7} {m.thickness_mm or '-':<7} {m.rebar}"
        )
    import textwrap

    lines.append("")
    lines.extend(textwrap.wrap(structural.disclaimer, width=80))
    mt = msp.add_mtext(_ascii("\\P".join(lines)), dxfattribs={"layer": "STRUCT-TEXT", "char_height": 0.2})
    mt.set_location((dx, dy - 1.6), attachment_point=7)  # 7 = top-left, grows down
    _text(msp, "STRUCTURAL COLUMN LAYOUT (PRELIMINARY)", dx, dy + d + 1.9, 0.3, "STRUCT-TEXT")


# --------------------------------------------------------------------------- #
# Masonry & lintel setting-out (GFC-03)
# --------------------------------------------------------------------------- #


def _draw_masonry(
    msp, doc, plan: Plan, floor: Optional[int], dx: float, dy: float,
    structural: "StructuralDesign | None", tier: str = "standard",
):
    """Brickwork & lintel setting-out sheet (GFC-03): derived double-line walls,
    dimensioned, with masonry opening sizes/marks and the lintel level."""
    _ensure(doc, "WALL_EXT", 8)
    _ensure(doc, "WALL_INT", 9)
    _ensure(doc, "WALL_DIM", 5)
    _ensure(doc, "LINTEL_TEXT", 7)
    fp = building_footprint(plan, floor)

    for seg in derive_walls(plan, floor):
        wr = wall_segment_rect(seg)
        layer = "WALL_EXT" if seg.kind == "ext" else "WALL_INT"
        _rect(msp, dx + wr.x, dy + wr.y, wr.w, wr.h, layer)

    ids = {r.id for r in plan.rooms if floor is None or (r.floor or 0) == floor}
    mark_by_width: dict[str, str] = {}
    for g in sched.opening_schedule(plan, tier):
        key = f"{g.kind}|{sched.to_mm(g.width_m)}"
        mark_by_width.setdefault(key, g.mark)

    for op in place_openings(plan):
        if op.room_id not in ids:
            continue
        half = op.length / 2
        if op.edge in ("N", "S"):
            a, b = (op.cx - half, op.cy), (op.cx + half, op.cy)
        else:
            a, b = (op.cx, op.cy - half), (op.cx, op.cy + half)
        msp.add_lwpolyline(_off([a, b], dx, dy), dxfattribs={"layer": "WALL_DIM"})
        width_mm = sched.to_mm(op.length)
        mark = mark_by_width.get(f"{op.kind}|{width_mm}")
        label = f"{mark} {width_mm}" if mark else str(width_mm)
        _text(msp, _ascii(label), dx + op.cx, dy + op.cy + 0.15, 0.12, "WALL_DIM", TextEntityAlignment.MIDDLE_CENTER)

    # dimension chains — exterior perimeter + overall footprint
    msp.add_linear_dim(
        base=(dx + fp.x, dy + fp.y - 0.9), p1=(dx + fp.x, dy + fp.y), p2=(dx + fp.x + fp.w, dy + fp.y),
        dimstyle="EZDXF", override={"dimtxt": 0.22},
    ).render()
    msp.add_linear_dim(
        base=(dx + fp.x - 0.9, dy + fp.y), p1=(dx + fp.x, dy + fp.y), p2=(dx + fp.x, dy + fp.y + fp.h), angle=90,
        dimstyle="EZDXF", override={"dimtxt": 0.22},
    ).render()

    lintel_level = (floor or 0) * LEVELS.FLOOR_TO_FLOOR + LEVELS.LINTEL
    lintel_member = None
    if structural is not None:
        lintel_member = next(
            (m for m in structural.members if m.kind == "lintel" and m.floor == (floor or 0)), None
        ) or next((m for m in structural.members if m.kind == "lintel"), None)
    note = (
        lintel_member.rebar if lintel_member else
        "RCC lintel over every opening, min. 150mm bearing each side, min. 2-10mm dia bottom + 2-8mm dia top bars "
        "(IS 456:2000 Cl.26.5.1) - final sizing per structural design."
    )
    import textwrap

    lines = [
        f"BRICKWORK & LINTEL SETTING-OUT PLAN (GFC-03) - lintel level +{lintel_level:.2f}",
        "Exterior 230mm / Interior 115mm half-brick, derived from the room layout.",
        *textwrap.wrap(note, width=90),
    ]
    mt = msp.add_mtext(_ascii("\\P".join(lines)), dxfattribs={"layer": "LINTEL_TEXT", "char_height": 0.2})
    mt.set_location((dx + fp.x, dy + fp.y - 1.6), attachment_point=7)


# --------------------------------------------------------------------------- #
# Document
# --------------------------------------------------------------------------- #


def build_dxf(
    plan: Plan,
    code: Optional[CodeReport] = None,
    structural: "StructuralDesign | None" = None,
) -> bytes:
    doc = ezdxf.new("R2010", setup=True)
    msp = doc.modelspace()

    w = plan.plot.width_m
    d = plan.plot.depth_m
    floors = floors_of(plan)
    front = front_face(plan)
    multi = len(floors) > 1
    gap = 2.0

    # --- plan(s) at the origin (one block per floor, laid out along +x) ---
    for i, f in enumerate(floors):
        ox = i * (w + gap)
        _draw_plan(msp, doc, plan, f if multi else None, ox, 0.0)
        if multi:
            _ensure(doc, "TITLE", 7)
            _text(msp, sched.floor_name(f).upper(), ox, d + 0.6, 0.35, "TITLE")
    plan_span_x = max(1, len(floors)) * (w + gap)

    # --- plot dimensions on the ground-floor block ---
    msp.add_linear_dim(base=(0, -1.2), p1=(0, 0), p2=(w, 0), dimstyle="EZDXF", override={"dimtxt": 0.25}).render()
    msp.add_linear_dim(base=(-1.2, 0), p1=(0, 0), p2=(0, d), angle=90, dimstyle="EZDXF", override={"dimtxt": 0.25}).render()
    _north_arrow(msp, doc, w + 1.2, d - 1.5)

    # --- title block / disclaimer below the plan ---
    _ensure(doc, "TITLE", 7)
    _text(msp, f"Vastukala AI - {plan.project.name}", 0, -2.4, 0.35, "TITLE")
    _text(msp, DISCLAIMER_EXPORT, 0, -3.1, 0.22, "TITLE")

    # --- elevations, in a row below the plan ---
    elev_ffl = -8.0
    ex = 0.0
    for face in (front, _opposite(front), *_others(front)):
        face_len = building_footprint(plan).w if face in ("N", "S") else building_footprint(plan).h
        _draw_elevation(msp, doc, plan, face, front, ex, elev_ffl)
        ex += face_len + gap

    # --- section, below the elevations ---
    sec_ffl = elev_ffl - (roof_level(plan) + LEVELS.PARAPET + LEVELS.FOOTING + gap + 1.0)
    _draw_section(msp, doc, plan, 0.0, sec_ffl)

    # --- structural column layout, below the section (when designed) ---
    if structural is not None:
        _draw_structural(msp, doc, plan, structural, 0.0, sec_ffl - (LEVELS.FOOTING + gap + 4.0) - d)

    # --- brickwork & lintel setting-out (GFC-03), below the structural block
    #     (or directly below the section when no structural design ran) ---
    masonry_ffl = sec_ffl - (LEVELS.FOOTING + gap + 4.0) - d
    if structural is not None:
        masonry_ffl -= d + 6.0
    for i, f in enumerate(floors):
        mx = i * (w + gap)
        _draw_masonry(msp, doc, plan, f if multi else None, mx, masonry_ffl, structural)
        if multi:
            _text(msp, sched.floor_name(f).upper() + " - SETTING-OUT", mx, masonry_ffl + d + 1.0, 0.3, "LINTEL_TEXT")

    # --- MEP overlay, one block per floor to the right of the plan (previously only
    #     the ground floor's services were exported for a multi-storey house) ---
    mep_x = plan_span_x + 4.0
    for i, f in enumerate(floors):
        fx = mep_x + i * (w + gap)
        _draw_mep(msp, doc, plan, f if multi else None, fx, 0.0)
        if multi:
            _text(msp, f"{sched.floor_name(f).upper()} - MEP", fx, d + 0.6, 0.3, "MEP_TEXT")
    mep_span_x = max(1, len(floors)) * (w + gap)

    # --- reflected ceiling & lighting plan (GFC-08), below the MEP overlay ---
    rcp_ffl = -(d + gap + 3.0)
    for i, f in enumerate(floors):
        fx = mep_x + i * (w + gap)
        _draw_rcp(msp, doc, plan, f if multi else None, fx, rcp_ffl)
        if multi:
            _text(msp, f"{sched.floor_name(f).upper()} - RCP", fx, rcp_ffl + d + 0.6, 0.3, "RCP_TEXT")

    # --- schedules, to the right of the MEP overlay ---
    sched_x = mep_x + mep_span_x + 4.0
    _draw_schedules(msp, doc, plan, code, sched_x, d)
    _draw_general_notes(msp, doc, plan, sched_x, d - 10.0)


    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode(doc.encoding or "utf-8")


def _opposite(face: str) -> str:
    return {"N": "S", "S": "N", "E": "W", "W": "E"}[face]


def _others(front: str) -> list[str]:
    return [f for f in ("N", "E", "S", "W") if f not in (front, _opposite(front))]
