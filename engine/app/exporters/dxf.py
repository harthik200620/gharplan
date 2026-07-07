"""DXF export (ezdxf, R2010) — a multi-view CAD sheet in model space.

The plot + room plan (per floor) sits at the origin; four elevations, a section
through the staircase, an MEP services overlay (plumbing + electrical), and the
working-drawing schedules are laid out around it on named layers, all to scale in
metres. Every view is projected from the canonical Plan with the same shared
geometry the on-screen viewer and the PDF use.
"""

from __future__ import annotations

import io
from typing import Optional

import ezdxf
from ezdxf.enums import TextEntityAlignment

from app.config import DISCLAIMER_EXPORT
from app.models.enums import room_label
from app.models.plan import Plan
from app.models.reports import CodeReport
from app.services import schedules as sched
from app.services.cad_geom import (
    LEVELS,
    bounds,
    building_footprint,
    floors_of,
    front_face,
    place_openings,
    room_center,
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
    wall_t = 0.23

    # ground line
    msp.add_lwpolyline(
        [(dx - 0.4, dy + LEVELS.GROUND), (dx + span + 0.4, dy + LEVELS.GROUND)],
        dxfattribs={"layer": "SECTION"},
    )
    # footing pads + plinth
    for ex in (0.0, span - wall_t):
        _rect(msp, dx + ex - 0.25, dy - LEVELS.FOOTING, wall_t + 0.5, LEVELS.FOOTING + LEVELS.GROUND, "SECTION_POCHE")
    _rect(msp, dx, dy + LEVELS.GROUND, span, -LEVELS.GROUND, "SECTION")

    floors = sm.floors or [0]
    for f in floors:
        base = f * LEVELS.FLOOR_TO_FLOOR
        # perimeter walls
        _rect(msp, dx, dy + base, wall_t, LEVELS.CEIL, "SECTION_POCHE")
        _rect(msp, dx + span - wall_t, dy + base, wall_t, LEVELS.CEIL, "SECTION_POCHE")
        # partitions + labels
        cells = [cc for cc in sm.cells if cc.floor == f]
        for cc in cells:
            for ux in (cc.u0, cc.u1):
                if 0.2 < ux < span - 0.2:
                    _rect(msp, dx + ux - wall_t / 2, dy + base, wall_t, LEVELS.CEIL, "SECTION_POCHE")
            _text(
                msp, cc.label, dx + (cc.u0 + cc.u1) / 2, dy + base + LEVELS.CEIL / 2, 0.2,
                "SECTION_TEXT", TextEntityAlignment.MIDDLE_CENTER,
            )
        # floor slab
        _rect(msp, dx, dy + base - LEVELS.SLAB_STRUCT, span, LEVELS.SLAB_STRUCT, "SECTION")
    # roof slab + parapet
    _rect(msp, dx, dy + roof - LEVELS.SLAB_STRUCT, span, LEVELS.SLAB_STRUCT, "SECTION")
    _rect(msp, dx, dy + roof, wall_t, LEVELS.PARAPET, "SECTION_POCHE")
    _rect(msp, dx + span - wall_t, dy + roof, wall_t, LEVELS.PARAPET, "SECTION_POCHE")
    _text(msp, "SECTION A-A (through staircase)", dx, dy - LEVELS.FOOTING - 0.6, 0.3, "SECTION_TEXT")


# --------------------------------------------------------------------------- #
# MEP overlay
# --------------------------------------------------------------------------- #


def _draw_mep(msp, doc, plan: Plan, floor: Optional[int], dx: float, dy: float):
    _draw_plan(msp, doc, plan, floor, dx, dy, mep_base=True)
    m = build_mep_model(plan, floor)
    for name, aci in [
        ("MEP_SHAFT", 2), ("MEP_FIXTURE", 7), ("MEP_ELEC", 2), ("MEP_DB", 1),
        ("MEP_CONDUIT", 8), ("MEP_NODE", 30), ("MEP_TEXT", 7),
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

    for cd in m.conduits:
        msp.add_lwpolyline(_off(cd.points, dx, dy), dxfattribs={"layer": "MEP_CONDUIT"})
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
    lines = ["DOOR & WINDOW SCHEDULE", "Mark  Type     Size WxH mm    Qty"]
    for g in sched.opening_schedule(plan):
        lines.append(
            f"{g.mark:<5} {sched.type_label(g):<8} {sched.to_mm(g.width_m)}x{sched.to_mm(g.height_m):<7} {g.qty}"
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
# Document
# --------------------------------------------------------------------------- #


def build_dxf(plan: Plan, code: Optional[CodeReport] = None) -> bytes:
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

    # --- MEP overlay, to the right of the plan ---
    mep_x = plan_span_x + 4.0
    _draw_mep(msp, doc, plan, floors[0] if multi else None, mep_x, 0.0)

    # --- schedules, to the right of the MEP overlay ---
    _draw_schedules(msp, doc, plan, code, mep_x + w + 4.0, d)
    _draw_general_notes(msp, doc, plan, mep_x + w + 4.0, d - 10.0)


    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode(doc.encoding or "utf-8")


def _opposite(face: str) -> str:
    return {"N": "S", "S": "N", "E": "W", "W": "E"}[face]


def _others(front: str) -> list[str]:
    return [f for f in ("N", "E", "S", "W") if f not in (front, _opposite(front))]
