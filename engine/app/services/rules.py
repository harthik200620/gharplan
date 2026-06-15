"""Loaders for the data-driven rule sets (BOQ takeoff rules for now; Vastu/code
rules are added in M2). Keeping the rules as data means a QS can edit coefficients
and item codes without touching engine code.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app import config


@dataclass
class BoqRules:
    raw: dict

    @classmethod
    def from_file(cls, path: str | Path) -> "BoqRules":
        with open(path, "r", encoding="utf-8") as f:
            return cls(json.load(f))

    # --- typed accessors ---
    def wastage(self, key: str, default: float = 1.0) -> float:
        return float(self.raw.get("wastage", {}).get(key, default))

    def dado_height(self, room_type: str) -> float | None:
        v = self.raw.get("dadoHeightM", {}).get(room_type)
        return float(v) if v is not None else None

    def electrical_points(self, room_type: str) -> int:
        d = self.raw.get("electricalPointsByRoom", {})
        return int(d.get(room_type, d.get("default", 4)))

    def plumbing_points(self, room_type: str) -> int:
        d = self.raw.get("plumbingPointsByRoom", {})
        return int(d.get(room_type, d.get("default", 0)))

    def excluded_types(self) -> set[str]:
        return set(self.raw.get("excludeRoomTypes", []))

    def items(self) -> list[dict]:
        return list(self.raw.get("items", []))


@lru_cache(maxsize=1)
def get_boq_rules() -> BoqRules:
    return BoqRules.from_file(config.BOQ_RULES_PATH)
