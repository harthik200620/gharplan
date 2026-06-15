"""POST /plan/generate — v2 generative floor plan (feature-flagged STUB).

Returns the ONE curated template (30x40 East) fitted to the requested plot, with
Vastu + code reports. Any other facing returns 501 "coming soon". The whole
endpoint is gated behind FEATURE_GENERATOR. TODO(human): add templates + hire an
architect to author them.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException

from app import config
from app.generator.scaler import scale_template
from app.generator.templates import template_for_facing
from app.models.base import CamelModel
from app.models.plan import Plan, Plot
from app.models.reports import CodeReport, VastuReport
from app.services.code_service import check_code
from app.services.plan_service import normalize
from app.services.rules import get_code_rules, get_vastu_rules
from app.services.vastu_service import check_vastu

router = APIRouter(prefix="/plan", tags=["generate"])


class GenerateRequest(CamelModel):
    plot: Plot
    brief: Optional[str] = None  # natural-language brief (reserved for v2 LLM helper)


class GenerateResponse(CamelModel):
    template_id: str
    plan: Plan
    vastu: VastuReport
    code: CodeReport
    warnings: list[str]
    note: str


@router.post("/generate", response_model=GenerateResponse)
def plan_generate(req: GenerateRequest) -> GenerateResponse:
    if not config.FEATURE_GENERATOR:
        raise HTTPException(
            status_code=501,
            detail={
                "status": "disabled",
                "message": "The floor-plan generator is behind a feature flag. Set FEATURE_GENERATOR=true to enable.",
            },
        )

    template = template_for_facing(req.plot.facing.value)
    if template is None:
        raise HTTPException(
            status_code=501,
            detail={
                "status": "coming_soon",
                "message": "Only 30x40 East-facing generation is available in v1.",
                "supported": [{"plotType": "30x40", "facing": "E"}],
            },
        )

    plan = scale_template(template, req.plot, get_code_rules())
    plan, warnings = normalize(plan)
    vastu = check_vastu(plan, get_vastu_rules())
    code = check_code(plan, get_code_rules())
    return GenerateResponse(
        template_id=template["id"],
        plan=plan,
        vastu=vastu,
        code=code,
        warnings=warnings,
        note="Generated from a curated template. Review and edit before use. Not an approved drawing.",
    )
