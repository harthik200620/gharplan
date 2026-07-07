"""Anchor tests for the preliminary structural module (app.structural).

Each anchor pins the arithmetic to tolerance bands from published IS 456 / IS 1893
worked examples so a regression in any formula trips a band, not an exact float.
"""

from __future__ import annotations

import math
import re
import time

from fastapi.testclient import TestClient

from app.generator.designer import generate_plan
from app.main import app
from app.models.enums import City, Facing, StateCode
from app.models.plan import Plot
from app.structural import design_structure
from app.structural.beam import design_beam
from app.structural.column import design_column
from app.structural.footing import design_footing
from app.structural.grid import ColumnPoint
from app.structural.loads import column_load_takedown
from app.structural.seismic import assess_seismic
from app.structural.slab import design_slab


def _cp(trib_m2: float) -> ColumnPoint:
    side = trib_m2**0.5
    return ColumnPoint(
        id="C-T1", label="T1", x=4.0, y=4.0,
        trib_area_m2=trib_m2, trib_lx_m=side, trib_ly_m=side,
    )


def _real_plan(floors: int = 2):
    plan, _, _, _ = generate_plan(
        3,
        Plot(
            width_m=9.144, depth_m=12.192, facing=Facing.E,
            state=StateCode.KA, city=City.Bengaluru, floors=floors,
        ),
        floors=floors,
    )
    return plan


# --- 1. Two-way slab 3.0 x 4.0 m, LL 2.0 kPa, M20/Fe500 ------------------------
def test_two_way_slab_anchor():
    m, bars = design_slab(3.0, 4.0, fck=20.0, fy=500.0, ll_kpa=2.0)
    assert m.kind == "slab"
    assert 110 <= (m.thickness_mm or 0) <= 140
    match = re.search(r"8# @ (\d+) c/c", m.rebar)
    assert match, f"expected 8 mm main steel in: {m.rebar}"
    assert 100 <= int(match.group(1)) <= 200
    assert m.utilization <= 1.0
    assert bars and all(b["count"] > 0 for b in bars)


# --- 2. Beam 3.6 m span, w = 20 kN/m factored ----------------------------------
def test_beam_anchor():
    m, _ = design_beam(3.6, 20.0, fck=20.0, fy=500.0, beam_id="B1")
    assert 30.0 <= m.design_forces["Mu_kNm"] <= 36.0
    b, depth = m.size_mm
    assert b == 230 and 380 <= depth <= 450
    mt = re.match(r"(\d+)-(\d+)#", m.rebar)
    assert mt, m.rebar
    count, dia = int(mt.group(1)), int(mt.group(2))
    assert 2 <= count <= 3 and 12 <= dia <= 16
    assert m.utilization <= 1.0


# --- 3. Interior G+1 column, tributary 12 m² -----------------------------------
def test_column_anchor():
    pu = column_load_takedown(_cp(12.0), floors=2)
    assert 350.0 <= pu <= 650.0
    m, _ = design_column(pu, fck=20.0, fy=500.0, col_id="C-T1", floors=2)
    assert m.size_mm in {(230, 230), (230, 300), (230, 380), (230, 450)}
    mt = re.match(r"(\d+)-(\d+)#", m.rebar)
    count, dia = int(mt.group(1)), int(mt.group(2))
    asc = count * math.pi * dia * dia / 4.0
    pct = 100.0 * asc / (m.size_mm[0] * m.size_mm[1])
    assert pct >= 0.8, f"longitudinal steel {pct:.2f}% below Cl.26.5.3.1 minimum"
    assert m.utilization <= 1.0


# --- 4. Footing on medium clay (SBC 100 kPa), P_service ~ 333 kN ----------------
def test_footing_anchor():
    m, _ = design_footing(500.0, 100.0, footing_id="F1")  # Pu/1.5 = 333.3 kN
    side_m = m.size_mm[0] / 1000.0
    assert 1.8 <= side_m <= 2.2
    assert side_m * side_m >= 500.0 / 1.5 / 100.0  # provided area covers required
    assert m.utilization <= 1.0
    assert "12#" in m.rebar


# --- 5. Hyderabad Zone II, G+1 ---------------------------------------------------
def test_seismic_anchor():
    s = assess_seismic("Hyderabad", floors=2, footprint_area_m2=100.0, wall_length_m=60.0)
    assert s["zone"] == "II"
    assert 0.01 <= s["Ah"] <= 0.05
    pct = 100.0 * s["baseShear_kN"] / s["seismicWeight_kN"]
    assert 1.0 <= pct <= 5.0
    assert s["clause"].startswith("IS 1893")


# --- 6. Full design on a REAL generated plan ------------------------------------
def test_design_structure_on_generated_plan():
    plan = _real_plan(floors=2)
    t0 = time.perf_counter()
    design = design_structure(plan)
    assert time.perf_counter() - t0 < 2.0, "design_structure must stay < 2 s for a G+1"

    columns = [m for m in design.members if m.kind == "column"]
    slabs = [m for m in design.members if m.kind == "slab"]
    footings = [m for m in design.members if m.kind == "footing"]
    assert len(columns) >= 4
    assert len(slabs) >= 1
    assert len(footings) == len(columns)
    assert all(m.utilization <= 1.05 for m in design.members), [
        (m.id, m.utilization) for m in design.members if m.utilization > 1.05
    ]
    assert design.disclaimer and "NOT for construction" in design.disclaimer
    assert "approved" not in design.disclaimer.lower()
    assert all(m.clause_refs for m in design.members)
    assert design.grid and design.bbs and design.design_basis
    assert all(c.x_m is not None and c.y_m is not None for c in columns + footings)


# --- 7. Future-floor provision ----------------------------------------------------
def test_future_floor_provision():
    plan = _real_plan(floors=2)
    base = design_structure(plan)
    future = design_structure(plan, future_floors=1)
    assert future.future_floor_provision and not base.future_floor_provision

    def max_ag(d):
        return max(m.size_mm[0] * m.size_mm[1] for m in d.members if m.kind == "column")

    def max_pu(d):
        return max(m.design_forces["Pu_kN"] for m in d.members if m.kind == "column")

    assert max_ag(future) >= max_ag(base)
    assert max_pu(future) > max_pu(base)


# --- Router: POST /plan/structural (camelCase wire format) -----------------------
def test_structural_endpoint():
    plan = _real_plan(floors=2)
    client = TestClient(app)
    body = {"plan": plan.model_dump(mode="json", by_alias=True), "futureFloors": 0}
    resp = client.post("/plan/structural", json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["schemaVersion"] == "1.0"
    assert data["concreteGrade"] in ("M20", "M25") and data["steelGrade"] == "Fe500"
    assert data["members"] and "sizeMm" in data["members"][0]
    assert data["seismic"]["zone"] in ("II", "III")
    assert data["disclaimer"].startswith("Preliminary structural design")
