"""POST /boq/generate — Plan (+ city, tier, edits) -> itemized GST'd BOQ."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter

from app.models.base import CamelModel
from app.models.boq import BoqOptions, BoqReport, ExtraLine, LineOverride
from app.models.enums import City, FinishTier
from app.models.plan import Plan
from app.services.boq_service import generate_boq
from app.services.plan_service import normalize
from app.services.rates import get_rates_provider
from app.services.rules import get_boq_rules

router = APIRouter(prefix="/boq", tags=["boq"])


class BoqRequest(CamelModel):
    plan: Plan
    city: Optional[City] = None  # defaults to plan.plot.city
    finish_tier: FinishTier = FinishTier.standard
    options: BoqOptions = BoqOptions()
    overrides: list[LineOverride] = []
    extra_lines: list[ExtraLine] = []


@router.post("/generate", response_model=BoqReport)
def boq_generate(req: BoqRequest) -> BoqReport:
    plan, _ = normalize(req.plan)
    city = req.city or plan.plot.city
    return generate_boq(
        plan=plan,
        city=city,
        finish_tier=req.finish_tier,
        rates=get_rates_provider(),
        rules=get_boq_rules(),
        options=req.options,
        overrides=req.overrides,
        extra_lines=req.extra_lines,
    )
