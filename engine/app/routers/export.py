"""Export endpoints: /export/dxf, /export/xlsx, /export/pdf.

The PDF/XLSX endpoints compute the Vastu, code and BOQ reports server-side from
the supplied plan, so the client only sends the plan (+ city, tier, branding).
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from app.exporters.dxf import build_dxf
from app.exporters.pdf import build_pdf
from app.exporters.xlsx import build_xlsx
from app.models.export import ExportRequest
from app.models.plan import Plan
from app.services.boq_service import generate_boq
from app.services.code_service import check_code
from app.services.plan_service import normalize
from app.services.rates import get_rates_provider
from app.services.rules import get_boq_rules, get_code_rules, get_vastu_rules
from app.services.vastu_service import check_vastu

router = APIRouter(prefix="/export", tags=["export"])


def _slug(name: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in name).strip("_")[:40] or "plan"


def _attach(filename: str) -> dict:
    return {"Content-Disposition": f'attachment; filename="{filename}"'}


@router.post("/dxf")
def export_dxf(plan: Plan) -> Response:
    norm, _ = normalize(plan)
    code = check_code(norm, get_code_rules())
    data = build_dxf(norm, code)
    return Response(
        content=data,
        media_type="image/vnd.dxf",
        headers=_attach(f"{_slug(norm.project.name)}.dxf"),
    )


def _boq_from(req: ExportRequest):
    norm, _ = normalize(req.plan)
    boq = generate_boq(
        norm,
        req.city or norm.plot.city,
        req.finish_tier,
        get_rates_provider(),
        get_boq_rules(),
        options=req.options,
        overrides=req.overrides,
        extra_lines=req.extra_lines,
    )
    return norm, boq


@router.post("/xlsx")
def export_xlsx(req: ExportRequest) -> Response:
    norm, boq = _boq_from(req)
    code = check_code(norm, get_code_rules())
    data = build_xlsx(boq, req.branding, plan=norm, code=code)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=_attach(f"{_slug(norm.project.name)}_boq.xlsx"),
    )


@router.post("/pdf")
def export_pdf(req: ExportRequest) -> Response:
    norm, boq = _boq_from(req)
    vastu = check_vastu(norm, get_vastu_rules())
    code = check_code(norm, get_code_rules())
    data = build_pdf(norm, vastu, code, boq, req.branding)
    return Response(
        content=data,
        media_type="application/pdf",
        headers=_attach(f"{_slug(norm.project.name)}_proposal.pdf"),
    )


@router.get("/checklist")
def export_checklist() -> Response:
    content = """# Architect's Comprehensive Checklist

## PRE-DESIGN CHECKLIST
- [ ] Plot survey and soil test done
- [ ] DTCP/BBMP/local authority approval process understood
- [ ] Registered architect engaged (required by NBC for >100sqm)
- [ ] Structural engineer identified
- [ ] MEP consultants identified
- [ ] Budget finalized and loan pre-approved

## DESIGN STAGE CHECKLIST
- [ ] Concept approved by family
- [ ] Vastu consultant reviewed (if needed)
- [ ] All room sizes confirmed
- [ ] Future expansion planned (additional floor option)
- [ ] Parking count confirmed per bylaw
- [ ] Utility connections checked (water, electricity, sewage)

## PRE-CONSTRUCTION CHECKLIST
- [ ] Working drawings complete
- [ ] Building permit obtained
- [ ] Contractor agreement signed
- [ ] Site supervisor appointed
- [ ] Material samples approved
- [ ] Construction insurance in place
"""
    return Response(
        content=content,
        media_type="text/markdown",
        headers=_attach("architect_checklist.md"),
    )
