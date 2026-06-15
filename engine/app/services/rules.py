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


@dataclass
class VastuRules:
    raw: dict

    @classmethod
    def from_file(cls, path: str | Path) -> "VastuRules":
        with open(path, "r", encoding="utf-8") as f:
            return cls(json.load(f))

    def status_score(self, status: str) -> float:
        return float(self.raw.get("statusScore", {}).get(status, 0.0))

    def rule_for(self, room_type: str) -> dict | None:
        for r in self.raw.get("rules", []):
            if r["roomType"] == room_type:
                return r
        return None

    def brahmasthan(self) -> dict:
        return self.raw.get("brahmasthan", {})

    def grade_for(self, score: float) -> str:
        for g in self.raw.get("grades", []):
            if score >= g["min"]:
                return g["label"]
        return "Unknown"


@dataclass
class CodeRules:
    raw: dict

    @classmethod
    def from_file(cls, path: str | Path) -> "CodeRules":
        with open(path, "r", encoding="utf-8") as f:
            return cls(json.load(f))

    def classification(self) -> dict:
        return self.raw.get("roomClassification", {})

    def state(self, state_code: str) -> dict:
        states = self.raw.get("states", {})
        if state_code not in states:
            raise KeyError(f"no code rules for state '{state_code}'")
        return states[state_code]

    def setback_for(self, state_code: str, plot_area_sqm: float) -> dict:
        bands = self.state(state_code).get("setbacks", [])
        for band in bands:
            cap = band.get("maxPlotAreaSqm")
            if cap is None or plot_area_sqm <= cap:
                return band
        return bands[-1] if bands else {"frontM": 0, "rearM": 0, "sideM": 0}


@lru_cache(maxsize=1)
def get_vastu_rules() -> VastuRules:
    return VastuRules.from_file(config.VASTU_RULES_PATH)


@lru_cache(maxsize=1)
def get_code_rules() -> CodeRules:
    return CodeRules.from_file(config.CODE_RULES_PATH)
