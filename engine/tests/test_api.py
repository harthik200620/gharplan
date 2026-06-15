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
