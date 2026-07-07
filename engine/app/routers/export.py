"""Export endpoints: /export/dxf, /export/xlsx, /export/pdf, /export/ifc.

The PDF/XLSX endpoints compute the Vastu, code and BOQ reports server-side from
the supplied plan, so the client only sends the plan (+ city, tier, branding).
DXF/PDF/IFC also compute the preliminary structural design server-side (best
effort — export still succeeds when the structural module declines the plan).
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import Response

from app.exporters.dxf import build_dxf
from app.exporters.ifc import build_ifc
from app.exporters.pdf import build_pdf
from app.exporters.xlsx import build_xlsx
from app.models.export import ExportRequest
from app.models.plan import Plan
from app.services.boq_service import generate_boq
from app.services.code_service import check_code
from app.services.plan_service import normalize
from app.services.rates import get_rates_provider
from app.services.rules import get_boq_rules, get_vastu_rules, resolve_jurisdiction
from app.services.vastu_service import check_vastu
from app.structural import design_structure

router = APIRouter(prefix="/export", tags=["export"])


def _rules_for(norm: Plan):
    return resolve_jurisdiction(norm.plot.state.value, norm.plot.city.value)


def _structural_or_none(norm: Plan):
    """Preliminary RCC design, or None when the plan defeats the sizer."""
    try:
        return design_structure(norm)
    except Exception:
        return None


def _slug(name: str) -> str:
    return "".join(ch if ch.isalnum() else "_" for ch in name).strip("_")[:40] or "plan"


def _attach(filename: str) -> dict:
    return {"Content-Disposition": f'attachment; filename="{filename}"'}


@router.post("/dxf")
def export_dxf(plan: Plan) -> Response:
    norm, _ = normalize(plan)
    code = check_code(norm, _rules_for(norm))
    data = build_dxf(norm, code, structural=_structural_or_none(norm))
    return Response(
        content=data,
        media_type="image/vnd.dxf",
        headers=_attach(f"{_slug(norm.project.name)}.dxf"),
    )


@router.post("/ifc")
def export_ifc(plan: Plan) -> Response:
    norm, _ = normalize(plan)
    data = build_ifc(norm, _structural_or_none(norm))
    return Response(
        content=data,
        media_type="application/x-step",
        headers=_attach(f"{_slug(norm.project.name)}.ifc"),
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
    code = check_code(norm, _rules_for(norm))
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
    code = check_code(norm, _rules_for(norm))
    data = build_pdf(norm, vastu, code, boq, req.branding, structural=_structural_or_none(norm))
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

## Critical Site Supervision Checklist (Indian Context)
- [ ] Watch out for plumbers core-cutting through primary RCC beams.
- [ ] Ensure bar-benders do not alter column steel spacing for convenience.
- [ ] Mandate proper tarpaulin storage for cement bags during monsoon to prevent curing.
- [ ] Verify local mandi material delivery schedules before demolition.
"""
    return Response(
        content=content,
        media_type="text/markdown",
        headers=_attach("architect_checklist.md"),
    )
