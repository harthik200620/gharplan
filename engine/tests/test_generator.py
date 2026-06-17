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


def _brief(bhk=2, w=9.144, d=12.192, facing="E", state="KA", city="Bengaluru", floors=1):
    return {
        "bhk": bhk,
        "plotWidthM": w,
        "plotDepthM": d,
        "facing": facing,
        "state": state,
        "city": city,
        "floors": floors,
        "vastuPriority": True,
    }


def test_endpoint_kill_switch_returns_501(monkeypatch):
    # The generator is GA/on by default; the flag is only a kill switch.
    monkeypatch.setattr(gen.config, "FEATURE_GENERATOR", False)
    r = client.post("/plan/generate", json=_brief())
    assert r.status_code == 501
    assert r.json()["detail"]["status"] == "disabled"


def test_endpoint_generates_for_brief():
    # On by default — no monkeypatch needed.
    r = client.post("/plan/generate", json=_brief(bhk=2))
    assert r.status_code == 200
    body = r.json()
    assert "areaSqm" in body["plan"]["rooms"][0]  # camelCase on the wire
    assert body["code"]["summary"]["failCount"] == 0
    assert body["vastu"]["score"] >= 70
    assert "vastuScore" in body["meta"]


def test_endpoint_works_for_any_facing():
    # The generator (unlike the old single-template stub) handles every facing.
    r = client.post("/plan/generate", json=_brief(facing="N"))
    assert r.status_code == 200
    assert r.json()["code"]["summary"]["failCount"] == 0


def test_endpoint_unsupported_state_422():
    r = client.post("/plan/generate", json=_brief(state="MH"))
    assert r.status_code == 422
    assert r.json()["detail"]["status"] == "unsupported_state"


def test_endpoint_bad_bhk_422():
    r = client.post("/plan/generate", json=_brief(bhk=5))
    assert r.status_code == 422


def test_endpoint_meta_right_sizing_camelcase():
    # The right-sizing surface is returned on meta in camelCase.
    r = client.post("/plan/generate", json=_brief(bhk=2))
    assert r.status_code == 200
    meta = r.json()["meta"]
    for k in ("tier", "requestedBhk", "downscaled", "note"):
        assert k in meta
    assert meta["tier"] in {"STUDIO", "1BHK", "2BHK", "3BHK", "4BHK"}
    assert meta["requestedBhk"] == 2
    assert isinstance(meta["downscaled"], bool)


def test_endpoint_downscales_bhk4_on_30x40():
    # bhk is still validated 1..4, but the generator may return a smaller tier when
    # that is all the plot can hold; meta.downscaled flags it.
    r = client.post("/plan/generate", json=_brief(bhk=4))
    assert r.status_code == 200
    body = r.json()
    meta = body["meta"]
    assert meta["requestedBhk"] == 4
    assert meta["downscaled"] is True
    assert meta["tier"] in {"2BHK", "3BHK"}
    assert body["code"]["summary"]["failCount"] == 0


def test_endpoint_attached_baths_in_2bhk():
    # A 2BHK plan has an attached toilet per bedroom plus a common toilet.
    r = client.post("/plan/generate", json=_brief(bhk=2))
    assert r.status_code == 200
    rooms = r.json()["plan"]["rooms"]
    bedrooms = [rm for rm in rooms if "bedroom" in rm["type"]]
    toilets = [rm for rm in rooms if rm["type"] == "toilet"]
    # one ensuite per bedroom + one common
    assert len(toilets) == len(bedrooms) + 1
    assert any(t["id"] == "toilet_common" for t in toilets)
    for bed in bedrooms:
        assert any(t["id"] == f"toilet_{bed['id']}" for t in toilets)


def test_endpoint_tiny_plot_studio():
    # A tiny plot returns a Studio (no separate bedrooms), still code-clean.
    r = client.post("/plan/generate", json=_brief(bhk=2, w=6.0, d=7.5))
    assert r.status_code == 200
    body = r.json()
    assert body["meta"]["tier"] == "STUDIO"
    assert body["code"]["summary"]["failCount"] == 0
    rooms = body["plan"]["rooms"]
    assert not [rm for rm in rooms if "bedroom" in rm["type"]]
