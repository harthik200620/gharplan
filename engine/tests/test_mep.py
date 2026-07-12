"""The MEP coordination model (``app.services.mep_model``) must stay in
lock-step with ``web/lib/mep.ts``: whole-house plant nodes (OHT, sump, pump,
meter, inspection chamber, septic, rainwater pit) and the final electrical
sub-circuits off the DB with their MCB ratings."""

from __future__ import annotations

from app.services.mep_model import (
    ElecPoint,
    build_mep_model,
    electrical_load_summary,
    fire_checklist,
    room_tonnage,
    septic_size,
)
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


# --------------------------------------------------------------------------- #
# Planning intelligence: wire sizing, load summary, septic, cooling, fire
# --------------------------------------------------------------------------- #


def test_circuit_wire_sizes_follow_mcb_table(sample_plan):
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    assert m.circuits
    for ck in m.circuits:
        assert ck.wire_sqmm in {1.0, 1.5, 2.5, 4.0, 6.0}
    by_name = {ck.name: ck for ck in m.circuits}
    # lighting rides a 6A MCB on 1.0 sqmm; power (16A) on 2.5 sqmm Cu
    assert by_name["Lighting"].mcb_a == 6 and by_name["Lighting"].wire_sqmm == 1.0
    assert by_name["Power"].mcb_a == 16 and by_name["Power"].wire_sqmm == 2.5


def test_electrical_load_summary_exact_values():
    # 2 lights (60 W) + 1 AC (1500 W) + 1 geyser (2000 W) = 3620 W connected
    pts = [
        ElecPoint(id="l0", room_id="r", kind="light", x=0.0, y=0.0),
        ElecPoint(id="l1", room_id="r", kind="light", x=0.0, y=0.0),
        ElecPoint(id="a0", room_id="r", kind="ac", x=0.0, y=0.0),
        ElecPoint(id="g0", room_id="r", kind="geyser", x=0.0, y=0.0),
    ]
    s = electrical_load_summary(pts)
    assert s["connectedLoadKw"] == 3.62
    assert s["demandLoadKw"] == 2.17  # 3620 * 0.6 = 2172 W
    assert s["diversityFactor"] == 0.6
    assert s["recommendedService"] == "1-phase"
    assert "DISCOM" in s["note"]


def test_summary_gains_load_keys_additively(sample_plan):
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    # the pre-existing clash counters survive the merge …
    assert "errors" in m.summary and "warns" in m.summary
    # … and the service-connection numbers ride along
    assert m.summary["connectedLoadKw"] > 0
    assert m.summary["demandLoadKw"] < m.summary["connectedLoadKw"]
    assert m.summary["recommendedService"] in ("1-phase", "3-phase")


def test_septic_size_picks_smallest_sufficient_row():
    s = septic_size(6)  # 6 occupants need the 10-user tank
    assert (s["users"], s["lengthM"], s["widthM"], s["depthM"]) == (10, 2.0, 0.9, 1.0)
    assert s["capacityL"] == 1800
    # beyond the table the 20-user row is the cap
    assert septic_size(50)["users"] == 20


def test_septic_node_label_carries_size(sample_plan):
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    septic = next(n for n in m.nodes if n.kind == "septic")
    assert "ST " in septic.label and "users" in septic.label
    # occupants ~ 2 per bedroom + 2 → the matching IS 2470-1 row is in the label
    beds = [r for r in plan.rooms if "bed" in r.type.value or "bed" in r.id]
    s = septic_size(len(beds) * 2 + 2)
    assert f"({s['users']} users)" in septic.label


def test_room_tonnage_quarter_ton_rounding():
    # 12 m² × 0.065 = 0.78 T → ×4 = 3.12 → rounds to 3 quarters = 0.75 T
    assert room_tonnage(12) == 0.75
    # small rooms floor at 0.5 T
    assert room_tonnage(1) == 0.5
    # 20 m² × 0.065 = 1.3 T → 5.2 quarters → 1.25 T
    assert room_tonnage(20) == 1.25


def test_hvac_estimates_cover_habitable_rooms_only(sample_plan):
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    habitable = {r.id for r in m.rooms if "living" in r.type.value or "bed" in r.type.value}
    assert habitable
    assert {h["roomId"] for h in m.hvac} == habitable
    for h in m.hvac:
        # quarter-ton steps with the 0.5 T floor
        assert h["tons"] >= 0.5 and h["tons"] * 4 == int(h["tons"] * 4)


def test_fire_checklist_triggers_above_15m():
    assert fire_checklist(10) == []
    rows = fire_checklist(16)
    assert rows
    assert all("NBC 2016 Part 4" in r["ref"] for r in rows)
    items = " ".join(r["item"] for r in rows)
    assert "NOC" in items and "22.5" in items


def test_low_rise_plans_are_fire_exempt(sample_plan):
    plan, _ = normalize(sample_plan)
    plan.plot.floors = 4  # 4 × 3.0 + 1.0 = 13 m ≤ 15 m
    m = build_mep_model(plan)
    assert m.fire == []
    plan.plot.floors = 5  # 16 m > 15 m — the NBC checklist kicks in
    m = build_mep_model(plan)
    assert m.fire and all("NBC 2016 Part 4" in r["ref"] for r in m.fire)


def test_fire_safety_layout_is_placed_on_every_house(sample_plan):
    """Independent of the >15 m NBC checklist trigger, every house gets an
    indicative fire-safety LAYOUT: a detector in each habitable room + kitchen,
    extinguishers by the kitchen and the exit, an EXIT sign, and an escape route."""
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    kinds = [f.kind for f in m.fire_points]
    assert kinds.count("smoke_detector") >= 3  # living + bedrooms + kitchen
    assert kinds.count("extinguisher") == 2  # kitchen + main exit
    assert kinds.count("exit_sign") == 1
    assert len(m.fire_route) >= 2  # a real escape polyline to the exit


def test_earthing_layout_present(sample_plan):
    """Every DB gets a safety earth: an earth pit node + an earth conductor from the
    DB body to the pit (core to any Indian electrical layout)."""
    plan, _ = normalize(sample_plan)
    m = build_mep_model(plan)
    assert any(n.kind == "earthpit" for n in m.nodes)
    earth = [c for c in m.conduits if c.kind == "earth"]
    assert len(earth) == 1 and len(earth[0].points) >= 2
