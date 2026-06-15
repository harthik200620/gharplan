"""Endpoint smoke tests via FastAPI TestClient."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app import config
from app.main import app

client = TestClient(app)


def _sample() -> dict:
    with open(config.FIXTURES_DIR / "sample_plan_30x40_east.json", "r", encoding="utf-8") as f:
        return json.load(f)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_validate_endpoint_normalizes_and_serializes_camel_case():
    r = client.post("/plan/validate", json=_sample())
    assert r.status_code == 200
    body = r.json()
    room = body["plan"]["rooms"][0]
    assert room["zone"] is not None
    assert "areaSqm" in room  # camelCase on the wire
    assert "areaSqm" in body["plan"]["plot"]


def test_boq_endpoint_returns_costed_boq():
    r = client.post("/boq/generate", json={"plan": _sample(), "finishTier": "standard"})
    assert r.status_code == 200
    rep = r.json()
    assert rep["summary"]["grandTotal"] > 0
    assert len(rep["lines"]) > 0
    # money serialized as JSON number, not Decimal-string
    assert isinstance(rep["summary"]["grandTotal"], (int, float))
    assert isinstance(rep["lines"][0]["amount"], (int, float))


def test_invalid_plan_returns_422():
    bad = _sample()
    bad["rooms"][0]["polygon"] = [[0, 0], [1, 0], [2, 0]]  # zero area
    r = client.post("/plan/validate", json=bad)
    assert r.status_code == 422
    assert r.json()["type"] == "plan_validation_error"


def test_vastu_endpoint():
    r = client.post("/vastu/check", json=_sample())
    assert r.status_code == 200
    body = r.json()
    assert 0 <= body["score"] <= 100
    assert "brahmasthan" in body


def test_code_endpoint():
    r = client.post("/code/check", json=_sample())
    assert r.status_code == 200
    body = r.json()
    assert body["state"] == "KA"
    assert body["metrics"]["groundCoveragePct"] >= 0


def test_export_endpoints():
    dxf = client.post("/export/dxf", json=_sample())
    assert dxf.status_code == 200
    assert dxf.content[:1] and b"SECTION" in dxf.content[:2000]

    body = {"plan": _sample(), "finishTier": "standard", "branding": {"studioName": "Acme"}}
    xlsx = client.post("/export/xlsx", json=body)
    assert xlsx.status_code == 200
    assert xlsx.content[:2] == b"PK"  # xlsx is a zip

    pdf = client.post("/export/pdf", json=body)
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"
