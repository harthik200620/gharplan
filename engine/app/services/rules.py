"""Loaders for the data-driven rule sets (BOQ takeoff rules for now; Vastu/code
rules are added in M2). Keeping the rules as data means a QS can edit coefficients
and item codes without touching engine code.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
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

    def labour_city_factor(self, city: str) -> Decimal:
        """Regional labour-rate multiplier (policy layer, data-driven; 1.0 = none)."""
        d = self.raw.get("labourCityFactor", {})
        return Decimal(str(d.get(city, d.get("default", 1.0))))

    def contingency_pct(self) -> Decimal:
        """Site-contingency percentage applied on the subtotal (0 = none)."""
        return Decimal(str(self.raw.get("contingencyPct", 0)))

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


# ---------------------------------------------------------------------------
# Jurisdiction rule packs — fixtures/rulepacks/*.json (schema.md is the contract).
#
# A pack duck-types the CodeRules accessor surface (state / classification /
# setback_for) so the designer and code checker run unchanged; room-level
# minimums stay delegated to code_rules.json (roomMinimums.inheritFrom).
# Every numeric band carries source{ref, confidence} for clause-cited checks.
# ---------------------------------------------------------------------------

RULEPACKS_DIR = config.FIXTURES_DIR / "rulepacks"

# Assumptions used when a caller has no road/height data (legacy rectangular
# briefs). Surfaced to the user via the check message, never silent.
ASSUMED_ROAD_WIDTH_M = 9.0
ASSUMED_BAND_HEIGHT_M = 7.0


def _in_band(rng: list | tuple, value: float) -> bool:
    return float(rng[0]) <= value < float(rng[1])


def _load_pack_raw(pack_id: str) -> dict:
    path = RULEPACKS_DIR / f"{pack_id}.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    parent_id = data.get("inherits")
    if parent_id:
        # Shallow top-level merge: child keys replace parent's wholesale.
        data = {**_load_pack_raw(parent_id), **data}
    return data


class JurisdictionPack:
    """One jurisdiction's rules, resolved (inheritance applied), CodeRules-compatible."""

    def __init__(self, raw: dict, base: CodeRules):
        self.raw = raw
        self._base = base

    # ---- identity ----
    @property
    def pack_id(self) -> str:
        return self.raw.get("packId", "?")

    @property
    def regime(self) -> str:
        return self.raw.get("regime", "")

    # ---- CodeRules surface (duck-typed) ----
    def classification(self) -> dict:
        return self._base.classification()

    def state(self, state_code: str) -> dict:
        """Legacy state block (room minimums etc.) with pack-level overrides.

        FAR is intentionally NOT overridden here: a pack may model "no separate
        FAR cap" (far.value null) which legacy float() consumers can't take —
        the pack-aware FAR check in code_service reads far_allowed() instead,
        and the designer's internal budgeting keeps the conservative legacy cap.
        """
        st = dict(self._base.state(state_code))
        cov = self.coverage_max_pct()
        if cov is not None:
            st["maxGroundCoveragePct"] = cov
        park = self.parking_per_dwelling()
        if park is not None:
            st["parkingPerDwelling"] = park
        return st

    def setback_for(
        self,
        state_code: str,
        plot_area_sqm: float,
        road_w_m: float | None = None,
        height_m: float | None = None,
    ) -> dict:
        road = ASSUMED_ROAD_WIDTH_M if road_w_m is None else float(road_w_m)
        height = ASSUMED_BAND_HEIGHT_M if height_m is None else float(height_m)
        bands = self.raw.get("setbacks", [])
        for band in bands:
            when = band.get("when", {})
            if "plotAreaSqm" in when and not _in_band(when["plotAreaSqm"], plot_area_sqm):
                continue
            if "roadWidthM" in when and not _in_band(when["roadWidthM"], road):
                continue
            if "heightM" in when and not _in_band(when["heightM"], height):
                continue
            out = dict(band)
            out["_assumedRoadWidth"] = road_w_m is None
            return out
        # Mirror the legacy fallback: last band, or zero setbacks.
        return dict(bands[-1]) if bands else {"frontM": 0, "rearM": 0, "sideM": 0}

    # ---- pack-specific accessors ----
    def max_height_for(self, road_w_m: float | None = None) -> float | None:
        road = ASSUMED_ROAD_WIDTH_M if road_w_m is None else float(road_w_m)
        for band in self.raw.get("heightByRoad", []):
            if _in_band(band["roadWidthM"], road):
                return float(band["maxHeightM"])
        return None

    def far_allowed(self) -> float | None:
        v = (self.raw.get("far") or {}).get("value")
        return None if v is None else float(v)

    def far_note(self) -> str:
        return (self.raw.get("far") or {}).get("note", "")

    def coverage_max_pct(self) -> float | None:
        v = (self.raw.get("coverage") or {}).get("maxPct")
        return None if v is None else float(v)

    def parking_per_dwelling(self) -> int | None:
        v = (self.raw.get("parking") or {}).get("perDwelling")
        return None if v is None else int(v)

    def rwh_threshold_sqm(self) -> float | None:
        v = (self.raw.get("rwh") or {}).get("mandatoryAbovePlotSqm")
        return None if v is None else float(v)

    def corner_second_front(self) -> bool:
        return bool((self.raw.get("cornerPlot") or {}).get("secondFrontSetback"))

    def instant_approval_eligible(self, plot_area_sqm: float, height_m: float) -> bool:
        ia = self.raw.get("instantApproval")
        if not ia:
            return False
        return plot_area_sqm <= float(ia["maxPlotSqm"]) and height_m <= float(ia["maxHeightM"])

    def doc_checklist(self) -> list[str]:
        return list(self.raw.get("docChecklist", []))

    def citation_for(
        self,
        kind: str,
        plot_area_sqm: float | None = None,
        road_w_m: float | None = None,
        height_m: float | None = None,
    ) -> tuple[str | None, str]:
        """(source ref, confidence) for a rule kind; band kinds re-derive the match."""
        src: dict | None = None
        if kind == "setbacks":
            band = self.setback_for(self.raw.get("state", ""), plot_area_sqm or 0.0, road_w_m, height_m)
            src = band.get("source")
        elif kind == "heightByRoad":
            road = ASSUMED_ROAD_WIDTH_M if road_w_m is None else float(road_w_m)
            for band in self.raw.get("heightByRoad", []):
                if _in_band(band["roadWidthM"], road):
                    src = band.get("source")
                    break
        else:
            section = self.raw.get(kind)
            if isinstance(section, dict):
                src = section.get("source")
        if not isinstance(src, dict) or not src.get("ref"):
            return (None, "needs_verification")
        return (str(src["ref"]), str(src.get("confidence", "needs_verification")))


@lru_cache(maxsize=16)
def get_rulepack(pack_id: str) -> JurisdictionPack:
    return JurisdictionPack(_load_pack_raw(pack_id), get_code_rules())


# City-level routing (city strings, not the enum, so future cities just work).
_PACK_BY_STATE_CITY: dict[tuple[str, str], str] = {
    ("TG", "Hyderabad"): "tg-ghmc",
    ("AP", "Tirupati"): "ap-tuda",
    ("AP", "Visakhapatnam"): "ap-vmrda",
    ("AP", "Vijayawada"): "ap-crda",
    ("AP", "Guntur"): "ap-crda",
    ("AP", "Amaravati"): "ap-crda",
}
_PACK_BY_STATE: dict[str, str] = {
    "TG": "tg-ulb-common",
    "AP": "ap-dpms-common",
}


def resolve_jurisdiction(
    state: str, city: str | None = None, ulb_hint: str | None = None
) -> CodeRules | JurisdictionPack:
    """Resolve the governing rules for (state, city).

    TG/AP resolve to a jurisdiction pack; KA (and anything unknown) keeps the
    legacy state-level CodeRules loader so that path stays bit-identical.
    ``ulb_hint`` (a packId) overrides when it names an existing pack.
    """
    if ulb_hint:
        try:
            return get_rulepack(ulb_hint)
        except FileNotFoundError:
            pass
    pack_id = _PACK_BY_STATE_CITY.get((state, city or "")) or _PACK_BY_STATE.get(state)
    if pack_id:
        return get_rulepack(pack_id)
    return get_code_rules()
