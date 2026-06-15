"""Shared pytest fixtures."""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from app import config
from app.models.plan import Plan
from app.services.rates import DictRatesProvider, Rate
from app.services.rules import get_boq_rules


def _load_plan(name: str) -> Plan:
    with open(config.FIXTURES_DIR / name, "r", encoding="utf-8") as f:
        return Plan.model_validate(json.load(f))


@pytest.fixture
def sample_plan() -> Plan:
    return _load_plan("sample_plan_30x40_east.json")


@pytest.fixture
def synthetic_plan() -> Plan:
    return _load_plan("synthetic_1room.json")


@pytest.fixture
def boq_rules():
    return get_boq_rules()


@pytest.fixture
def test_rates() -> DictRatesProvider:
    """Deterministic round rates (Bengaluru) for exact BOQ assertions."""

    def rate(code: str, mat: int, lab: int, unit: str = "ea") -> Rate:
        return Rate(
            city="Bengaluru",
            item_code=code,
            description=code,
            unit=unit,
            material_rate=Decimal(mat),
            labour_rate=Decimal(lab),
            gst_percent=Decimal("18"),
            hsn_code="TEST",
            finish_tier="test",
        )

    return DictRatesProvider(
        [
            rate("PLS-CEM", 100, 50),
            rate("FLR-VIT", 600, 400),
            rate("SKB-VIT", 120, 80),
            rate("PUT-WAL", 30, 20),
            rate("PRM-WAL", 25, 15),
            rate("PNT-STD", 40, 20),
            rate("DOR-FL8", 4000, 1000),
            rate("WIN-UPV", 6000, 1000),
            rate("ELE-PT", 400, 200),
        ]
    )
