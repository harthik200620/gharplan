"""Rate lookup.

Rates are keyed by ``(city, item_code)`` — the finish tier is already baked into
the item code chosen by the takeoff (e.g. ``FLR-VIT`` vs ``FLR-VITP``), so the
``finish_tier`` column is descriptive metadata. A missing rate raises
:class:`MissingRateError` rather than silently zeroing a line (which would
under-quote the client).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Iterable, Protocol

from app import config


@dataclass(frozen=True)
class Rate:
    city: str
    item_code: str
    description: str
    unit: str
    material_rate: Decimal
    labour_rate: Decimal
    gst_percent: Decimal
    hsn_code: str
    finish_tier: str


class MissingRateError(Exception):
    def __init__(self, city: str, item_code: str):
        super().__init__(f"No rate seeded for item '{item_code}' in city '{city}'")
        self.city = city
        self.item_code = item_code


class RatesProvider(Protocol):
    def get(self, city: str, item_code: str) -> Rate: ...


def _row_to_rate(r: dict) -> Rate:
    return Rate(
        city=r["city"],
        item_code=r["item_code"],
        description=r.get("description", ""),
        unit=r.get("unit", ""),
        material_rate=Decimal(str(r["material_rate"])),
        labour_rate=Decimal(str(r["labour_rate"])),
        gst_percent=Decimal(str(r.get("gst_percent", 18))),
        hsn_code=str(r.get("hsn_code", "")),
        finish_tier=r.get("finish_tier", "all"),
    )


class DictRatesProvider:
    """In-memory provider. Accepts seed rows (dicts) or pre-built Rate objects."""

    def __init__(self, rows: Iterable[dict | Rate]):
        self._by: dict[tuple[str, str], Rate] = {}
        for r in rows:
            rate = r if isinstance(r, Rate) else _row_to_rate(r)
            self._by[(rate.city, rate.item_code)] = rate

    def get(self, city: str, item_code: str) -> Rate:
        try:
            return self._by[(city, item_code)]
        except KeyError as exc:
            raise MissingRateError(city, item_code) from exc

    @classmethod
    def from_file(cls, path: str | Path) -> "DictRatesProvider":
        with open(path, "r", encoding="utf-8") as f:
            return cls(json.load(f))


@lru_cache(maxsize=1)
def get_rates_provider() -> DictRatesProvider:
    """Default provider backed by the seeded JSON (cached)."""
    return DictRatesProvider.from_file(config.RATES_SEED_PATH)
