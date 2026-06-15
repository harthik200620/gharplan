"""POST /code/check — Plan -> preliminary building-code / bylaw report."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.plan import Plan
from app.models.reports import CodeReport
from app.services.code_service import check_code
from app.services.plan_service import normalize
from app.services.rules import get_code_rules

router = APIRouter(prefix="/code", tags=["code"])


@router.post("/check", response_model=CodeReport)
def code_check(plan: Plan) -> CodeReport:
    normalized, _ = normalize(plan)
    return check_code(normalized, get_code_rules())
