"""BOQ (Bill of Quantities) models.

Money is held as ``Decimal`` for exact, ROUND_HALF_UP arithmetic (Indian GST
convention) and serialized to JSON as ``float`` for easy web consumption. Tests
assert on the Decimal values returned by the service *before* serialization.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import Field, field_serializer

from .base import CamelModel
from .enums import City, FinishTier

_MONEY_FIELDS = (
    "material_rate",
    "labour_rate",
    "rate",
    "amount",
    "gst_percent",
    "gst_amount",
    "cgst_amount",
    "sgst_amount",
    "total",
)


class BoqLine(CamelModel):
    id: str
    room_id: Optional[str] = None
    room_label: Optional[str] = None
    room_type: Optional[str] = None
    trade: str
    item_code: str
    description: str
    unit: str
    qty: float
    material_rate: Decimal
    labour_rate: Decimal
    rate: Decimal
    amount: Decimal
    hsn_code: str = ""
    gst_percent: Decimal
    gst_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    total: Decimal
    # True when the line was added/edited by the user rather than auto-taken-off.
    edited: bool = False

    @field_serializer(*_MONEY_FIELDS)
    def _ser_money(self, v: Decimal) -> float:
        return float(v)


class BoqGroup(CamelModel):
    """Lines grouped by room or by trade, with a subtotal block."""

    key: str
    label: str
    line_ids: list[str]
    subtotal: Decimal
    gst_total: Decimal
    total: Decimal

    @field_serializer("subtotal", "gst_total", "total")
    def _ser_money(self, v: Decimal) -> float:
        return float(v)


class BoqSummary(CamelModel):
    subtotal: Decimal
    gst_total: Decimal
    cgst_total: Decimal
    sgst_total: Decimal
    grand_total: Decimal
    line_count: int

    @field_serializer("subtotal", "gst_total", "cgst_total", "sgst_total", "grand_total")
    def _ser_money(self, v: Decimal) -> float:
        return float(v)


class BoqReport(CamelModel):
    city: City
    finish_tier: FinishTier
    currency: str = "INR"
    lines: list[BoqLine]
    by_room: list[BoqGroup]
    by_trade: list[BoqGroup]
    summary: BoqSummary
    warnings: list[str] = Field(default_factory=list)
    disclaimer: str = ""


# ---- Request models for the /boq/generate endpoint ----


class LineOverride(CamelModel):
    """User edit to an auto-generated line (editable BOQ)."""

    line_id: str
    qty: Optional[float] = None
    material_rate: Optional[Decimal] = None
    labour_rate: Optional[Decimal] = None


class ExtraLine(CamelModel):
    """User-added bespoke line (e.g. modular kitchen, wardrobe)."""

    room_id: Optional[str] = None
    trade: str = "Other"
    item_code: str = "CUSTOM"
    description: str
    unit: str
    qty: float
    material_rate: Decimal = Decimal("0")
    labour_rate: Decimal = Decimal("0")
    hsn_code: str = ""
    gst_percent: Decimal = Decimal("18")


class BoqOptions(CamelModel):
    false_ceiling_room_ids: list[str] = Field(default_factory=list)
    remove_line_ids: list[str] = Field(default_factory=list)
