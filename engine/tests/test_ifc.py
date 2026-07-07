"""IFC4 exporter — structural STEP assertions on a real generated plan.

The gate is the hand-rolled STEP checks below (header, entity counts against
the canonical plan/opening/structural models, unique ids, balanced parens).
An ifcopenshell round-trip is exercised out-of-band in a throwaway venv when a
wheel is available for the local interpreter; it is intentionally NOT a test
dependency.
"""

from __future__ import annotations

import re

import pytest

from app.exporters.ifc import SKIP_TYPES, build_ifc
from app.generator.designer import generate_plan
from app.models.enums import City, Facing, StateCode
from app.models.plan import Plot
from app.services.cad_geom import floors_of, place_openings
from app.structural import design_structure


def _plot(floors: int = 2) -> Plot:
    return Plot(
        width_m=9.144, depth_m=12.192, facing=Facing.E,
        state=StateCode.KA, city=City.Bengaluru, floors=floors,
    )


@pytest.fixture(scope="module")
def gen_plan():
    plan, _, _, _ = generate_plan(3, _plot(2), floors=2)
    return plan


@pytest.fixture(scope="module")
def ifc_bytes(gen_plan):
    return build_ifc(gen_plan)


def test_header_and_schema(ifc_bytes):
    assert ifc_bytes.startswith(b"ISO-10303-21")
    assert b"FILE_SCHEMA(('IFC4'))" in ifc_bytes
    assert b"FILE_DESCRIPTION(('ViewDefinition [ReferenceView]')" in ifc_bytes
    assert ifc_bytes.rstrip().endswith(b"END-ISO-10303-21;")


def test_space_per_real_room_and_storey_per_floor(gen_plan, ifc_bytes):
    real = [r for r in gen_plan.rooms if r.type.value not in SKIP_TYPES]
    assert real, "generated plan should have real rooms"
    assert ifc_bytes.count(b"=IFCSPACE(") == len(real)
    floors = floors_of(gen_plan)
    assert len(floors) == 2
    assert ifc_bytes.count(b"=IFCBUILDINGSTOREY(") == len(floors)


def test_door_window_counts_match_opening_model(gen_plan, ifc_bytes):
    placed = place_openings(gen_plan)
    doors = [o for o in placed if o.kind == "door"]
    windows = [o for o in placed if o.kind == "window"]
    assert doors and windows
    assert ifc_bytes.count(b"=IFCDOOR(") == len(doors)
    assert ifc_bytes.count(b"=IFCWINDOW(") == len(windows)


def test_walls_present_and_deduplicated(gen_plan, ifc_bytes):
    real = [r for r in gen_plan.rooms if r.type.value not in SKIP_TYPES]
    n_walls = ifc_bytes.count(b"=IFCWALLSTANDARDCASE(")
    assert n_walls > 0
    # shared room edges must collapse to a single wall each
    assert n_walls < 4 * len(real)


def test_structural_members_map_to_ifc(gen_plan):
    structural = design_structure(gen_plan)
    data = build_ifc(gen_plan, structural)
    cols = [m for m in structural.members if m.kind == "column" and m.x_m is not None]
    foots = [m for m in structural.members if m.kind == "footing" and m.x_m is not None]
    assert cols and foots
    assert data.count(b"=IFCCOLUMN(") == len(cols)
    assert data.count(b"=IFCFOOTING(") == len(foots)


def test_step_syntax_sanity(gen_plan):
    structural = design_structure(gen_plan)
    text = build_ifc(gen_plan, structural).decode("ascii")
    ids = re.findall(r"^#(\d+)=", text, flags=re.M)
    assert ids and len(ids) == len(set(ids)), "entity ids must be unique"
    for line in text.splitlines():
        assert line.count("(") == line.count(")"), f"unbalanced parens: {line}"
    # every #id reference resolves to a defined entity (and vice versa)
    assert set(re.findall(r"#(\d+)", text)) == set(ids)


def test_deterministic_output(gen_plan):
    assert build_ifc(gen_plan) == build_ifc(gen_plan)
