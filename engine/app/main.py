"""GharPlan engine — FastAPI application entrypoint.

M1 endpoints: GET /health, POST /plan/validate, POST /boq/generate.
M2 will add /vastu/check, /code/check and /export/*; M5 adds /plan/generate.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config
from app.routers import boq, code, export, validate, vastu
from app.services.plan_service import PlanValidationError
from app.services.rates import MissingRateError

app = FastAPI(
    title="GharPlan Engine",
    version="1.0.0",
    description="Vastu, building-code & BOQ-from-geometry compute core for Indian residential design.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(PlanValidationError)
async def _plan_validation_handler(_: Request, exc: PlanValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc), "type": "plan_validation_error"})


@app.exception_handler(MissingRateError)
async def _missing_rate_handler(_: Request, exc: MissingRateError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": str(exc),
            "type": "missing_rate_error",
            "city": exc.city,
            "itemCode": exc.item_code,
        },
    )


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "service": "gharplan-engine",
        "version": "1.0.0",
        "brahmasthanStrategy": config.BRAHMASTHAN_STRATEGY,
        "featureGenerator": config.FEATURE_GENERATOR,
    }


app.include_router(validate.router)
app.include_router(boq.router)
app.include_router(vastu.router)
app.include_router(code.router)
app.include_router(export.router)
