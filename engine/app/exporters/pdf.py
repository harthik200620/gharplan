"""Client proposal PDF (reportlab) — a full architect's sheet set.

Cover → floor plan(s) → four elevations → a section → MEP services
(plumbing + electrical + clash list) → working-drawing schedules → Vastu →
code review → BOQ → T&Cs. Every drawing is projected from the canonical Plan
exactly the way the on-screen CAD viewer does (shared geometry in
``app.services.cad_geom`` / ``elevations`` / ``mep_model`` / ``schedules``).
A disclaimer footer is stamped on every page.
"""

from __future__ import annotations

import base64
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Flowable,
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.config import DISCLAIMER_EXPORT
from app.models.boq import BoqReport
from app.models.enums import room_label
from app.models.export import Branding
from app.models.plan import Plan
from app.models.reports import CodeReport, VastuReport
from app.services import schedules as sched
from app.services.cad_geom import (
    LEVELS,
    bounds,
    building_footprint,
    floors_of,
    front_face,
    place_openings,
    room_center,
    structural_rooms,
)
from app.services.elevations import elevation_openings, roof_level, section_model
from app.services.mep_model import SERVICE_STYLE, build_mep_model

ZONE_FILL = {
    "N": colors.HexColor("#E3F2FD"),
    "NE": colors.HexColor("#E0F7FA"),
    "E": colors.HexColor("#E8F5E9"),
    "SE": colors.HexColor("#FFF3E0"),
    "S": colors.HexColor("#FBE9E7"),
    "SW": colors.HexColor("#EFEBE9"),
    "W": colors.HexColor("#F3E5F5"),
    "NW": colors.HexColor("#EDE7F6"),
    "CENTER": colors.HexColor("#FFFDE7"),
}
STATUS_COLOR = {
    "pass": colors.HexColor("#2E7D32"),
    "warn": colors.HexColor("#E69500"),
    "fail": colors.HexColor("#C62828"),
}
BRAND = colors.HexColor("#1F3A5F")

# Drawing palette (paper stock — reads well in print regardless of app theme).
INK = colors.HexColor("#1f2937")
WALL_POCHE = colors.HexColor("#334155")
PLASTER = colors.HexColor("#EFEAE2")
GROUND_INK = colors.HexColor("#6b7280")
SLAB_INK = colors.HexColor("#475569")
GLASS = colors.HexColor("#CFE3EE")
GRID = colors.HexColor("#E0E0E0")

# Electrical point colour key (compact — explained in the legend).
ELEC_COLOR = {
    "light": colors.HexColor("#d97706"),
    "fan": colors.HexColor("#0891b2"),
    "socket6a": colors.HexColor("#475569"),
    "socket16a": colors.HexColor("#1e293b"),
    "ac": colors.HexColor("#2563eb"),
    "exhaust": colors.HexColor("#7c3aed"),
    "geyser": colors.HexColor("#dc2626"),
    "bell": colors.HexColor("#16a34a"),
}
ELEC_LABEL = {
    "light": "Light point",
    "fan": "Fan point",
    "socket6a": "6A socket",
    "socket16a": "16A socket",
    "ac": "AC point",
    "exhaust": "Exhaust",
    "geyser": "Geyser",
    "bell": "Call bell",
}
FIXTURE_CODE = {
    "wc": "WC",
    "basin": "WB",
    "shower": "SH",
    "sink": "KS",
    "floor_drain": "FD",
    "washing_machine": "WM",
}
# Whole-house services plant — short code + symbol colour.
NODE_CODE = {
    "oht": "OHT",
    "sump": "SUMP",
    "pump": "P",
    "meter": "kWh",
    "inspection": "IC",
    "septic": "ST",
    "rainpit": "RWH",
}
NODE_COLOR = {
    "oht": colors.HexColor("#2563eb"),
    "sump": colors.HexColor("#0891b2"),
    "pump": colors.HexColor("#475569"),
    "meter": colors.HexColor("#1e293b"),
    "inspection": colors.HexColor("#7c4a1e"),
    "septic": colors.HexColor("#7c4a1e"),
    "rainpit": colors.HexColor("#7c3aed"),
}


def _inr(x) -> str:
    return f"Rs {float(x):,.2f}"


def _fit(avail_w, avail_h, xmin, ymin, xmax, ymax, frac=0.9):
    """A scale + offset that fits world bbox (xmin..xmax, ymin..ymax) into the
    available box. Map a world point with ``ox + x*s, oy + y*s``."""
    cw = max(xmax - xmin, 1e-6)
    ch = max(ymax - ymin, 1e-6)
    s = min(avail_w / cw, avail_h / ch) * frac
    ox = (avail_w - cw * s) / 2 - xmin * s
    oy = (avail_h - ch * s) / 2 - ymin * s
    return s, ox, oy


def _poly(c, pts, fill=0, stroke=1):
    path = c.beginPath()
    path.moveTo(*pts[0])
    for p in pts[1:]:
        path.lineTo(*p)
    path.close()
    c.drawPath(path, fill=fill, stroke=stroke)


# --------------------------------------------------------------------------- #
# Floor plan
# --------------------------------------------------------------------------- #


class PlanFlowable(Flowable):
    """Draws one floor of the plan to scale, rooms shaded by Vastu zone."""

    def __init__(self, plan: Plan, floor: int | None = None, width: float = 16.5 * cm):
        super().__init__()
        self.plan = plan
        self.floor = floor
        self.avail_w = width
        ar = plan.plot.depth_m / plan.plot.width_m
        self.height = min(width * ar, 15 * cm)

    def wrap(self, *_):
        return (self.avail_w, self.height)

    def draw(self):
        c = self.canv
        plan = self.plan
        w_m, d_m = plan.plot.width_m, plan.plot.depth_m
        s, ox, oy = _fit(self.avail_w, self.height, 0, 0, w_m, d_m, frac=0.92)

        c.setStrokeColor(colors.black)
        c.setLineWidth(1.2)
        c.rect(ox, oy, w_m * s, d_m * s)

        rooms = [r for r in plan.rooms if self.floor is None or (r.floor or 0) == self.floor]
        for room in rooms:
            pts = [(ox + x * s, oy + y * s) for x, y in room.polygon]
            zone = room.zone.value if room.zone else "CENTER"
            c.setFillColor(ZONE_FILL.get(zone, colors.whitesmoke))
            c.setStrokeColor(colors.HexColor("#90A4AE"))
            c.setLineWidth(0.6)
            _poly(c, pts, fill=1, stroke=1)

            cx, cy = room.centroid or (room.area_sqm, 0)
            tx, ty = ox + cx * s, oy + cy * s
            c.setFillColor(colors.HexColor("#212121"))
            c.setFont("Helvetica-Bold", 6.5)
            c.drawCentredString(tx, ty + 1, room_label(room.type.value))
            c.setFont("Helvetica", 5.5)
            c.drawCentredString(tx, ty - 7, f"{round(room.area_sqm, 1)} m2 / {zone}")

        # openings — erase the wall and mark the jambs
        ids = {r.id for r in rooms}
        for op in place_openings(plan):
            if op.room_id not in ids:
                continue
            horiz = op.edge in ("N", "S")
            half = op.length / 2
            if horiz:
                a, b = (op.cx - half, op.cy), (op.cx + half, op.cy)
            else:
                a, b = (op.cx, op.cy - half), (op.cx, op.cy + half)
            pa = (ox + a[0] * s, oy + a[1] * s)
            pb = (ox + b[0] * s, oy + b[1] * s)
            c.setStrokeColor(colors.white)
            c.setLineWidth(2.4)
            c.line(*pa, *pb)
            c.setStrokeColor(colors.HexColor("#90A4AE") if op.kind == "window" else INK)
            c.setLineWidth(0.5 if op.kind == "window" else 0.7)
            c.line(*pa, *pb)

        _north_arrow(c, ox + w_m * s + 6, oy + d_m * s - 18)


def _north_arrow(c, ax, ay):
    c.setStrokeColor(colors.black)
    c.setFillColor(colors.black)
    c.setLineWidth(1)
    c.line(ax, ay, ax, ay + 16)
    p = c.beginPath()
    p.moveTo(ax - 3, ay + 11)
    p.lineTo(ax, ay + 16)
    p.lineTo(ax + 3, ay + 11)
    c.drawPath(p, fill=1, stroke=1)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(ax, ay + 18, "N")


# --------------------------------------------------------------------------- #
# Elevation
# --------------------------------------------------------------------------- #


class ElevationFlowable(Flowable):
    """One cardinal elevation — built mass + floor lines + openings + levels."""

    def __init__(self, plan: Plan, face: str, front: str, width: float = 8 * cm, height: float = 6 * cm):
        super().__init__()
        self.plan = plan
        self.face = face
        self.front = front
        self.avail_w = width
        self.height = height

    def wrap(self, *_):
        return (self.avail_w, self.height)

    def draw(self):
        c = self.canv
        plan = self.plan
        fp = building_footprint(plan)
        horiz = self.face in ("N", "S")
        face_len = fp.w if horiz else fp.h
        roof = roof_level(plan)
        top = roof + LEVELS.PARAPET
        ymin, ymax = LEVELS.GROUND - 0.2, top + 0.2
        # leave a right margin for level tags
        s, ox, oy = _fit(self.avail_w - 26, self.height - 14, 0, ymin, face_len, ymax, frac=0.95)
        oy += 6

        def X(x):
            return ox + x * s

        def PX(x, y):
            return (ox + x * s, oy + y * s)

        # ground line
        c.setStrokeColor(GROUND_INK)
        c.setLineWidth(1.1)
        c.line(X(-0.4), oy + LEVELS.GROUND * s, X(face_len + 0.4), oy + LEVELS.GROUND * s)
        # hatch ground
        c.setLineWidth(0.3)
        gx = -0.4
        while gx < face_len + 0.4:
            c.line(*PX(gx, LEVELS.GROUND), *PX(gx + 0.25, LEVELS.GROUND - 0.18))
            gx += 0.5

        # plinth band
        c.setFillColor(colors.HexColor("#E2DED7"))
        c.setStrokeColor(INK)
        c.setLineWidth(0.6)
        c.rect(X(0), oy + LEVELS.GROUND * s, face_len * s, (0 - LEVELS.GROUND) * s, fill=1, stroke=1)

        # building mass
        c.setFillColor(PLASTER)
        c.setStrokeColor(INK)
        c.setLineWidth(1.0)
        c.rect(X(0), oy + 0 * s, face_len * s, roof * s, fill=1, stroke=1)

        # floor lines
        c.setStrokeColor(colors.HexColor("#C9C2B6"))
        c.setLineWidth(0.5)
        for f in floors_of(plan):
            yf = f * LEVELS.FLOOR_TO_FLOOR
            if yf > 0:
                c.line(X(0), oy + yf * s, X(face_len), oy + yf * s)

        # parapet
        c.setFillColor(colors.HexColor("#E7E2D9"))
        c.setStrokeColor(INK)
        c.setLineWidth(0.8)
        c.rect(X(0), oy + roof * s, face_len * s, LEVELS.PARAPET * s, fill=1, stroke=1)

        # openings
        for op in elevation_openings(plan, self.face, self.front):
            base = op.floor * LEVELS.FLOOR_TO_FLOOR
            x0 = op.u - op.length / 2
            yy0 = base + op.sill
            yy1 = base + op.lintel
            c.setFillColor(GLASS if op.kind == "window" else colors.HexColor("#8d6e63"))
            c.setStrokeColor(INK)
            c.setLineWidth(0.7)
            c.rect(X(x0), oy + yy0 * s, op.length * s, (yy1 - yy0) * s, fill=1, stroke=1)
            # chajja over the head
            c.setStrokeColor(SLAB_INK)
            c.setLineWidth(1.0)
            c.line(X(x0 - 0.15), oy + (yy1 + 0.05) * s, X(x0 + op.length + 0.15), oy + (yy1 + 0.05) * s)
            if op.kind == "window":
                c.setStrokeColor(colors.HexColor("#90a4ae"))
                c.setLineWidth(0.4)
                c.line(X(op.u), oy + yy0 * s, X(op.u), oy + yy1 * s)

        # level tags on the right
        c.setFont("Helvetica", 4.6)
        c.setFillColor(GROUND_INK)
        tagx = X(face_len) + 3
        for level, lbl in [
            (0.0, "FFL +0.000"),
            (roof, f"Roof +{roof:.2f}"),
            (top, "Parapet"),
        ]:
            yy = oy + level * s
            c.setStrokeColor(colors.HexColor("#cbd5e1"))
            c.setLineWidth(0.3)
            c.line(X(face_len), yy, tagx, yy)
            c.drawString(tagx, yy - 1.5, lbl)


# --------------------------------------------------------------------------- #
# Section
# --------------------------------------------------------------------------- #


class SectionFlowable(Flowable):
    """A vertical section through the staircase — foundations to parapet."""

    def __init__(self, plan: Plan, width: float = 16.5 * cm, height: float = 8.5 * cm):
        super().__init__()
        self.plan = plan
        self.avail_w = width
        self.height = height

    def wrap(self, *_):
        return (self.avail_w, self.height)

    def draw(self):
        c = self.canv
        plan = self.plan
        sm = section_model(plan)
        span = sm.span
        roof = roof_level(plan)
        top = roof + LEVELS.PARAPET
        ymin, ymax = -LEVELS.FOOTING - 0.2, top + 0.3
        s, ox, oy = _fit(self.avail_w - 60, self.height - 10, 0, ymin, span, ymax, frac=0.95)
        oy += 5

        def PX(x, y):
            return (ox + x * s, oy + y * s)

        WALL_T = 0.23
        # ground
        c.setStrokeColor(GROUND_INK)
        c.setLineWidth(1.0)
        c.line(*PX(-0.4, LEVELS.GROUND), *PX(span + 0.4, LEVELS.GROUND))

        # foundation strip + plinth under the perimeter walls
        c.setFillColor(colors.HexColor("#9aa0a6"))
        c.setStrokeColor(INK)
        c.setLineWidth(0.5)
        for ex in (0.0, span - WALL_T):
            # footing pad
            c.rect(*PX(ex - 0.25, -LEVELS.FOOTING), (WALL_T + 0.5) * s, (LEVELS.FOOTING + LEVELS.GROUND) * s, fill=1, stroke=1)

        # plinth fill
        c.setFillColor(colors.HexColor("#E2DED7"))
        c.setStrokeColor(INK)
        c.setLineWidth(0.4)
        c.rect(*PX(0, LEVELS.GROUND), span * s, (0 - LEVELS.GROUND) * s, fill=1, stroke=1)

        floors = sm.floors or [0]
        # per-floor slabs + perimeter walls + partitions
        for f in floors:
            base = f * LEVELS.FLOOR_TO_FLOOR
            ceil = base + LEVELS.CEIL
            # perimeter walls (poché)
            c.setFillColor(WALL_POCHE)
            c.setStrokeColor(INK)
            c.setLineWidth(0.4)
            c.rect(*PX(0, base), WALL_T * s, LEVELS.CEIL * s, fill=1, stroke=1)
            c.rect(*PX(span - WALL_T, base), WALL_T * s, LEVELS.CEIL * s, fill=1, stroke=1)
            # partitions between adjacent cut cells on this floor
            cells = [cc for cc in sm.cells if cc.floor == f]
            for cc in cells:
                for ux in (cc.u0, cc.u1):
                    if 0.2 < ux < span - 0.2:
                        c.rect(*PX(ux - WALL_T / 2, base), WALL_T * s, LEVELS.CEIL * s, fill=1, stroke=0)
            # floor slab
            c.setFillColor(SLAB_INK)
            c.rect(*PX(0, base - LEVELS.SLAB_STRUCT), span * s, LEVELS.SLAB_STRUCT * s, fill=1, stroke=0)
            # room labels in the cut
            c.setFillColor(colors.HexColor("#1f2937"))
            c.setFont("Helvetica", 5)
            for cc in cells:
                c.drawCentredString(ox + (cc.u0 + cc.u1) / 2 * s, oy + (base + LEVELS.CEIL / 2) * s, cc.label)

        # roof slab + parapet
        c.setFillColor(SLAB_INK)
        c.rect(*PX(0, roof - LEVELS.SLAB_STRUCT), span * s, LEVELS.SLAB_STRUCT * s, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#E7E2D9"))
        c.setStrokeColor(INK)
        c.setLineWidth(0.5)
        c.rect(*PX(0, roof), WALL_T * s, LEVELS.PARAPET * s, fill=1, stroke=1)
        c.rect(*PX(span - WALL_T, roof), WALL_T * s, LEVELS.PARAPET * s, fill=1, stroke=1)

        # level dimension chain on the left
        c.setFont("Helvetica", 4.8)
        levels = [(LEVELS.GROUND, "GL -0.150"), (0.0, "FFL +0.000")]
        for f in floors:
            base = f * LEVELS.FLOOR_TO_FLOOR
            if f > 0:
                levels.append((base, f"FFL +{base:.2f}"))
            levels.append((base + LEVELS.LINTEL, f"Lintel +{base + LEVELS.LINTEL:.2f}"))
        levels.append((roof, f"Roof +{roof:.2f}"))
        dimx = ox - 4
        c.setStrokeColor(colors.HexColor("#cbd5e1"))
        c.setLineWidth(0.4)
        c.line(dimx, oy + ymin * s, dimx, oy + top * s)
        for lv, lbl in levels:
            yy = oy + lv * s
            c.setStrokeColor(colors.HexColor("#94a3b8"))
            c.line(dimx - 2, yy, dimx + 2, yy)
            c.setFillColor(GROUND_INK)
            c.drawRightString(dimx - 3, yy - 1.5, lbl)


# --------------------------------------------------------------------------- #
# MEP — plumbing & electrical
# --------------------------------------------------------------------------- #


def _plan_base(c, plan, floor, s, ox, oy):
    """Light room-outline base shared by the MEP drawings."""
    w_m, d_m = plan.plot.width_m, plan.plot.depth_m
    c.setStrokeColor(colors.HexColor("#9aa4b6"))
    c.setLineWidth(0.8)
    c.rect(ox, oy, w_m * s, d_m * s)
    c.setStrokeColor(colors.HexColor("#cbd5e1"))
    c.setLineWidth(0.5)
    for room in plan.rooms:
        if floor is not None and (room.floor or 0) != floor:
            continue
        pts = [(ox + x * s, oy + y * s) for x, y in room.polygon]
        _poly(c, pts, fill=0, stroke=1)
        cx, cy = room_center(room)
        c.setFillColor(colors.HexColor("#94a3b8"))
        c.setFont("Helvetica", 4.4)
        c.drawCentredString(ox + cx * s, oy + cy * s, room_label(room.type.value))


class MepFlowable(Flowable):
    def __init__(self, plan: Plan, floor: int | None, layer: str, width: float = 16.5 * cm):
        super().__init__()
        self.plan = plan
        self.floor = floor
        self.layer = layer  # "plumbing" | "electrical"
        self.avail_w = width
        ar = plan.plot.depth_m / plan.plot.width_m
        self.height = min(width * ar, 11 * cm)

    def wrap(self, *_):
        return (self.avail_w, self.height)

    def draw(self):
        c = self.canv
        plan = self.plan
        m = build_mep_model(plan, self.floor)
        w_m, d_m = plan.plot.width_m, plan.plot.depth_m
        s, ox, oy = _fit(self.avail_w, self.height, 0, 0, w_m, d_m, frac=0.92)
        _plan_base(c, plan, self.floor, s, ox, oy)

        def P(x, y):
            return (ox + x * s, oy + y * s)

        if m.shaft:
            sh = m.shaft
            c.setFillColor(colors.HexColor("#fde68a"))
            c.setStrokeColor(INK)
            c.setLineWidth(0.6)
            c.rect(ox + sh.x * s, oy + sh.y * s, sh.w * s, sh.h * s, fill=1, stroke=1)
            c.setFillColor(colors.HexColor("#92400e"))
            c.setFont("Helvetica-Bold", 4)
            c.drawCentredString(ox + (sh.x + sh.w / 2) * s, oy + (sh.y + sh.h / 2) * s - 1.5, "SHAFT")

        if self.layer == "plumbing":
            for run in m.pipes:
                style = SERVICE_STYLE.get(run.service)
                col = colors.HexColor(style.color) if style else INK
                c.setStrokeColor(col)
                c.setLineWidth(max(0.7, run.size_mm / 90))
                if run.service in ("waste", "vent"):
                    c.setDash([2, 1.4])
                else:
                    c.setDash()
                pts = [P(*pt) for pt in run.points]
                for i in range(len(pts) - 1):
                    c.line(*pts[i], *pts[i + 1])
            c.setDash()
            # fixtures
            for fx in m.fixtures:
                px, py = P(fx.x, fx.y)
                c.setFillColor(colors.white)
                c.setStrokeColor(INK)
                c.setLineWidth(0.6)
                c.circle(px, py, 4.4, fill=1, stroke=1)
                c.setFillColor(INK)
                c.setFont("Helvetica-Bold", 4)
                c.drawCentredString(px, py - 1.4, FIXTURE_CODE.get(fx.kind, "?"))
        else:
            # conduits first (under the points)
            c.setStrokeColor(colors.HexColor("#94a3b8"))
            c.setLineWidth(0.5)
            c.setDash([1.5, 1.5])
            for cd in m.conduits:
                pts = [P(*pt) for pt in cd.points]
                for i in range(len(pts) - 1):
                    c.line(*pts[i], *pts[i + 1])
            c.setDash()
            for ep in m.elec:
                if ep.kind in ("db", "switchboard"):
                    continue
                px, py = P(ep.x, ep.y)
                c.setFillColor(ELEC_COLOR.get(ep.kind, colors.HexColor("#475569")))
                c.circle(px, py, 1.7, fill=1, stroke=0)
            for ep in m.elec:
                if ep.kind == "switchboard":
                    px, py = P(ep.x, ep.y)
                    c.setFillColor(colors.white)
                    c.setStrokeColor(INK)
                    c.setLineWidth(0.5)
                    c.rect(px - 2.2, py - 2.2, 4.4, 4.4, fill=1, stroke=1)
            if m.db:
                px, py = P(m.db.x, m.db.y)
                c.setFillColor(colors.HexColor("#1e293b"))
                c.setStrokeColor(INK)
                c.rect(px - 6, py - 4, 12, 8, fill=1, stroke=1)
                c.setFillColor(colors.white)
                c.setFont("Helvetica-Bold", 4.6)
                c.drawCentredString(px, py - 1.6, "DB")

        # whole-house services plant (OHT, sump, pump, meter, IC, septic, RWH pit)
        for nd in m.nodes:
            px, py = P(nd.x, nd.y)
            c.setFillColor(colors.white)
            c.setStrokeColor(NODE_COLOR.get(nd.kind, INK))
            c.setLineWidth(0.7)
            c.circle(px, py, 5.0, fill=1, stroke=1)
            c.setFillColor(NODE_COLOR.get(nd.kind, INK))
            c.setFont("Helvetica-Bold", 3.8)
            c.drawCentredString(px, py - 1.3, NODE_CODE.get(nd.kind, "?"))
            c.setFont("Helvetica", 3.4)
            c.drawCentredString(px, py - 7.2, nd.label)

        # circuit schedule strip on the electrical sub-view
        if self.layer != "plumbing" and m.circuits:
            sched_txt = " · ".join(f"{ck.name} {ck.mcb_a}A" for ck in m.circuits)
            c.setFillColor(colors.HexColor("#475569"))
            c.setFont("Helvetica", 4.6)
            c.drawString(ox, oy - 7, "Circuits: " + sched_txt)


def _mep_legend(plan, floor, styles):
    m = build_mep_model(plan, floor)
    small = styles
    plumb = " · ".join(f"{it.label}" for it in m.legend) or "—"
    elec = ", ".join(sorted({ELEC_LABEL.get(e.kind, e.kind) for e in m.elec if e.kind in ELEC_LABEL}))
    rows = [
        [Paragraph("<b>Plumbing</b>", small), Paragraph(plumb + "  ·  Drains fall 1:40 to a single service shaft; WC soil 100, basin 40, sink 50, shower/FD 75, supply 15–25 mm bore.", small)],
        [Paragraph("<b>Electrical</b>", small), Paragraph((elec or "—") + "  ·  All switchboards loop back to one DB near the entrance.", small)],
    ]
    t = Table(rows, colWidths=[2.4 * cm, 14 * cm])
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 7), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return t


# --------------------------------------------------------------------------- #
# Document
# --------------------------------------------------------------------------- #


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Oblique", 7)
    canvas.setFillColor(colors.HexColor("#9E9E9E"))
    canvas.drawCentredString(A4[0] / 2, 10 * mm, DISCLAIMER_EXPORT)
    canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _decode_logo(data_url: str):
    try:
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]
        return io.BytesIO(base64.b64decode(data_url))
    except Exception:
        return None


def _table(rows, col_widths, header=True, header_bg=BRAND, font=7.5):
    t = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
    style = [
        ("FONTSIZE", (0, 0), (-1, -1), font),
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F9FC")]),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    t.setStyle(TableStyle(style))
    return t


def build_pdf(
    plan: Plan,
    vastu: VastuReport,
    code: CodeReport,
    boq: BoqReport,
    branding: Branding | None = None,
) -> bytes:
    branding = branding or Branding()
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=BRAND, fontSize=22, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=BRAND, spaceBefore=10)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#666666"))
    cap = ParagraphStyle("cap", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#888888"), alignment=TA_CENTER)

    story: list = []
    floors = floors_of(plan)
    front = front_face(plan)

    # --- cover header ---
    if branding.logo_data_url:
        buf = _decode_logo(branding.logo_data_url)
        if buf:
            try:
                story.append(Image(buf, width=3 * cm, height=3 * cm, kind="proportional"))
            except Exception:
                pass
    story.append(Paragraph(branding.studio_name, h1))
    contact = " · ".join(x for x in [branding.address, branding.phone, branding.email, branding.website] if x)
    if contact:
        story.append(Paragraph(contact, small))
    if branding.gstin:
        story.append(Paragraph(f"GSTIN: {branding.gstin}", small))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Design &amp; Cost Proposal", h2))
    meta = [
        ["Project", plan.project.name],
        ["Client", plan.project.client_name or "-"],
        ["Plot", f"{plan.plot.width_m:g} x {plan.plot.depth_m:g} m ({plan.plot.facing.value}-facing), {plan.plot.city.value}"],
        ["Storeys", "G" + (f"+{len(floors) - 1}" if len(floors) > 1 else "")],
        ["Date", datetime.now().strftime("%d %b %Y")],
    ]
    t = Table(meta, colWidths=[3 * cm, 13 * cm])
    t.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, 0), (0, -1), BRAND),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(t)

    # --- floor plan(s) ---
    for f in floors:
        label = sched.floor_name(f) if len(floors) > 1 else "Floor Plan"
        story.append(Paragraph(label, h2))
        story.append(PlanFlowable(plan, floor=f if len(floors) > 1 else None))
        story.append(Spacer(1, 2))
    story.append(Paragraph("Rooms shaded by Vastu zone. Dimensions metres. Openings shown as wall breaks.", cap))

    # --- elevations ---
    story.append(PageBreak())
    story.append(Paragraph("Elevations", h2))
    faces = [("N", "E"), ("S", "W")]
    grid_rows = []
    for a, b in faces:
        grid_rows.append([ElevationFlowable(plan, a, front), ElevationFlowable(plan, b, front)])
    cap_rows = [
        [Paragraph(f"{n} Elevation", cap) for n in ("North", "East")],
        [Paragraph(f"{n} Elevation", cap) for n in ("South", "West")],
    ]
    et = Table(
        [
            [grid_rows[0][0], grid_rows[0][1]],
            [cap_rows[0][0], cap_rows[0][1]],
            [grid_rows[1][0], grid_rows[1][1]],
            [cap_rows[1][0], cap_rows[1][1]],
        ],
        colWidths=[8.2 * cm, 8.2 * cm],
    )
    et.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    story.append(et)
    story.append(Paragraph(f"Projected from the plan; levels per NBC-2016 practice (lintel +2.100, floor-to-floor {LEVELS.FLOOR_TO_FLOOR:.1f} m). {front}-facing front.", cap))

    # --- section ---
    story.append(PageBreak())
    story.append(Paragraph("Section A–A (through staircase)", h2))
    story.append(SectionFlowable(plan))
    story.append(Paragraph("Cut taken through the stair/wet core. Poché = cut walls &amp; slabs; foundation depth indicative.", cap))

    # --- MEP services ---
    story.append(PageBreak())
    story.append(Paragraph("Services — Plumbing", h2))
    story.append(MepFlowable(plan, floors[0] if len(floors) > 1 else None, "plumbing"))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Services — Electrical", h2))
    story.append(MepFlowable(plan, floors[0] if len(floors) > 1 else None, "electrical"))
    story.append(Spacer(1, 4))
    story.append(_mep_legend(plan, floors[0] if len(floors) > 1 else None, small))

    mep = build_mep_model(plan, floors[0] if len(floors) > 1 else None)
    if mep.clashes:
        story.append(Paragraph(f"Coordination clashes ({mep.summary['errors']} errors · {mep.summary['warns']} warnings)", h2))
        crows = [["Severity", "Rule", "Issue"]]
        for cl in mep.clashes:
            crows.append([cl.severity.upper(), cl.rule_id, cl.message])
        ct = _table(crows, [2.2 * cm, 3.4 * cm, 10.9 * cm], header_bg=colors.HexColor("#E69500"))
        cstyle = []
        for i, cl in enumerate(mep.clashes, start=1):
            cstyle.append(("TEXTCOLOR", (0, i), (0, i), STATUS_COLOR["fail"] if cl.severity == "error" else STATUS_COLOR["warn"]))
        ct.setStyle(TableStyle(cstyle))
        story.append(ct)
    else:
        story.append(Paragraph("No MEP coordination clashes detected.", small))

    # --- working-drawing schedules ---
    story.append(PageBreak())
    story.append(Paragraph("Door &amp; Window Schedule", h2))
    ogroups = sched.opening_schedule(plan)
    if ogroups:
        drows = [["Mark", "Type", "Description", "Size W×H (mm)", "Qty"]]
        for g in ogroups:
            drows.append([g.mark, sched.type_label(g), g.description, f"{sched.to_mm(g.width_m)} × {sched.to_mm(g.height_m)}", str(g.qty)])
        story.append(_table(drows, [1.6 * cm, 2.2 * cm, 5.4 * cm, 4.5 * cm, 1.5 * cm]))
        story.append(Paragraph("Sizes are masonry openings (mm). Verify on site before fabrication.", cap))
    else:
        story.append(Paragraph("No openings defined for this plan yet.", small))

    story.append(Paragraph("Finishes Schedule", h2))
    frows = [["Space", "Floor", "Skirting / Dado", "Walls", "Ceiling"]]
    for tp in sched.present_types(plan):
        fin = sched.finish_for(tp)
        frows.append([room_label(tp), fin.floor, fin.dado, fin.walls, fin.ceiling])
    story.append(_table(frows, [3.0 * cm, 3.3 * cm, 4.0 * cm, 3.3 * cm, 3.0 * cm]))

    story.append(Paragraph("Area Statement", h2))
    arows = [["Item", "Metric", "Imperial"]]
    for r in sched.area_statement(plan, code.metrics):
        arows.append([r["label"], r["metric"], r["imperial"]])
    pf = sched.per_floor_built_up(plan)
    if pf:
        for fl, sqm in pf:
            arows.append([f"  {sched.floor_name(fl)} built-up", f"{sqm:.1f} m²", f"{sched.sqft(sqm)} ft²"])
    story.append(_table(arows, [6.0 * cm, 5.3 * cm, 5.3 * cm]))

    # --- Vastu ---
    story.append(PageBreak())
    story.append(Paragraph(f"Vastu Review — Score {vastu.score}/100 ({vastu.grade})", h2))
    story.append(Paragraph(vastu.disclaimer, small))
    vrows = [["Room", "Zone", "Status", "Note"]]
    for r in vastu.rooms + [vastu.brahmasthan]:
        vrows.append([r.room_label, r.zone, r.status.upper(), r.message])
    vt = _table(vrows, [3 * cm, 1.4 * cm, 1.6 * cm, 10.5 * cm])
    vstyle = []
    for i, r in enumerate(vastu.rooms + [vastu.brahmasthan], start=1):
        vstyle.append(("TEXTCOLOR", (2, i), (2, i), STATUS_COLOR.get(r.status, colors.black)))
    vt.setStyle(TableStyle(vstyle))
    story.append(vt)

    # --- Code ---
    story.append(Paragraph(f"Preliminary Code Review — {code.state} ({code.status.upper()})", h2))
    story.append(Paragraph(code.disclaimer, small))
    m = code.metrics
    crows = [
        ["Plot area", f"{m.plot_area_sqm} m2", "Ground coverage", f"{m.ground_coverage_pct}% / {m.max_ground_coverage_pct}%"],
        ["Built-up", f"{m.built_up_sqm} m2", "FAR", f"{m.far_used} / {m.far_allowed}"],
    ]
    ct = Table(crows, colWidths=[3 * cm, 4 * cm, 4 * cm, 5 * cm])
    ct.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    story.append(ct)
    flagged = [c for c in code.checks if c.status != "pass"]
    if flagged:
        frows = [["Check", "Actual", "Required", "Note"]] + [
            [c.label, c.actual or "", c.required or "", c.message] for c in flagged
        ]
        story.append(Spacer(1, 4))
        story.append(_table(frows, [3 * cm, 2.5 * cm, 2.5 * cm, 8 * cm], header_bg=colors.HexColor("#E69500")))
    else:
        story.append(Paragraph("All preliminary checks passed.", small))

    # --- BOQ ---
    story.append(PageBreak())
    story.append(Paragraph(f"Bill of Quantities — {boq.finish_tier.value.title()} finish, {boq.city.value}", h2))
    brows = [["Room", "Description", "Unit", "Qty", "Rate", "Amount", "GST", "Total"]]
    for ln in boq.lines:
        brows.append(
            [
                ln.room_label or "",
                ln.description,
                ln.unit,
                f"{ln.qty:g}",
                _inr(ln.rate),
                _inr(ln.amount),
                _inr(ln.gst_amount),
                _inr(ln.total),
            ]
        )
    bt = Table(
        brows,
        colWidths=[2.4 * cm, 5 * cm, 1 * cm, 1.2 * cm, 2.2 * cm, 2.4 * cm, 2 * cm, 2.4 * cm],
        repeatRows=1,
    )
    bt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 6.8),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ECECEC")),
                ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F9FC")]),
            ]
        )
    )
    story.append(bt)

    s = boq.summary
    trows = [
        ["Subtotal", _inr(s.subtotal)],
        [f"GST (CGST {_inr(s.cgst_total)} + SGST {_inr(s.sgst_total)})", _inr(s.gst_total)],
        ["Grand Total", _inr(s.grand_total)],
    ]
    tt = Table(trows, colWidths=[13 * cm, 3.6 * cm])
    tt.setStyle(
        TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, -1), (-1, -1), BRAND),
                ("LINEABOVE", (0, -1), (-1, -1), 0.6, BRAND),
            ]
        )
    )
    story.append(Spacer(1, 4))
    story.append(tt)
    story.append(Paragraph(boq.disclaimer, small))

    # --- T&Cs ---
    story.append(Paragraph("Terms &amp; Conditions", h2))
    story.append(Paragraph(branding.terms, small))

    doc = SimpleDocTemplate(
        (buf_out := io.BytesIO()),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=18 * mm,
        title=f"GharPlan Proposal — {plan.project.name}",
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf_out.getvalue()
