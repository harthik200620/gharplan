"""POST /vastu/check — Plan -> Vastu report (per-room status + score + fixes)."""

from __future__ import annotations

from fastapi import APIRouter

from app.models.plan import Plan
from app.models.reports import VastuReport
from app.services.plan_service import normalize
from app.services.rules import get_vastu_rules
from app.services.vastu_service import check_vastu

router = APIRouter(prefix="/vastu", tags=["vastu"])


@router.post("/check", response_model=VastuReport)
def vastu_check(plan: Plan) -> VastuReport:
    normalized, _ = normalize(plan)
    return check_vastu(normalized, get_vastu_rules())
