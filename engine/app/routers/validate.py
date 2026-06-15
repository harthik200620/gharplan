"""POST /plan/validate — validate + normalize a Plan to canonical form."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.base import CamelModel
from app.models.plan import Plan
from app.services.plan_service import normalize

router = APIRouter(prefix="/plan", tags=["plan"])


class ValidateResponse(CamelModel):
    plan: Plan
    warnings: list[str]


@router.post("/validate", response_model=ValidateResponse)
def validate_plan(plan: Plan) -> ValidateResponse:
    normalized, warnings = normalize(plan)
    return ValidateResponse(plan=normalized, warnings=warnings)
