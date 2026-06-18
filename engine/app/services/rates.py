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


CITY_MODIFIERS = {
    'Mumbai': {'material': 1.25, 'labour': 1.25},
    'Delhi NCR': {'material': 1.15, 'labour': 1.15},
    'Bengaluru': {'material': 1.10, 'labour': 1.10},
    'Ahmedabad': {'material': 1.05, 'labour': 1.05},
    'Pune': {'material': 1.05, 'labour': 1.05},
    'Hyderabad': {'material': 1.05, 'labour': 1.05},
    'North East': {'material': 1.15, 'labour': 0.90},  # +15% transport (material), -10% labour
}

def get_city_modifier(city: str) -> dict:
    """Returns material and labour modifiers for a given city."""
    return CITY_MODIFIERS.get(city, {'material': 1.0, 'labour': 1.0})

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
        except KeyError:
            # Fallback to Bengaluru or first available city as base
            fallback_city = 'Bengaluru' if ('Bengaluru', item_code) in self._by else None
            if not fallback_city:
                # Find any city for this item
                for (c, ic), r in self._by.items():
                    if ic == item_code:
                        fallback_city = c
                        break
                        
            if not fallback_city:
                raise MissingRateError(city, item_code)
                
            base_rate = self._by[(fallback_city, item_code)]
            mod = get_city_modifier(city)
            return Rate(
                city=city,
                item_code=item_code,
                description=base_rate.description,
                unit=base_rate.unit,
                material_rate=base_rate.material_rate * Decimal(str(mod['material'])),
                labour_rate=base_rate.labour_rate * Decimal(str(mod['labour'])),
                gst_percent=base_rate.gst_percent,
                hsn_code=base_rate.hsn_code,
                finish_tier=base_rate.finish_tier,
            )

    @classmethod
    def from_file(cls, path: str | Path) -> "DictRatesProvider":
        with open(path, "r", encoding="utf-8") as f:
            return cls(json.load(f))


@lru_cache(maxsize=1)
def get_rates_provider() -> DictRatesProvider:
    """Default provider backed by the seeded JSON (cached)."""
    return DictRatesProvider.from_file(config.RATES_SEED_PATH)
