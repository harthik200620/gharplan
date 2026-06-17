"""POST /plan/generate — deterministic, Vastu-aware floor-plan generation.

Accepts a structured brief (BHK, plot size, facing, state, city, floors) and
returns a fully normalised :class:`Plan` together with its Vastu and building-code
reports and a small generator ``meta`` block. The heavy lifting lives in
:mod:`app.generator.designer`; this router only validates the brief, assembles a
:class:`Plot`, and serialises the result by alias (camelCase).

The generator is on by default. ``FEATURE_GENERATOR`` is retained only as a kill
switch (defaults ON via ``config``); when explicitly disabled the endpoint
returns 501 so the flag still has an observable effect.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import Field, field_validator

from app import config
from app.generator.designer import generate_options, generate_plan
from app.models.base import CamelModel
from app.models.enums import City, Facing, FinishTier, StateCode
from app.models.plan import Plan, Plot
from app.models.reports import CodeReport, VastuReport
from app.services.rules import get_code_rules, get_vastu_rules

router = APIRouter(prefix="/plan", tags=["generate"])

# States the generator + code ruleset support (must have a code_rules.json entry).
_SUPPORTED_STATES = {StateCode.KA, StateCode.TG, StateCode.AP}

# A reasonable default city per state (the brief takes a free-text city, but the
# Plot model carries a City enum; the city is cosmetic for generation).
_DEFAULT_CITY = {
    StateCode.KA: City.Bengaluru,
    StateCode.TG: City.Hyderabad,
    StateCode.AP: City.Tirupati,
    StateCode.MH: City.Pune,
}


def _resolve_city(name: str, state: StateCode) -> City:
    for c in City:
        if c.value.lower() == name.strip().lower():
            return c
    return _DEFAULT_CITY.get(state, City.Bengaluru)


class GenerateRequest(CamelModel):
    """A design brief. JSON is camelCase (``plotWidthM`` ...); snake_case also parses."""

    bhk: int = Field(ge=1, le=4, description="Bedrooms (1-4)")
    plot_width_m: float = Field(gt=0, description="Plot width along +x (East), metres")
    plot_depth_m: float = Field(gt=0, description="Plot depth along +y (North), metres")
    facing: Facing
    state: StateCode
    city: str
    floors: int = Field(default=1, ge=1, le=4)
    vastu_priority: bool = True
    budget_tier: Optional[FinishTier] = None

    @field_validator("plot_width_m", "plot_depth_m")
    @classmethod
    def _sane_plot(cls, v: float) -> float:
        if v < 3.0 or v > 120.0:
            raise ValueError("plot dimension must be between 3 m and 120 m")
        return v


class GenerateResponse(CamelModel):
    plan: Plan
    vastu: VastuReport
    code: CodeReport
    meta: dict


class GeneratedOption(CamelModel):
    """One design scheme in a five-option set (see ``VARIANT_PROFILES``)."""

    variant_id: str
    variant_name: str
    variant_tagline: str
    plan: Plan
    vastu: VastuReport
    code: CodeReport
    meta: dict


class GenerateOptionsResponse(CamelModel):
    options: list[GeneratedOption]
    count: int


def _validated_plot(req: "GenerateRequest") -> Plot:
    """Shared brief validation for the generate endpoints. Raises HTTPException."""
    if not config.FEATURE_GENERATOR:
        raise HTTPException(
            status_code=501,
            detail={
                "status": "disabled",
                "message": "The floor-plan generator is turned off (FEATURE_GENERATOR=false).",
            },
        )
    if req.state not in _SUPPORTED_STATES:
        raise HTTPException(
            status_code=422,
            detail={
                "status": "unsupported_state",
                "message": f"No building-code ruleset for state '{req.state.value}'. "
                f"Supported: {sorted(s.value for s in _SUPPORTED_STATES)}.",
            },
        )
    return Plot(
        width_m=req.plot_width_m,
        depth_m=req.plot_depth_m,
        facing=req.facing,
        state=req.state,
        city=_resolve_city(req.city, req.state),
        floors=req.floors,
    )


@router.post("/generate", response_model=GenerateResponse)
def plan_generate(req: GenerateRequest) -> GenerateResponse:
    if not config.FEATURE_GENERATOR:
        raise HTTPException(
            status_code=501,
            detail={
                "status": "disabled",
                "message": "The floor-plan generator is turned off (FEATURE_GENERATOR=false).",
            },
        )

    if req.state not in _SUPPORTED_STATES:
        raise HTTPException(
            status_code=422,
            detail={
                "status": "unsupported_state",
                "message": f"No building-code ruleset for state '{req.state.value}'. "
                f"Supported: {sorted(s.value for s in _SUPPORTED_STATES)}.",
            },
        )

    plot = Plot(
        width_m=req.plot_width_m,
        depth_m=req.plot_depth_m,
        facing=req.facing,
        state=req.state,
        city=_resolve_city(req.city, req.state),
        floors=req.floors,
    )

    try:
        plan, vastu, code, meta = generate_plan(
            bhk=req.bhk,
            plot=plot,
            floors=req.floors,
            vastu_priority=req.vastu_priority,
            code_rules=get_code_rules(),
            vastu_rules=get_vastu_rules(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"status": "infeasible_brief", "message": str(exc)},
        )

    return GenerateResponse(plan=plan, vastu=vastu, code=code, meta=meta)


@router.post("/options", response_model=GenerateOptionsResponse)
def plan_options(req: GenerateRequest) -> GenerateOptionsResponse:
    """Generate up to five distinct, de-duplicated design schemes for one brief.

    Each option is a full plan + Vastu/code reports + meta, tagged with the design
    strategy that produced it (Vastu-first, open-plan, compact, courtyard,
    entertainer). Tighter briefs return fewer than five when only so many genuinely
    different good layouts exist."""
    plot = _validated_plot(req)
    try:
        options = generate_options(
            bhk=req.bhk,
            plot=plot,
            floors=req.floors,
            vastu_priority=req.vastu_priority,
            code_rules=get_code_rules(),
            vastu_rules=get_vastu_rules(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"status": "infeasible_brief", "message": str(exc)},
        )

    models = [
        GeneratedOption(
            variant_id=o["variantId"],
            variant_name=o["variantName"],
            variant_tagline=o["variantTagline"],
            plan=o["plan"],
            vastu=o["vastu"],
            code=o["code"],
            meta=o["meta"],
        )
        for o in options
    ]
    return GenerateOptionsResponse(options=models, count=len(models))
