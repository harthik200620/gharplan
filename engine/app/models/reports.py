"""Vastu and building-code report models."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import Field

from .base import CamelModel

Status = Literal["pass", "warn", "fail"]


# ---- Vastu ----


class VastuRoomResult(CamelModel):
    room_id: Optional[str] = None
    room_type: str
    room_label: str
    zone: str
    status: Status
    weight: int
    message: str
    suggested_zones: list[str] = Field(default_factory=list)
    remedy: str = ""


class VastuSummary(CamelModel):
    evaluated: int
    pass_count: int
    warn_count: int
    fail_count: int


class VastuReport(CamelModel):
    score: float  # 0-100 weighted compliance
    grade: str
    rooms: list[VastuRoomResult]
    brahmasthan: VastuRoomResult
    fixes: list[VastuRoomResult]
    summary: VastuSummary
    ayadi: dict = Field(default_factory=dict)
    marma_points: list[dict] = Field(default_factory=list)
    entrance_quality: dict = Field(default_factory=dict)
    disclaimer: str = ""


# ---- Building code ----


class CodeCheck(CamelModel):
    rule_id: str
    label: str
    room_id: Optional[str] = None
    room_label: Optional[str] = None
    status: Status
    actual: Optional[str] = None
    required: Optional[str] = None
    message: str


class CodeMetrics(CamelModel):
    plot_area_sqm: float
    footprint_sqm: float
    built_up_sqm: float
    ground_coverage_pct: float
    max_ground_coverage_pct: float
    far_used: float
    far_allowed: float


class CodeSummary(CamelModel):
    total: int
    pass_count: int
    warn_count: int
    fail_count: int


class CodeReport(CamelModel):
    state: str
    status: Status  # worst status across all checks
    metrics: CodeMetrics
    checks: list[CodeCheck]
    summary: CodeSummary
    fire_safety: list[dict] = Field(default_factory=list)
    accessibility: list[dict] = Field(default_factory=list)
    is962_compliance: list[dict] = Field(default_factory=list)
    improvement_priority: list[dict] = Field(default_factory=list)
    disclaimer: str = ""
