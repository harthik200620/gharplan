"""v2 generator stub: template registry, scaler, and the gated endpoint."""

from __future__ import annotations

from fastapi.testclient import TestClient

import app.routers.generate as gen
from app.generator.scaler import scale_template
from app.generator.templates import get_template, template_for_facing
from app.main import app
from app.models.plan import Plot
from app.services.code_service import check_code
from app.services.plan_service import normalize
from app.services.rules import get_code_rules, get_vastu_rules
from app.services.vastu_service import check_vastu

client = TestClient(app)


def _plot(w=9.144, d=12.192, facing="E"):
    return Plot.model_validate(
        {"widthM": w, "depthM": d, "facing": facing, "state": "KA", "city": "Bengaluru", "floors": 1}
    )


def test_template_registry():
    assert get_template("30x40_E") is not None
    assert template_for_facing("E")["id"] == "30x40_E"
    assert template_for_facing("W") is None


def test_scale_roundtrip_excellent():
    plan, _ = normalize(scale_template(get_template("30x40_E"), _plot(), get_code_rules()))
    v = check_vastu(plan, get_vastu_rules())
    c = check_code(plan, get_code_rules())
    assert len(plan.rooms) == 10
    assert v.grade == "Excellent"
    assert v.summary.fail_count == 0
    assert c.summary.fail_count == 0
    zones = {r.id: r.zone.value for r in plan.rooms}
    assert zones["kitchen"] == "SE"
    assert zones["master"] == "SW"
    assert zones["pooja"] == "NE"


def test_scale_uniform_same_aspect_preserves_zones():
    # A uniformly scaled 30x40 (same aspect ratio, same setback band) keeps zones.
    # NOTE: arbitrary aspect ratios / larger setback bands may shift zones — the v1
    # stub is curated for ~30x40 East proportions only (see endpoint "note").
    plan, _ = normalize(
        scale_template(get_template("30x40_E"), _plot(w=9.144 * 1.05, d=12.192 * 1.05), get_code_rules())
    )
    zones = {r.id: r.zone.value for r in plan.rooms}
    assert zones["kitchen"] == "SE"
    assert zones["master"] == "SW"
    assert zones["pooja"] == "NE"


def test_endpoint_disabled_by_default(monkeypatch):
    monkeypatch.setattr(gen.config, "FEATURE_GENERATOR", False)
    r = client.post("/plan/generate", json={"plot": _plot().model_dump(by_alias=True)})
    assert r.status_code == 501
    assert r.json()["detail"]["status"] == "disabled"


def test_endpoint_enabled_east(monkeypatch):
    monkeypatch.setattr(gen.config, "FEATURE_GENERATOR", True)
    r = client.post("/plan/generate", json={"plot": _plot().model_dump(by_alias=True)})
    assert r.status_code == 200
    body = r.json()
    assert body["templateId"] == "30x40_E"
    assert body["vastu"]["grade"] == "Excellent"
    assert len(body["plan"]["rooms"]) == 10


def test_endpoint_non_east_coming_soon(monkeypatch):
    monkeypatch.setattr(gen.config, "FEATURE_GENERATOR", True)
    r = client.post("/plan/generate", json={"plot": _plot(facing="N").model_dump(by_alias=True)})
    assert r.status_code == 501
    assert r.json()["detail"]["status"] == "coming_soon"
