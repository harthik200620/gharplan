"""XLSX export of the BOQ (openpyxl)."""

from __future__ import annotations

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app.models.boq import BoqReport
from app.models.export import Branding

_HEADERS = [
    ("Room", 22),
    ("Trade", 16),
    ("Item Code", 12),
    ("Description", 38),
    ("Unit", 7),
    ("Qty", 10),
    ("Material", 11),
    ("Labour", 11),
    ("Rate", 11),
    ("Amount", 13),
    ("HSN", 9),
    ("GST%", 7),
    ("GST Amt", 12),
    ("Total", 14),
]

_HEAD_FILL = PatternFill("solid", fgColor="1F3A5F")
_HEAD_FONT = Font(bold=True, color="FFFFFF")
_BOLD = Font(bold=True)
_MONEY = "#,##0.00"
_THIN = Side(style="thin", color="D0D0D0")
_BORDER = Border(left=_THIN, right=_THIN, top=_THIN, bottom=_THIN)


def build_xlsx(report: BoqReport, branding: Branding | None = None) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "BOQ"

    row = 1
    studio = branding.studio_name if branding else "GharPlan"
    ws.cell(row, 1, studio).font = Font(bold=True, size=14)
    row += 1
    ws.cell(row, 1, f"Bill of Quantities — {report.city.value} — {report.finish_tier.value.title()} finish")
    row += 2

    header_row = row
    for col, (name, width) in enumerate(_HEADERS, start=1):
        c = ws.cell(header_row, col, name)
        c.fill = _HEAD_FILL
        c.font = _HEAD_FONT
        c.alignment = Alignment(horizontal="center")
        ws.column_dimensions[get_column_letter(col)].width = width
    row += 1

    for ln in report.lines:
        values = [
            ln.room_label or "",
            ln.trade,
            ln.item_code,
            ln.description,
            ln.unit,
            ln.qty,
            float(ln.material_rate),
            float(ln.labour_rate),
            float(ln.rate),
            float(ln.amount),
            ln.hsn_code,
            float(ln.gst_percent),
            float(ln.gst_amount),
            float(ln.total),
        ]
        for col, v in enumerate(values, start=1):
            c = ws.cell(row, col, v)
            c.border = _BORDER
            if col in (6, 7, 8, 9, 10, 13, 14):
                c.number_format = _MONEY
        row += 1

    # totals block
    row += 1
    s = report.summary
    for label, value in [
        ("Subtotal", float(s.subtotal)),
        ("CGST", float(s.cgst_total)),
        ("SGST", float(s.sgst_total)),
        ("Total GST", float(s.gst_total)),
        ("Grand Total", float(s.grand_total)),
    ]:
        ws.cell(row, 13, label).font = _BOLD
        c = ws.cell(row, 14, value)
        c.font = _BOLD
        c.number_format = _MONEY
        row += 1

    ws.cell(row + 1, 1, report.disclaimer).font = Font(italic=True, size=8, color="888888")

    bio = io.BytesIO()
    wb.save(bio)
    return bio.getvalue()
