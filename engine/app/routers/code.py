"""POST /code/check — Plan -> preliminary building-code / bylaw report."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.plan import Plan
from app.models.reports import CodeReport
from app.services.code_service import check_code
from app.services.plan_service import normalize
from app.services.rules import resolve_jurisdiction

router = APIRouter(prefix="/code", tags=["code"])


@router.post("/check", response_model=CodeReport)
def code_check(plan: Plan) -> CodeReport:
    normalized, _ = normalize(plan)
    rules = resolve_jurisdiction(normalized.plot.state.value, normalized.plot.city.value)
    return check_code(normalized, rules)
