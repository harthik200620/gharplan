"""Client proposal PDF (reportlab).

Cover (studio + client + date), a vector plan drawing (rooms shaded by Vastu
zone), the Vastu report (score + table + fixes), the code-review summary, the
full BOQ with totals, and T&Cs. A disclaimer footer is stamped on every page.
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


def _inr(x) -> str:
    return f"Rs {float(x):,.2f}"


class PlanFlowable(Flowable):
    """Draws the plan to scale, rooms shaded by Vastu zone."""

    def __init__(self, plan: Plan, width: float = 16 * cm):
        super().__init__()
        self.plan = plan
        self.avail_w = width
        ar = plan.plot.depth_m / plan.plot.width_m
        self.height = min(width * ar, 18 * cm)

    def wrap(self, *_):
        return (self.avail_w, self.height)

    def draw(self):
        c = self.canv
        w_m, d_m = self.plan.plot.width_m, self.plan.plot.depth_m
        s = min(self.avail_w / w_m, self.height / d_m) * 0.92
        ox = (self.avail_w - w_m * s) / 2
        oy = (self.height - d_m * s) / 2

        c.setStrokeColor(colors.black)
        c.setLineWidth(1.2)
        c.rect(ox, oy, w_m * s, d_m * s)

        for room in self.plan.rooms:
            pts = [(ox + x * s, oy + y * s) for x, y in room.polygon]
            path = c.beginPath()
            path.moveTo(*pts[0])
            for pt in pts[1:]:
                path.lineTo(*pt)
            path.close()
            zone = room.zone.value if room.zone else "CENTER"
            c.setFillColor(ZONE_FILL.get(zone, colors.whitesmoke))
            c.setStrokeColor(colors.HexColor("#90A4AE"))
            c.setLineWidth(0.6)
            c.drawPath(path, fill=1, stroke=1)

            cx, cy = room.centroid or (room.area_sqm, 0)
            tx, ty = ox + cx * s, oy + cy * s
            c.setFillColor(colors.HexColor("#212121"))
            c.setFont("Helvetica-Bold", 6.5)
            c.drawCentredString(tx, ty + 1, room_label(room.type.value))
            c.setFont("Helvetica", 5.5)
            c.drawCentredString(tx, ty - 7, f"{round(room.area_sqm, 1)} m2 / {zone}")

        # north arrow
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        ax, ay = ox + w_m * s + 6, oy + d_m * s - 18
        c.setLineWidth(1)
        c.line(ax, ay, ax, ay + 16)
        p = c.beginPath()
        p.moveTo(ax - 3, ay + 11)
        p.lineTo(ax, ay + 16)
        p.lineTo(ax + 3, ay + 11)
        c.drawPath(p, fill=1, stroke=1)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(ax, ay + 18, "N")


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
    right = ParagraphStyle("right", parent=styles["Normal"], alignment=TA_RIGHT)

    story: list = []

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
        ["Plot", f"{plan.plot.width_m} x {plan.plot.depth_m} m ({plan.plot.facing}-facing), {plan.plot.city}"],
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
    story.append(Spacer(1, 10))

    # --- plan drawing ---
    story.append(Paragraph("Floor Plan", h2))
    story.append(PlanFlowable(plan))
    story.append(Spacer(1, 6))

    # --- Vastu ---
    story.append(Paragraph(f"Vastu Review — Score {vastu.score}/100 ({vastu.grade})", h2))
    story.append(Paragraph(vastu.disclaimer, small))
    vrows = [["Room", "Zone", "Status", "Note"]]
    for r in vastu.rooms + [vastu.brahmasthan]:
        vrows.append([r.room_label, r.zone, r.status.upper(), r.message])
    vt = Table(vrows, colWidths=[3 * cm, 1.4 * cm, 1.6 * cm, 10 * cm], repeatRows=1)
    vstyle = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E0E0E0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
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
        ft = Table(frows, colWidths=[3 * cm, 2.5 * cm, 2.5 * cm, 8 * cm], repeatRows=1)
        ft.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E69500")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E0E0E0")),
                ]
            )
        )
        story.append(Spacer(1, 4))
        story.append(ft)
    else:
        story.append(Paragraph("All preliminary checks passed.", small))

    # --- BOQ ---
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
