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
from app.generator.designer import VARIANT_PROFILES, generate_options, generate_plan
from app.models.base import CamelModel
from app.models.enums import City, Facing, FinishTier, StateCode, FamilyProfile, PlotShape
from app.models.plan import Plan, Plot
from app.models.reports import CodeReport, VastuReport
from app.services.refine_service import parse_edits
from app.services.rules import get_code_rules, get_vastu_rules
from app.services.climate_service import get_climate_zone, get_passive_strategies, get_orientation_advice, get_shading_requirements
from app.services.structural_service import get_column_grid, get_foundation_type, get_structural_narrative
from app.services.autonomous_loop import optimize_plan

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
    family_profile: FamilyProfile = Field(default=FamilyProfile.nuclear)
    plot_shape: PlotShape = Field(default=PlotShape.regular)
    family_persona: Optional[str] = None

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
    climate: dict | None = None
    structure: dict | None = None


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


class RefineRequest(GenerateRequest):
    """A brief PLUS an ordered list of plain-English edit instructions and the id of
    the scheme being refined. The instructions are the full edit history (applied in
    order) so refinement is stateless: the same brief + instructions always yields the
    same plan."""

    instructions: list[str] = Field(default_factory=list)
    variant_id: Optional[str] = None


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
        family_profile=req.family_profile,
        plot_shape=req.plot_shape,
        family_persona=req.family_persona,
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
        family_profile=req.family_profile,
        plot_shape=req.plot_shape,
        family_persona=req.family_persona,
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

    city_str = plot.city.value if hasattr(plot.city, "value") else str(plot.city)
    facing_str = plot.facing.value if hasattr(plot.facing, "value") else str(plot.facing)
    climate_zone = get_climate_zone(city_str)
    
    climate_data = {
        "zone": climate_zone,
        "passive_strategies": get_passive_strategies(climate_zone),
        "orientation_advice": get_orientation_advice(climate_zone, facing_str),
        "shading_requirements": get_shading_requirements(climate_zone)
    }
    
    plot_sqm = plot.width_m * plot.depth_m
    structure_data = {
        "grid": get_column_grid(plot.width_m, plot.depth_m, req.floors),
        "foundation": get_foundation_type(plot_sqm, req.floors, city_str),
        "narrative": get_structural_narrative(plot.width_m, plot.depth_m, req.floors, city_str)
    }

    return GenerateResponse(plan=plan, vastu=vastu, code=code, meta=meta, climate=climate_data, structure=structure_data)


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


def _variant_by_id(vid: Optional[str]):
    if not vid:
        return None
    return next((v for v in VARIANT_PROFILES if v.id == vid), None)


@router.post("/refine", response_model=GenerateResponse)
def plan_refine(req: RefineRequest) -> GenerateResponse:
    """Apply single-prompt edits to a generated plan and return the refined plan.

    The instructions ("make the master bigger", "move the kitchen to the SE", "add a
    study", "make it two floors") are parsed into generator overrides and folded back
    into ``generate_plan``, so the refined plan is re-optimised end-to-end and stays
    valid (non-overlapping, Vastu-zoned, code-checked). ``meta.appliedEdits`` lists what
    changed in plain English; ``meta.unmatchedEdits`` lists anything we couldn't map."""
    plot = _validated_plot(req)
    result = parse_edits(
        req.instructions, base_bhk=req.bhk, base_floors=req.floors, base_variant_id=req.variant_id
    )
    plot = plot.model_copy(update={"floors": result.floors})
    try:
        plan, vastu, code, meta = generate_plan(
            bhk=result.bhk,
            plot=plot,
            floors=result.floors,
            vastu_priority=req.vastu_priority,
            code_rules=get_code_rules(),
            vastu_rules=get_vastu_rules(),
            variant=_variant_by_id(result.variant_id),
            edits=result.edits,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"status": "infeasible_brief", "message": str(exc)},
        )

    meta["appliedEdits"] = result.applied
    meta["unmatchedEdits"] = result.unmatched
    meta["editVariantId"] = result.variant_id
    
    city_str = plot.city.value if hasattr(plot.city, "value") else str(plot.city)
    facing_str = plot.facing.value if hasattr(plot.facing, "value") else str(plot.facing)
    climate_zone = get_climate_zone(city_str)
    
    climate_data = {
        "zone": climate_zone,
        "passive_strategies": get_passive_strategies(climate_zone),
        "orientation_advice": get_orientation_advice(climate_zone, facing_str),
        "shading_requirements": get_shading_requirements(climate_zone)
    }
    
    plot_sqm = plot.width_m * plot.depth_m
    structure_data = {
        "grid": get_column_grid(plot.width_m, plot.depth_m, result.floors),
        "foundation": get_foundation_type(plot_sqm, result.floors, city_str),
        "narrative": get_structural_narrative(plot.width_m, plot.depth_m, result.floors, city_str)
    }
    
    return GenerateResponse(plan=plan, vastu=vastu, code=code, meta=meta, climate=climate_data, structure=structure_data)

@router.post("/auto-perfect", response_model=GenerateResponse)
def plan_auto_perfect(req: GenerateRequest) -> GenerateResponse:
    """
    Autonomous architectural optimization loop.
    Acts as a 10-year experienced architect continuously refining the plan
    until it meets high Vastu and structural score criteria.
    """
    plot = _validated_plot(req)
    
    plan, vastu, code, meta = optimize_plan(
        bhk=req.bhk,
        plot=plot,
        floors=req.floors,
        vastu_priority=req.vastu_priority
    )
    
    city_str = plot.city.value if hasattr(plot.city, "value") else str(plot.city)
    facing_str = plot.facing.value if hasattr(plot.facing, "value") else str(plot.facing)
    climate_zone = get_climate_zone(city_str)
    
    climate_data = {
        "zone": climate_zone,
        "passive_strategies": get_passive_strategies(climate_zone),
        "orientation_advice": get_orientation_advice(climate_zone, facing_str),
        "shading_requirements": get_shading_requirements(climate_zone)
    }
    
    plot_sqm = plot.width_m * plot.depth_m
    structure_data = {
        "grid": get_column_grid(plot.width_m, plot.depth_m, req.floors),
        "foundation": get_foundation_type(plot_sqm, req.floors, city_str),
        "narrative": get_structural_narrative(plot.width_m, plot.depth_m, req.floors, city_str)
    }
    
    return GenerateResponse(plan=plan, vastu=vastu, code=code, meta=meta, climate=climate_data, structure=structure_data)
