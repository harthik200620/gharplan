"""POST /plan/structural — Plan -> preliminary RCC member design (IS 456/875/1893)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import Field

from app.models.base import CamelModel
from app.models.plan import Plan
from app.services.plan_service import normalize
from app.structural import StructuralDesign, design_structure

router = APIRouter(prefix="/plan", tags=["structural"])


class StructuralRequest(CamelModel):
    """A plan plus the number of declared FUTURE floors to provision columns for."""

    plan: Plan
    future_floors: int = Field(default=0, ge=0, le=3)


@router.post("/structural", response_model=StructuralDesign)
def plan_structural(req: StructuralRequest) -> StructuralDesign:
    normalized, _ = normalize(req.plan)
    return design_structure(normalized, future_floors=req.future_floors)
