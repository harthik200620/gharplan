"""Layouts router — Tirupati government-approved plot selection API.

Exposes:
  GET /layouts/tirupati          → full GeoJSON FeatureCollection
  GET /layouts/tirupati/search   → filtered plots
  GET /layouts/tirupati/{id}     → single plot + auto-generated design brief
  GET /layouts/tirupati/stats    → summary statistics
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/layouts", tags=["layouts"])

_DATA_FILE = Path(__file__).parent.parent / "data" / "tirupati_layouts.json"


@lru_cache(maxsize=1)
def _load() -> dict:
    with open(_DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


@router.get("/tirupati", summary="All Tirupati approved layouts as GeoJSON")
def get_tirupati_layouts():
    """Returns all TUDA/DTCP/Municipal approved plots as GeoJSON FeatureCollection."""
    return _load()


@router.get("/tirupati/stats", summary="Summary statistics for Tirupati plots")
def get_tirupati_stats():
    data = _load()
    features = data["features"]
    props = [f["properties"] for f in features]
    authorities = {}
    for p in props:
        a = p.get("authority", "Other")
        authorities[a] = authorities.get(a, 0) + 1
    sizes = sorted(set(p.get("area_sqyd", 0) for p in props))
    layouts = sorted(set(p.get("layout_name", "") for p in props))
    return {
        "total_plots": len(features),
        "total_layouts": len(layouts),
        "by_authority": authorities,
        "available_sizes_sqyd": sizes,
        "layouts": layouts,
        "city": "Tirupati",
        "state": "Andhra Pradesh",
    }


@router.get("/tirupati/search", summary="Search and filter Tirupati plots")
def search_tirupati_plots(
    q: Optional[str] = Query(None, description="Layout name, plot number, locality or survey no."),
    authority: Optional[str] = Query(None, description="TUDA, DTCP, or Municipal"),
    facing: Optional[str] = Query(None, description="North, South, East, or West"),
    area_min: Optional[float] = Query(None, description="Minimum area in sq yards"),
    area_max: Optional[float] = Query(None, description="Maximum area in sq yards"),
    corner_only: bool = Query(False),
    limit: int = Query(100, le=500),
):
    features = _load()["features"]
    if q:
        ql = q.lower()
        features = [f for f in features if any(
            ql in str(f["properties"].get(k, "")).lower()
            for k in ("layout_name", "plot_number", "locality", "survey_no", "lp_number")
        )]
    if authority:
        features = [f for f in features if f["properties"].get("authority", "").upper() == authority.upper()]
    if facing:
        features = [f for f in features if f["properties"].get("facing", "").lower() == facing.lower()]
    if area_min is not None:
        features = [f for f in features if f["properties"].get("area_sqyd", 0) >= area_min]
    if area_max is not None:
        features = [f for f in features if f["properties"].get("area_sqyd", 0) <= area_max]
    if corner_only:
        features = [f for f in features if f["properties"].get("corner_plot", False)]
    return {"type": "FeatureCollection", "features": features[:limit], "total": len(features)}


@router.get("/tirupati/{plot_id}", summary="Get plot detail with auto-generated design brief")
def get_plot_detail(plot_id: str):
    """Returns full plot details + auto-generated brief ready for the GharPlan generator."""
    features = _load()["features"]
    plot = next((f for f in features if f["properties"].get("id") == plot_id), None)
    if not plot:
        raise HTTPException(status_code=404, detail=f"Plot '{plot_id}' not found in Tirupati layouts.")
    p = plot["properties"]
    brief = {
        "city": "Tirupati",
        "state": "AP",
        "plot_width_ft": p["width_ft"],
        "plot_depth_ft": p["depth_ft"],
        "plot_width_m": p["width_m"],
        "plot_depth_m": p["depth_m"],
        "plot_area_sqyd": p["area_sqyd"],
        "plot_area_sqm": p["area_sqm"],
        "facing": p["facing"],
        "road_width_ft": p["road_width_ft"],
        "corner_plot": p["corner_plot"],
        "authority": p["authority"],
        "lp_number": p.get("lp_number"),
        "survey_no": p.get("survey_no"),
        "suggested_bhk": _suggest_bhk(p["area_sqyd"]),
        "suggested_floors": _suggest_floors(p["area_sqyd"]),
        "max_far": _tuda_far(p["area_sqyd"]),
        "setbacks": _setbacks(p),
        "climate_zone": "composite",
        "seismic_zone": "II",
        "verify_tuda": "https://tuda.ap.gov.in",
        "verify_meebhoomi": "https://meebhoomi.ap.gov.in",
        "verify_rera": "https://rera.ap.gov.in",
        "verify_bhunaksha": "https://bhunaksha.ap.gov.in",
    }
    return {"plot": plot, "auto_brief": brief}


def _suggest_bhk(sq: float) -> int:
    if sq < 120: return 1
    if sq < 180: return 2
    if sq < 320: return 3
    return 4


def _suggest_floors(sq: float) -> int:
    if sq < 150: return 2
    return 1  # G+1 typical; user can choose more


def _tuda_far(sq: float) -> float:
    if sq <= 200: return 1.75
    if sq <= 500: return 2.0
    return 2.5


def _setbacks(p: dict) -> dict:
    road = p.get("road_width_ft", 30)
    area = p.get("area_sqyd", 200)
    corner = p.get("corner_plot", False)
    if road <= 20: front = 1.5
    elif road <= 40: front = 3.0
    else: front = 4.5
    side = 1.0 if area <= 200 else 1.5
    return {
        "front_m": front, "rear_m": 1.5,
        "side_left_m": side,
        "side_right_m": front if corner else side,
        "source": "TUDA Zoning Regulations, Andhra Pradesh",
        "note": "Verify with TUDA/DTCP before construction",
    }
