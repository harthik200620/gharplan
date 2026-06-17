"""The MEP coordination model (``app.services.mep_model``) must stay in
lock-step with ``web/lib/mep.ts``: whole-house plant nodes (OHT, sump, pump,
meter, inspection chamber, septic, rainwater pit) and the final electrical
sub-circuits off the DB with their MCB ratings."""

from __future__ import annotations

from app.services.mep_model import build_mep_model
from app.services.plan_service import normalize


def test_model_carries_whole_house_plant_nodes(sample_plan):
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)

    kinds = {n.kind for n in m.nodes}
    # water + drainage + rainwater + meter plant all present
    assert "oht" in kinds
    assert "septic" in kinds
    assert {"sump", "pump", "inspection", "rainpit", "meter"} <= kinds
    # the OHT carries its capacity label, the septic tank its name
    oht = next(n for n in m.nodes if n.kind == "oht")
    assert oht.label == "OHT 1000L"


def test_supply_and_outlet_mains_are_routed(sample_plan):
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    ids = {p.id for p in m.pipes}
    # pump riser + OHT down-take + soil outlet to septic + two rainwater downpipes
    assert {"supply-riser", "downtake", "soil-outlet", "rwp-0", "rwp-1"} <= ids
    soil = next(p for p in m.pipes if p.id == "soil-outlet")
    assert soil.size_mm == 110 and soil.slope == "1:40"


def test_circuits_match_indian_db_loading(sample_plan):
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    by_name = {ck.name: ck for ck in m.circuits}

    # a Lighting circuit (6A) and a Pump circuit (always present, 16A) exist
    assert "Lighting" in by_name
    assert by_name["Lighting"].mcb_a == 6 and by_name["Lighting"].phase == "1ph"
    assert "Pump" in by_name
    assert by_name["Pump"].mcb_a == 16 and by_name["Pump"].points == 1

    # circuits come back in the canonical order, filtered to those in use (+ Pump)
    order = ["Lighting", "Power", "Kitchen/Power", "AC", "Geyser", "Pump"]
    got = [ck.name for ck in m.circuits]
    assert got == [n for n in order if n in by_name]

    # every non-(switchboard/db) point gets tagged with its sub-circuit
    for ep in m.elec:
        if ep.kind in ("switchboard", "db"):
            continue
        assert ep.circuit in by_name


def test_lighting_circuit_count_tracks_tagged_points(sample_plan):
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    light = next(ck for ck in m.circuits if ck.name == "Lighting")
    tagged = [e for e in m.elec if e.circuit == "Lighting"]
    assert light.points == len(tagged) and light.points > 0
