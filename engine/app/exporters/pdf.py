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
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # optional structural annexe — no hard runtime dependency
    from app.structural.models import StructuralDesign

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
    FACE_LABEL,
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
    wall_thickness_at,
)
from app.services.elevations import elevation_openings, roof_level, section_model
from app.services.mep_model import SERVICE_STYLE, build_mep_model
from app.services.rules import resolve_jurisdiction

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
WALL_POCHE_INT = colors.HexColor("#64748b")  # lighter — interior 115mm partitions vs 230mm exterior
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
    "earthpit": "EP",
}
NODE_COLOR = {
    "oht": colors.HexColor("#2563eb"),
    "sump": colors.HexColor("#0891b2"),
    "pump": colors.HexColor("#475569"),
    "meter": colors.HexColor("#1e293b"),
    "inspection": colors.HexColor("#7c4a1e"),
    "septic": colors.HexColor("#7c4a1e"),
    "rainpit": colors.HexColor("#7c3aed"),
    "earthpit": colors.HexColor("#16a34a"),
}


def _inr(x) -> str:
    return f"Rs {float(x):,.2f}"


def _esc(s) -> str:
    """Escape dynamic text for reportlab Paragraph mini-XML."""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class _Bookmark(Flowable):
    """Zero-size flowable adding a PDF outline entry at its position. Outline
    titles live in the uncompressed object graph, so key section names stay
    literally findable in the bytes regardless of page-stream compression."""

    def __init__(self, title: str, key: str, level: int = 0):
        super().__init__()
        self.title = title
        self.key = key
        self.level = level
        self.width = self.height = 0

    def wrap(self, *_):
        return (0, 0)

    def draw(self):
        self.canv.bookmarkPage(self.key)
        self.canv.addOutlineEntry(self.title, self.key, level=self.level, closed=False)


def _fit(avail_w, avail_h, xmin, ymin, xmax, ymax, frac=0.9):
    """A scale + offset that fits world bbox (xmin..xmax, ymin..ymax) into the
    available box. Map a world point with ``ox + x*s, oy + y*s``."""
    cw = max(xmax - xmin, 1e-6)
    ch = max(ymax - ymin, 1e-6)
    s = min(avail_w / cw, avail_h / ch) * frac
    ox = (avail_w - cw * s) / 2 - xmin * s
    oy = (avail_h - ch * s) / 2 - ymin * s
    return s, ox, oy


def _fmt_dim(m: float) -> str:
    """metres -> a tidy '3.66 m / 12'0"' dual label."""
    total_in = m * 39.3701
    ft = int(total_in // 12)
    inch = round(total_in - ft * 12)
    if inch == 12:
        ft, inch = ft + 1, 0
    return f"{m:.2f} m / {ft}'{inch}\""


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
        boundary = getattr(plan.plot, "polygon", None)
        if boundary and len(boundary) >= 3:
            # Plot-v2: the TRUE surveyed boundary instead of the bbox rectangle.
            _poly(c, [(ox + float(x) * s, oy + float(y) * s) for x, y in boundary], fill=0, stroke=1)
        else:
            c.rect(ox, oy, w_m * s, d_m * s)

        rooms = [r for r in plan.rooms if self.floor is None or (r.floor or 0) == self.floor]
        for room in rooms:
            pts = [(ox + x * s, oy + y * s) for x, y in room.polygon]
            zone = room.zone.value if room.zone else "CENTER"
            c.setFillColor(ZONE_FILL.get(zone, colors.whitesmoke))
            c.setStrokeColor(colors.HexColor("#90A4AE"))
            c.setLineWidth(0.6)
            _poly(c, pts, fill=1, stroke=1)

        # WALLS — true double-line masonry (230mm exterior / 115mm interior),
        # derived from the room layout, drawn over the fills before labels.
        walls = derive_walls(plan, self.floor)
        for seg in walls:
            wr = wall_segment_rect(seg)
            c.setFillColor(WALL_POCHE if seg.kind == "ext" else WALL_POCHE_INT)
            c.rect(ox + wr.x * s, oy + wr.y * s, wr.w * s, wr.h * s, fill=1, stroke=0)

        for room in rooms:
            cx, cy = room.centroid or (room.area_sqm, 0)
            tx, ty = ox + cx * s, oy + cy * s
            c.setFillColor(colors.HexColor("#212121"))
            c.setFont("Helvetica-Bold", 6.5)
            c.drawCentredString(tx, ty + 1, room_label(room.type.value))
            c.setFont("Helvetica", 5.5)
            zone = room.zone.value if room.zone else "CENTER"
            c.drawCentredString(tx, ty - 7, f"{round(room.area_sqm, 1)} m2 / {zone}")

        # openings — cut a real wall-thickness gap and mark the jambs
        ids = {r.id for r in rooms}
        for op in place_openings(plan):
            if op.room_id not in ids:
                continue
            horiz = op.edge in ("N", "S")
            half = op.length / 2
            wt = wall_thickness_at(walls, op.edge, op.cx, op.cy)
            if horiz:
                erase = (op.cx - half, op.cy - wt / 2, op.length, wt)
                a, b = (op.cx - half, op.cy), (op.cx + half, op.cy)
            else:
                erase = (op.cx - wt / 2, op.cy - half, wt, op.length)
                a, b = (op.cx, op.cy - half), (op.cx, op.cy + half)
            c.setFillColor(colors.white)
            c.rect(ox + erase[0] * s, oy + erase[1] * s, erase[2] * s, erase[3] * s, fill=1, stroke=0)
            pa = (ox + a[0] * s, oy + a[1] * s)
            pb = (ox + b[0] * s, oy + b[1] * s)
            c.setStrokeColor(colors.HexColor("#90A4AE") if op.kind == "window" else INK)
            c.setLineWidth(0.5 if op.kind == "window" else 0.7)
            c.line(*pa, *pb)

        _north_arrow(c, ox + w_m * s + 6, oy + d_m * s - 18)


def _dim_chain(c, x1, y1, x2, y2, label, vertical=False):
    """A dimensioned line with end-ticks and a centred label — same visual
    language as the on-screen CAD viewer's DimLine."""
    tick = 3
    c.setStrokeColor(colors.HexColor("#475569"))
    c.setLineWidth(0.6)
    c.line(x1, y1, x2, y2)
    if vertical:
        c.line(x1 - tick, y1, x1 + tick, y1)
        c.line(x2 - tick, y2, x2 + tick, y2)
    else:
        c.line(x1, y1 - tick, x1, y1 + tick)
        c.line(x2, y2 - tick, x2, y2 + tick)
    c.setFillColor(colors.HexColor("#334155"))
    c.setFont("Helvetica-Bold", 6)
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    if vertical:
        c.saveState()
        c.translate(mx, my)
        c.rotate(90)
        c.drawCentredString(0, 2, label)
        c.restoreState()
    else:
        c.drawCentredString(mx, my + 3, label)


class MasonryPlanFlowable(Flowable):
    """Brickwork & lintel setting-out plan (GFC-03) — derived double-line walls,
    dimensioned, with masonry opening sizes/marks and the lintel level."""

    def __init__(
        self,
        plan: Plan,
        floor: int | None,
        structural: "StructuralDesign | None",
        tier: str = "standard",
        width: float = 16.5 * cm,
    ):
        super().__init__()
        self.plan = plan
        self.floor = floor
        self.structural = structural
        self.tier = tier
        self.avail_w = width
        fp = building_footprint(plan, floor)
        margin = 1.0
        ar = (fp.h + margin * 2) / max(fp.w + margin * 2, 1e-6)
        self.height = min(width * ar, 13 * cm)

    def wrap(self, *_):
        return (self.avail_w, self.height)

    def draw(self):
        c = self.canv
        plan = self.plan
        floor = self.floor
        fp = building_footprint(plan, floor)
        margin = 1.0
        s, ox, oy = _fit(
            self.avail_w - 24, self.height - 24, fp.x - margin, fp.y - margin,
            fp.x + fp.w + margin, fp.y + fp.h + margin, frac=0.94,
        )

        def PX(x, y):
            return (ox + x * s, oy + y * s)

        # optional structural grid overlay
        if self.structural is not None:
            c.setStrokeColor(colors.HexColor("#94a3b8"))
            c.setLineWidth(0.3)
            c.setDash(2, 1.5)
            for gl in self.structural.grid:
                if gl.axis == "x" and fp.x - 0.2 <= gl.offset_m <= fp.x + fp.w + 0.2:
                    c.line(*PX(gl.offset_m, fp.y - 0.6), *PX(gl.offset_m, fp.y + fp.h + 0.6))
                elif gl.axis == "y" and fp.y - 0.2 <= gl.offset_m <= fp.y + fp.h + 0.2:
                    c.line(*PX(fp.x - 0.6, gl.offset_m), *PX(fp.x + fp.w + 0.6, gl.offset_m))
            c.setDash()

        # wall poché — true double-line masonry
        for seg in derive_walls(plan, floor):
            wr = wall_segment_rect(seg)
            c.setFillColor(WALL_POCHE if seg.kind == "ext" else WALL_POCHE_INT)
            c.rect(*PX(wr.x, wr.y), wr.w * s, wr.h * s, fill=1, stroke=0)

        # openings — real gap + masonry size + mark (best-effort lookup)
        walls = derive_walls(plan, floor)
        ids = {r.id for r in plan.rooms if floor is None or (r.floor or 0) == floor}
        mark_by_width: dict[str, str] = {}
        for g in sched.opening_schedule(plan, self.tier):
            key = f"{g.kind}|{sched.to_mm(g.width_m)}"
            mark_by_width.setdefault(key, g.mark)

        c.setFont("Helvetica", 5)
        for op in place_openings(plan):
            if op.room_id not in ids:
                continue
            horiz = op.edge in ("N", "S")
            half = op.length / 2
            wt = wall_thickness_at(walls, op.edge, op.cx, op.cy)
            if horiz:
                erase = (op.cx - half, op.cy - wt / 2, op.length, wt)
                a, b = (op.cx - half, op.cy), (op.cx + half, op.cy)
                out_dx, out_dy = 0, 1 if op.edge == "N" else -1
            else:
                erase = (op.cx - wt / 2, op.cy - half, wt, op.length)
                a, b = (op.cx, op.cy - half), (op.cx, op.cy + half)
                out_dx, out_dy = (1 if op.edge == "E" else -1), 0
            c.setFillColor(colors.white)
            c.rect(*PX(erase[0], erase[1]), erase[2] * s, erase[3] * s, fill=1, stroke=0)
            c.setStrokeColor(colors.HexColor("#1d4ed8") if op.kind == "window" else INK)
            c.setLineWidth(0.5)
            c.line(*PX(*a), *PX(*b))
            width_mm = sched.to_mm(op.length)
            mark = mark_by_width.get(f"{op.kind}|{width_mm}")
            label = f"{mark} · {width_mm}" if mark else str(width_mm)
            lx = op.cx + out_dx * (wt / 2 + 0.3)
            ly = op.cy + out_dy * (wt / 2 + 0.3)
            c.setFillColor(colors.HexColor("#334155"))
            c.drawCentredString(*PX(lx, ly), label)

        # dimension chains — exterior perimeter + overall footprint
        _dim_chain(c, *PX(fp.x, fp.y), *PX(fp.x + fp.w, fp.y), _fmt_dim(fp.w))
        _dim_chain(c, *PX(fp.x - 0.7, fp.y), *PX(fp.x - 0.7, fp.y + fp.h), _fmt_dim(fp.h), vertical=True)

        # legend
        legend_y = oy - 16
        c.setFillColor(WALL_POCHE)
        c.rect(ox, legend_y, 10, 6, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#334155"))
        c.setFont("Helvetica", 6)
        c.drawString(ox + 14, legend_y + 1, "Exterior 230mm")
        c.setFillColor(WALL_POCHE_INT)
        c.rect(ox + 90, legend_y, 10, 6, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#334155"))
        c.drawString(ox + 104, legend_y + 1, "Interior 115mm")


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

        # ground
        c.setStrokeColor(GROUND_INK)
        c.setLineWidth(1.0)
        c.line(*PX(-0.4, LEVELS.GROUND), *PX(span + 0.4, LEVELS.GROUND))

        # foundation strip + plinth under the perimeter walls
        c.setFillColor(colors.HexColor("#9aa0a6"))
        c.setStrokeColor(INK)
        c.setLineWidth(0.5)
        for ex in (0.0, span - WALL_T.EXT):
            # footing pad
            c.rect(*PX(ex - 0.25, -LEVELS.FOOTING), (WALL_T.EXT + 0.5) * s, (LEVELS.FOOTING + LEVELS.GROUND) * s, fill=1, stroke=1)

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
            # perimeter walls (poché) — 230mm exterior
            c.setFillColor(WALL_POCHE)
            c.setStrokeColor(INK)
            c.setLineWidth(0.4)
            c.rect(*PX(0, base), WALL_T.EXT * s, LEVELS.CEIL * s, fill=1, stroke=1)
            c.rect(*PX(span - WALL_T.EXT, base), WALL_T.EXT * s, LEVELS.CEIL * s, fill=1, stroke=1)
            # partitions between adjacent cut cells on this floor — 115mm interior
            cells = [cc for cc in sm.cells if cc.floor == f]
            for cc in cells:
                for ux in (cc.u0, cc.u1):
                    if 0.2 < ux < span - 0.2:
                        c.rect(*PX(ux - WALL_T.INT / 2, base), WALL_T.INT * s, LEVELS.CEIL * s, fill=1, stroke=0)
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
        c.rect(*PX(0, roof), WALL_T.EXT * s, LEVELS.PARAPET * s, fill=1, stroke=1)
        c.rect(*PX(span - WALL_T.EXT, roof), WALL_T.EXT * s, LEVELS.PARAPET * s, fill=1, stroke=1)

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
    boundary = getattr(plan.plot, "polygon", None)
    if boundary and len(boundary) >= 3:
        _poly(c, [(ox + float(x) * s, oy + float(y) * s) for x, y in boundary], fill=0, stroke=1)
    else:
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


_RCP_FILL = {
    "gypsum": colors.HexColor("#FEF3C7"),
    "grid": colors.HexColor("#DBEAFE"),
    "none": colors.HexColor("#F1F5F9"),
}
_RCP_INK = {
    "gypsum": colors.HexColor("#92400E"),
    "grid": colors.HexColor("#1E3A8A"),
    "none": colors.HexColor("#64748B"),
}
_RCP_COVE_SQM = 12.0


class RcpFlowable(Flowable):
    """Reflected Ceiling & Lighting Plan (GFC-08) — mirrored left-right per the
    standard RCP convention, room-by-room ceiling treatment + light/fan points
    from the real MEP model. Indicative coordination drawing, not engineered."""

    def __init__(self, plan: Plan, floor: int | None, tier: str = "standard", width: float = 16.5 * cm):
        super().__init__()
        self.plan = plan
        self.floor = floor
        self.tier = tier
        self.avail_w = width
        ar = plan.plot.depth_m / plan.plot.width_m
        self.height = min(width * ar, 11 * cm)

    def wrap(self, *_):
        return (self.avail_w, self.height)

    def draw(self):
        c = self.canv
        plan = self.plan
        floor = self.floor
        w_m, d_m = plan.plot.width_m, plan.plot.depth_m
        s, ox, oy = _fit(self.avail_w, self.height, 0, 0, w_m, d_m, frac=0.92)

        def mx(x):  # mirror left-right — the reflected-ceiling convention
            return w_m - x

        rooms = [r for r in structural_rooms(plan, floor) if bounds(r.polygon).w >= 0.6 and bounds(r.polygon).h >= 0.6]
        for room in rooms:
            r = bounds(room.polygon)
            t = sched.ceiling_treatment_for(room.type.value, self.tier)
            rx = mx(r.x + r.w)
            fill = _RCP_FILL.get(t.kind, _RCP_FILL["none"])
            ink = _RCP_INK.get(t.kind, _RCP_INK["none"])
            c.setFillColor(fill)
            c.setStrokeColor(colors.HexColor("#94a3b8"))
            c.setLineWidth(0.4)
            c.rect(ox + rx * s, oy + r.y * s, r.w * s, r.h * s, fill=1, stroke=1)
            if t.kind == "gypsum" and r.w * r.h >= _RCP_COVE_SQM:
                inset = 0.3
                c.setStrokeColor(ink)
                c.setLineWidth(0.4)
                c.setDash(2, 1.5)
                c.rect(ox + (rx + inset) * s, oy + (r.y + inset) * s, max(r.w - inset * 2, 0.1) * s, max(r.h - inset * 2, 0.1) * s, fill=0, stroke=1)
                c.setDash()
            # skip the label entirely (rather than let it overflow into the next
            # room) when the room is too narrow to hold it — the fill colour +
            # legend still convey the treatment.
            if c.stringWidth(t.label, "Helvetica-Bold", 5.5) <= r.w * s - 4:
                c.setFillColor(ink)
                c.setFont("Helvetica-Bold", 5.5)
                c.drawCentredString(ox + (rx + r.w / 2) * s, oy + (r.y + r.h / 2) * s + 2, t.label)
                c.setFont("Helvetica", 5)
                detail = f"Drop {t.drop_mm}mm" if t.kind != "none" else "Exposed slab"
                c.drawCentredString(ox + (rx + r.w / 2) * s, oy + (r.y + r.h / 2) * s - 6, detail)

        m = build_mep_model(plan, floor)
        for p in m.elec:
            if p.kind not in ("light", "fan"):
                continue
            px, py = ox + mx(p.x) * s, oy + p.y * s
            c.setFillColor(colors.HexColor("#fbbf24") if p.kind == "light" else colors.HexColor("#38bdf8"))
            c.setStrokeColor(INK)
            c.setLineWidth(0.4)
            c.circle(px, py, 3.2, fill=1, stroke=1)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 4.5)
            c.drawCentredString(px, py - 1.6, "L" if p.kind == "light" else "F")


class SldFlowable(Flowable):
    """A compact distribution-board single-line diagram: incomer (meter) → main
    isolator → busbar → one MCB branch per final sub-circuit (rating + wire + phase)."""

    def __init__(self, plan: Plan, floor: int | None, width: float = 16.5 * cm):
        super().__init__()
        self.circuits = build_mep_model(plan, floor).circuits
        self.avail_w = width
        self.height = 5.4 * cm

    def wrap(self, *_):
        return (self.avail_w, self.height)

    def draw(self):
        c = self.canv
        circs = self.circuits or []
        W, H = self.avail_w, self.height
        bus_y = H - 1.4 * cm
        left = 0.3 * cm
        c.setStrokeColor(INK)
        c.setLineWidth(1.1)
        # energy meter (incomer)
        c.setFillColor(colors.HexColor("#1e293b"))
        c.rect(left, bus_y - 0.35 * cm, 1.2 * cm, 0.7 * cm, fill=1, stroke=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawCentredString(left + 0.6 * cm, bus_y - 0.05 * cm, "kWh")
        # main isolator
        mi = left + 1.7 * cm
        c.setStrokeColor(INK)
        c.line(left + 1.2 * cm, bus_y, mi, bus_y)
        c.setFillColor(colors.white)
        c.rect(mi, bus_y - 0.3 * cm, 1.5 * cm, 0.6 * cm, fill=1, stroke=1)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 6)
        c.drawCentredString(mi + 0.75 * cm, bus_y - 0.08 * cm, "63A DP")
        # busbar
        bus_x0 = mi + 1.5 * cm
        bus_x1 = W - 0.3 * cm
        c.setLineWidth(1.8)
        c.line(bus_x0, bus_y, bus_x1, bus_y)
        c.setLineWidth(1.0)
        # one MCB branch per circuit
        n = max(1, len(circs))
        span = bus_x1 - bus_x0 - 0.4 * cm
        for i, ck in enumerate(circs):
            bx = bus_x0 + 0.3 * cm + span * (i + 0.5) / n
            by = bus_y - 1.6 * cm
            c.setStrokeColor(INK)
            c.line(bx, bus_y, bx, by + 0.3 * cm)
            c.setFillColor(colors.HexColor("#fef3c7"))
            c.rect(bx - 0.5 * cm, by - 0.3 * cm, 1.0 * cm, 0.6 * cm, fill=1, stroke=1)
            c.setFillColor(INK)
            c.setFont("Helvetica-Bold", 6)
            c.drawCentredString(bx, by - 0.08 * cm, f"{ck.mcb_a}A")
            c.setFont("Helvetica", 5)
            c.drawCentredString(bx, by - 0.7 * cm, ck.name[:16])
            c.drawCentredString(bx, by - 1.05 * cm, f"{ck.wire_sqmm:g}mm2 {ck.phase}")


def _load_schedule(plan: Plan, floor: int | None, small):
    """Circuit-by-circuit load schedule + the connected/demand load and the service
    recommendation a DISCOM connection form asks for."""
    m = build_mep_model(plan, floor)
    rows = [["Circuit", "MCB", "Phase", "Wire (mm2)", "Points"]]
    for ck in m.circuits:
        rows.append([ck.name, f"{ck.mcb_a} A", ck.phase, f"{ck.wire_sqmm:g}", str(ck.points)])
    t = _table(rows, [4.8 * cm, 2 * cm, 2 * cm, 2.6 * cm, 2 * cm])
    s = m.summary
    line = Paragraph(
        f"<b>Connected load:</b> {s.get('connectedLoadKw', '?')} kW &nbsp;&nbsp; "
        f"<b>Diversified demand (x{s.get('diversityFactor', 0.6)}):</b> {s.get('demandLoadKw', '?')} kW &nbsp;&nbsp; "
        f"<b>Recommended service:</b> {s.get('recommendedService', '?')}",
        small,
    )
    return t, line


def _fixture_schedule(plan: Plan, floor: int | None):
    """Room-by-room sanitary fixture schedule (WC / basin / sink / shower / FD …)."""
    from collections import Counter as _Counter

    m = build_mep_model(plan, floor)
    grouped = _Counter((f.room_id, f.kind) for f in m.fixtures)
    rows = [["Room", "Fixture", "Qty"]]
    for (rid, kind), cnt in sorted(grouped.items()):
        rows.append([rid, kind, str(cnt)])
    return _table(rows, [7 * cm, 5 * cm, 2 * cm])


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


def _opposite(face: str) -> str:
    return {"N": "S", "S": "N", "E": "W", "W": "E"}[face]


def _others(front: str) -> list[str]:
    return [f for f in ("N", "E", "S", "W") if f not in (front, _opposite(front))]


def build_pdf(
    plan: Plan,
    vastu: VastuReport,
    code: CodeReport,
    boq: BoqReport,
    branding: Branding | None = None,
    structural: "StructuralDesign | None" = None,
) -> bytes:
    from app.services.design_narrative_service import get_design_narrative
    branding = branding or Branding()

    # Governing rules for the municipal title block + submission checklist.
    # TG/AP resolve to a jurisdiction pack (named jurisdiction, regime, doc
    # checklist); KA/legacy keeps the plain state label.
    rules_obj = resolve_jurisdiction(plan.plot.state.value, plan.plot.city.value)
    if hasattr(rules_obj, "regime"):
        jurisdiction_label = (getattr(rules_obj, "raw", {}) or {}).get(
            "jurisdiction", ""
        ) or getattr(rules_obj, "pack_id", plan.plot.state.value)
        regime_label = rules_obj.regime or "—"
    else:
        jurisdiction_label = f"{plan.plot.city.value}, {plan.plot.state.value} (state building bylaws)"
        regime_label = f"{plan.plot.state.value} state bylaws (legacy ruleset)"
    _doc_checklist = getattr(rules_obj, "doc_checklist", None)
    checklist = list(_doc_checklist()) if callable(_doc_checklist) else []
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=BRAND, fontSize=22, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=BRAND, spaceBefore=10)
    h3 = ParagraphStyle("h3", parent=styles["Heading3"], textColor=INK, spaceBefore=6, spaceAfter=4)
    small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#666666"))
    cap = ParagraphStyle("cap", parent=styles["Normal"], fontSize=7, textColor=colors.HexColor("#888888"), alignment=TA_CENTER)
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=10, textColor=INK, spaceAfter=8, leading=14)
    bullet = ParagraphStyle("bullet", parent=styles["Normal"], fontSize=10, textColor=INK, spaceAfter=4, leading=14, leftIndent=15, bulletIndent=5)

    story: list = []
    floors = floors_of(plan)
    front = front_face(plan)
    bhk = len([r for r in plan.rooms if r.type.value == "Bedroom"])

    # 1. COVER PAGE — with the municipal title block + sign-off provision
    story.append(_Bookmark("Municipal Title Block & Sign-off", "cover"))
    story.append(Spacer(1, 1.6 * cm))
    if branding.logo_data_url:
        buf = _decode_logo(branding.logo_data_url)
        if buf:
            try:
                story.append(Image(buf, width=4 * cm, height=4 * cm, kind="proportional"))
            except Exception:
                pass
    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph("Architectural Design Proposal", h1))
    story.append(Paragraph("Preliminary Concept", h2))
    story.append(Spacer(1, 0.9 * cm))

    drawing_set = "Floor plans · Elevations · Section · Masonry setting-out · MEP services · Reflected ceiling plan · Schedules · Vastu · Code review · BOQ"
    if structural is not None:
        drawing_set += " · Structural design basis (preliminary)"
    title_rows = [
        ["Project", plan.project.name],
        ["Client", plan.project.client_name or "—"],
        [
            "Plot",
            f"{plan.plot.width_m:g} × {plan.plot.depth_m:g} m ({plan.plot.area_sqm:g} m²) · "
            f"{plan.plot.city.value}, {plan.plot.state.value}",
        ],
        ["Jurisdiction", jurisdiction_label],
        ["Regime", regime_label],
        ["Drawing set", drawing_set],
        ["Date", plan.project.created_at or datetime.now().strftime("%d %b %Y")],
    ]
    tb = Table(
        [[k, Paragraph(_esc(v), small)] for k, v in title_rows],
        colWidths=[3.2 * cm, 12.8 * cm],
    )
    tb.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.0, BRAND),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, GRID),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), BRAND),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(tb)
    story.append(Spacer(1, 0.5 * cm))

    # Empty sign-off box for the licensed professional (statutory requirement).
    sign = Table(
        [
            [Paragraph(
                "<b>Licensed Professional Sign-off</b> — Required before any statutory submission",
                small,
            )],
            ["Name:"],
            ["COA / PE Reg. No.:"],
            ["Signature & Seal:"],
        ],
        colWidths=[16 * cm],
        rowHeights=[None, 0.9 * cm, 0.9 * cm, 1.7 * cm],
    )
    sign.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 1.0, BRAND),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, GRID),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F1F5FB")),
        ("FONTSIZE", (0, 1), (0, -1), 8.5),
        ("TEXTCOLOR", (0, 1), (0, -1), colors.HexColor("#555555")),
        ("VALIGN", (0, 1), (0, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sign)
    story.append(Spacer(1, 0.7 * cm))
    story.append(Paragraph(branding.studio_name, h2))
    contact = " · ".join(x for x in [branding.address, branding.phone, branding.email, branding.website] if x)
    if contact:
        story.append(Paragraph(contact, body))
    story.append(PageBreak())

    # 2. EXECUTIVE SUMMARY
    story.append(Paragraph("Executive Summary", h1))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph("Plot Details", h3))
    plot_summary = [
        ["Dimensions", f"{plan.plot.width_m:g} x {plan.plot.depth_m:g} m"],
        ["Area", f"{plan.plot.area_sqm:g} sq.m"],
        ["Facing", f"{plan.plot.facing.value}-facing"],
        ["Location", f"{plan.plot.city.value}, {plan.plot.state.value}"],
    ]
    story.append(_table(plot_summary, [5 * cm, 10 * cm], header=False))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph("Project Brief", h3))
    brief_summary = [
        ["Proposed Config", f"{bhk} BHK"],
        ["Number of Floors", "G" + (f"+{len(floors) - 1}" if len(floors) > 1 else "")],
        ["Selected Finish Tier", boq.finish_tier.value.title()],
    ]
    story.append(_table(brief_summary, [5 * cm, 10 * cm], header=False))
    story.append(Spacer(1, 12))
    
    narrative = get_design_narrative(plan.variant_id or "vastu", {"width": plan.plot.width_m}, "Composite", bhk, plan.plot.family_persona)
    story.append(Paragraph("Design Concept Snapshot", h3))
    story.append(Paragraph(f"<b>{narrative['concept_title']}</b> — {narrative['concept_statement']}", body))
    story.append(PageBreak())

    # 3. DESIGN CONCEPT
    story.append(Paragraph("Design Concept", h1))
    story.append(Paragraph(narrative['concept_title'], h2))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph(narrative['concept_statement'], body))
    story.append(Paragraph(f"<b>Inspired by:</b> {narrative['precedent']}", body))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph("Design Highlights", h3))
    for p in narrative['design_principles']:
        story.append(Paragraph(f"• {p}", bullet))
    
    story.append(Spacer(1, 12))
    story.append(Paragraph("Design Philosophy", h3))
    story.append(Paragraph(f"<b>Spatial Organization:</b> {narrative['spatial_organization']}", body))
    story.append(Paragraph(f"<b>Material Palette:</b> {narrative['material_palette']}", body))
    
    # insert plan here so it's not lost
    story.append(Spacer(1, 12))
    story.append(Paragraph("Floor Plan", h3))
    for f in floors:
        story.append(PlanFlowable(plan, floor=f if len(floors) > 1 else None))
        story.append(Spacer(1, 6))
    story.append(PageBreak())

    # 3a. ELEVATIONS & SECTION — the cover page's "Drawing set" line has always
    # claimed these; ElevationFlowable/SectionFlowable were fully built but never
    # appended here, so the PDF silently shipped without them. Wire them in: all
    # four cardinal faces (front first, matching the DXF export's convention),
    # then one section through the staircase.
    story.append(_Bookmark("Elevations", "elevations"))
    story.append(Paragraph("Elevations", h1))
    story.append(Paragraph(f"{FACE_LABEL[front]}-facing front", h2))
    story.append(Spacer(1, 8))
    for face in (front, _opposite(front), *_others(front)):
        story.append(Paragraph(f"{FACE_LABEL[face]} Elevation", h3))
        story.append(ElevationFlowable(plan, face, front))
        story.append(Spacer(1, 8))
    story.append(PageBreak())

    story.append(_Bookmark("Section", "section"))
    story.append(Paragraph("Section", h1))
    story.append(Paragraph("Through the staircase — foundations to parapet", h2))
    story.append(Spacer(1, 8))
    story.append(SectionFlowable(plan))
    story.append(PageBreak())

    # 3a2. BRICKWORK & LINTEL SETTING-OUT PLAN (GFC-03) — derived double-line
    # walls, dimensioned, with masonry opening sizes/marks and lintel level.
    story.append(_Bookmark("Brickwork & Lintel Setting-Out Plan", "masonry"))
    story.append(Paragraph("Brickwork & Lintel Setting-Out Plan", h1))
    story.append(Paragraph("230mm exterior / 115mm interior half-brick, derived from the room layout", h2))
    story.append(Spacer(1, 8))
    for f in floors:
        if len(floors) > 1:
            story.append(Paragraph(f"Floor {f}" if f else "Ground floor", h3))
        story.append(MasonryPlanFlowable(plan, f if len(floors) > 1 else None, structural, boq.finish_tier.value))
        story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Wall centerlines and thicknesses are derived from the room layout for masonry setting-out guidance — "
        "verify against the structural drawing and site conditions before marking the plinth.", small,
    ))
    story.append(PageBreak())

    # 3b. MEP SERVICES — electrical + plumbing coordination sheets. The MepFlowable
    # render code existed but was never appended to the story, so the client PDF
    # shipped no services drawing at all despite advertising "MEP services". Wire it
    # in: an electrical sheet and a plumbing sheet per floor, plus the services legend.
    story.append(Paragraph("MEP Services", h1))
    story.append(Paragraph("Electrical, water-supply & drainage coordination", h2))
    story.append(
        Paragraph(
            "Indicative services coordination — switchboards, distribution board, "
            "lighting and power circuits, water supply and drainage. Not for tendering; "
            "verify with a licensed MEP consultant.",
            small,
        )
    )
    story.append(Spacer(1, 8))
    for f in floors:
        fl = f if len(floors) > 1 else None
        if len(floors) > 1:
            story.append(Paragraph(f"Floor {f}", h3))
        story.append(Paragraph("Electrical layout", h3))
        story.append(MepFlowable(plan, fl, "electrical"))
        story.append(Spacer(1, 6))
        story.append(Paragraph("Plumbing layout", h3))
        story.append(MepFlowable(plan, fl, "plumbing"))
        story.append(Spacer(1, 10))
    _mep_floor = floors[0] if len(floors) > 1 else None
    story.append(Paragraph("Distribution board — single-line diagram", h3))
    story.append(SldFlowable(plan, _mep_floor))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Load schedule", h3))
    _sched_t, _load_line = _load_schedule(plan, _mep_floor, small)
    story.append(_sched_t)
    story.append(Spacer(1, 4))
    story.append(_load_line)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Fixture schedule", h3))
    story.append(_fixture_schedule(plan, _mep_floor))
    story.append(Spacer(1, 8))
    story.append(_mep_legend(plan, _mep_floor, small))
    story.append(PageBreak())

    # 3c. REFLECTED CEILING & LIGHTING PLAN (GFC-08) — indicative coordination
    # drawing from the real MEP light/fan points; mirrored per RCP convention.
    story.append(_Bookmark("Reflected Ceiling & Lighting Plan", "rcp"))
    story.append(Paragraph("Reflected Ceiling & Lighting Plan", h1))
    story.append(Paragraph("Mirrored left-right per RCP convention — compare against the floor plan for orientation", h2))
    story.append(Spacer(1, 8))
    for f in floors:
        if len(floors) > 1:
            story.append(Paragraph(f"Floor {f}" if f else "Ground floor", h3))
        story.append(RcpFlowable(plan, f if len(floors) > 1 else None, boq.finish_tier.value))
        story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Indicative ceiling design for coordination only — false-ceiling drops, cove-lighting extents and fixture "
        "layout are typical assumptions, NOT an engineered interior design. Confirm drop heights against actual "
        "beam depths, duct/AC routing and site services before execution.", small,
    ))
    story.append(PageBreak())

    # 4. VASTU ANALYSIS
    story.append(Paragraph("Vastu Analysis", h1))
    story.append(Paragraph(f"Overall Score: {vastu.score}/100 — Grade: {vastu.grade}", h2))
    story.append(Paragraph(vastu.disclaimer, small))
    story.append(Spacer(1, 12))
    
    story.append(Paragraph(narrative['vastu_approach'], body))
    story.append(Spacer(1, 12))
    
    vrows = [["Room", "Zone", "Status", "Note"]]
    for r in vastu.rooms + [vastu.brahmasthan]:
        vrows.append([r.room_label, r.zone, r.status.upper(), r.message])
    vt = _table(vrows, [3 * cm, 1.4 * cm, 1.6 * cm, 10.5 * cm])
    vstyle = []
    for i, r in enumerate(vastu.rooms + [vastu.brahmasthan], start=1):
        vstyle.append(("TEXTCOLOR", (2, i), (2, i), STATUS_COLOR.get(r.status, colors.black)))
    vt.setStyle(TableStyle(vstyle))
    story.append(vt)
    story.append(PageBreak())

    # 5. CODE COMPLIANCE
    story.append(Paragraph("Code Compliance", h1))
    story.append(Paragraph(f"Review against {code.state} Bylaws", h2))
    story.append(Paragraph(code.disclaimer, small))
    story.append(Spacer(1, 12))
    
    m = code.metrics
    crows = [
        ["Plot area", f"{m.plot_area_sqm} m2", "Ground coverage", f"{m.ground_coverage_pct}% / {m.max_ground_coverage_pct}%"],
        ["Built-up", f"{m.built_up_sqm} m2", "FAR", f"{m.far_used} / {m.far_allowed}"],
    ]
    ct = Table(crows, colWidths=[3 * cm, 4 * cm, 4 * cm, 5 * cm])
    ct.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(ct)
    story.append(Spacer(1, 12))
    
    flagged = [c for c in code.checks if c.status != "pass"]
    all_checks = [c for c in code.checks]
    frows = [["Check", "Actual", "Required", "Status", "Note"]]
    for c in all_checks:
        frows.append([c.label, c.actual or "", c.required or "", c.status.upper(), c.message])
    ft = _table(frows, [3 * cm, 2.5 * cm, 2.5 * cm, 1.5 * cm, 6.5 * cm])
    fstyle = []
    for i, c in enumerate(all_checks, start=1):
        fstyle.append(("TEXTCOLOR", (3, i), (3, i), STATUS_COLOR.get(c.status, colors.black)))
    ft.setStyle(TableStyle(fstyle))
    story.append(ft)
    story.append(Spacer(1, 12))
    story.append(Paragraph("Compliance Summary: " + ("Issues found, redesign recommended." if flagged else "All preliminary checks passed."), body))
    story.append(PageBreak())

    # 5b. STRUCTURAL DESIGN BASIS (preliminary, when the RCC sizer ran)
    if structural is not None:
        story.append(_Bookmark("Structural Design Basis", "structural"))
        story.append(Paragraph("Structural Design Basis (Preliminary)", h1))
        seismic_zone = (structural.seismic or {}).get("zone", "—")
        story.append(Paragraph(
            f"{structural.concrete_grade} concrete · {structural.steel_grade} steel · "
            f"SBC {structural.sbc_kpa:g} kPa ({_esc(structural.soil_type)}) · Seismic zone {_esc(seismic_zone)}",
            h2,
        ))
        story.append(Spacer(1, 8))

        kind_order = {"column": 0, "footing": 1, "plinth_beam": 2, "beam": 3, "slab": 4, "lintel": 5}
        members = sorted(structural.members, key=lambda mm: (kind_order.get(mm.kind, 9), mm.id))
        max_rows = 25
        mrows = [["Member", "Kind", "Size (mm)", "Rebar", "Util."]]
        for mem in members[:max_rows]:
            size = f"{mem.size_mm[0]}×{mem.size_mm[1]}" + (f" / {mem.thickness_mm} thk" if mem.thickness_mm else "")
            mrows.append([
                mem.id,
                mem.kind.replace("_", " "),
                size,
                Paragraph(_esc(mem.rebar), small),
                f"{mem.utilization:.2f}",
            ])
        story.append(_table(mrows, [2.2 * cm, 2.2 * cm, 3.2 * cm, 7.4 * cm, 1.4 * cm]))
        if len(members) > max_rows:
            story.append(Spacer(1, 4))
            story.append(Paragraph(
                f"… and {len(members) - max_rows} more members — see the structural module output for the full set.",
                small,
            ))
        story.append(Spacer(1, 10))

        for sec in structural.design_basis:
            story.append(Paragraph(_esc(sec.title), h3))
            story.append(Paragraph(_esc(sec.body), body))
            if sec.clause_refs:
                story.append(Paragraph("Refs: " + _esc(", ".join(sec.clause_refs)), small))
        story.append(Spacer(1, 10))
        story.append(Paragraph(_esc(structural.disclaimer), small))
        story.append(PageBreak())

    # 5b2. DOOR & WINDOW / JOINERY SCHEDULE (GFC-07) — real per-plan opening data,
    # grouped into marks; enrichment (frame material/hardware/glazing) by finish tier.
    joinery = sched.opening_schedule(plan, boq.finish_tier.value)
    if joinery:
        story.append(_Bookmark("Door & Window Joinery Schedule", "joinery"))
        story.append(Paragraph("Door & Window Joinery Schedule", h1))
        story.append(Paragraph(f"{boq.finish_tier.value.title()} finish specification", h2))
        story.append(Spacer(1, 8))
        jrows = [["Mark", "Size (mm)", "Type", "Frame material", "Glazing / panel", "Hardware", "Qty"]]
        for g in joinery:
            glazing = g.glazing
            spec = " · ".join(x for x in (g.u_value, g.shgc and f"SHGC {g.shgc}") if x)
            if spec:
                glazing = f"{glazing}, {spec}" if glazing else spec
            jrows.append([
                g.mark,
                f"{sched.to_mm(g.width_m)}×{sched.to_mm(g.height_m)}",
                Paragraph(_esc(f"{sched.type_label(g)} · {g.description}"), small),
                Paragraph(_esc(g.frame_material), small),
                Paragraph(_esc(glazing), small),
                Paragraph(_esc(g.hardware), small),
                str(g.qty),
            ])
        story.append(_table(jrows, [1.4 * cm, 2.2 * cm, 3.4 * cm, 3.0 * cm, 3.4 * cm, 3.4 * cm, 1.0 * cm]))
        story.append(Spacer(1, 6))
        story.append(Paragraph("Sizes are masonry openings (mm). Verify on site before fabrication.", small))
        story.append(PageBreak())

    # 5c. SUBMISSION DOCUMENT CHECKLIST (jurisdiction packs only — KA legacy has none)
    if checklist:
        story.append(_Bookmark("Submission Document Checklist", "checklist"))
        story.append(Paragraph("Submission Document Checklist", h1))
        story.append(Paragraph(f"Per {_esc(jurisdiction_label)}", h2))
        story.append(Paragraph(
            "Verify the current list with the sanctioning authority before filing.", small,
        ))
        story.append(Spacer(1, 10))
        for item in checklist:
            story.append(Paragraph(f"[  ]  {_esc(item)}", bullet))
        story.append(PageBreak())

    # 6. COST ESTIMATE
    story.append(Paragraph("Cost Estimate", h1))
    story.append(Paragraph(f"Preliminary Estimate — {boq.finish_tier.value.title()} finish, {boq.city.value}", h2))
    story.append(Paragraph("Note: This is a preliminary estimate. Get contractor quotes before budgeting.", h3))
    story.append(Spacer(1, 12))
    
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
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                ("TEXTCOLOR", (0, -1), (-1, -1), BRAND),
                ("LINEABOVE", (0, -1), (-1, -1), 0.6, BRAND),
            ]
        )
    )
    story.append(tt)
    
    if plan.plot.area_sqm > 0 and m.built_up_sqm > 0:
        # grand_total is Decimal; built-up sqft is float — divide in float for this display-only rate.
        rate_per_sqft = float(s.grand_total) / (m.built_up_sqm * 10.764)
        story.append(Paragraph(f"Approximate Per Sq Ft Rate: {_inr(rate_per_sqft)}/sqft built-up", body))
    story.append(Spacer(1, 12))
    
    # Trade-wise summary instead of massive line-items for brevity in proposal
    story.append(Paragraph("Trade-wise Breakdown", h3))
    trades = {}
    for ln in boq.lines:
        cat = getattr(ln, 'category', 'General')
        trades[cat] = trades.get(cat, 0) + ln.total
        
    trade_rows = [["Category", "Amount"]]
    for cat, amt in trades.items():
        trade_rows.append([cat, _inr(amt)])
        
    story.append(_table(trade_rows, [10 * cm, 6 * cm]))
    
    story.append(Spacer(1, 12))
    story.append(Paragraph(boq.disclaimer, small))
    story.append(PageBreak())

    # 7. WHAT'S NEXT
    story.append(Paragraph("What's Next", h1))
    story.append(Paragraph("Recommended Next Steps", h2))
    story.append(Spacer(1, 12))
    
    steps = [
        "Engage a registered architect for detailed working drawings and finishes.",
        "Commission a structural engineer to design the foundations and framework.",
        "Submit drawings to BMRDA/DTCP/local authority for building permit approval.",
        "Shortlist local contractors and obtain at least 3 competitive quotes.",
        "Start construction with proper site supervision and quality checks."
    ]
    
    for i, step in enumerate(steps, start=1):
        story.append(Paragraph(f"<b>{i}.</b> {step}", body))
        story.append(Spacer(1, 6))
        
    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Disclaimer", h3))
    story.append(Paragraph("This is an AI-generated architectural concept and feasibility report. It is NOT meant for construction. You must engage qualified professionals (Architect, Structural Engineer) to verify the design, structural safety, and local code compliance before breaking ground.", body))
    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Terms &amp; Conditions", h3))
    story.append(Paragraph(branding.terms, small))

    keywords = [
        "Vastukala AI", "Municipal Title Block", "Licensed Professional Sign-off",
        "Elevations", "Section", "Brickwork & Lintel Setting-Out Plan", "Reflected Ceiling & Lighting Plan",
    ]
    if structural is not None:
        keywords.append("Structural Design Basis")
    if joinery:
        keywords.append("Door & Window Joinery Schedule")
    if checklist:
        keywords.append("Submission Document Checklist")
    doc = SimpleDocTemplate(
        (buf_out := io.BytesIO()),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=18 * mm,
        title=f"Vastukala AI Proposal — {plan.project.name}",
        author="Vastukala AI",
        subject="Preliminary architectural proposal — not for construction",
        keywords=", ".join(keywords),
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf_out.getvalue()
