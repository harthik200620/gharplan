"""Jurisdiction rule-pack resolver tests (fixtures/rulepacks/*).

Table-driven against cases/residential-cases.json (the pack data's own
expectations, per fixtures/rulepacks/schema.md band semantics), plus resolver
routing, inheritance, TG-vs-AP differential, citation plumbing through
check_code, and a KA legacy-path regression guard.
"""

from __future__ import annotations

import json

import pytest

from app import config
from app.generator.designer import generate_plan
from app.models.enums import City, Facing, StateCode
from app.models.plan import Plot
from app.services.code_service import check_code
from app.services.plan_service import normalize
from app.services.rules import (
    JurisdictionPack,
    get_code_rules,
    get_rulepack,
    resolve_jurisdiction,
)

CASES_PATH = config.FIXTURES_DIR / "rulepacks" / "cases" / "residential-cases.json"
CASES = json.loads(CASES_PATH.read_text(encoding="utf-8"))

PACK_ONLY_RULE_IDS = {"height_vs_road", "rwh_mandate", "instant_approval"}


# ---- table-driven pack evaluation --------------------------------------------------


@pytest.mark.parametrize("case", CASES, ids=[c["case"] for c in CASES])
def test_residential_case_table(case):
    pack = get_rulepack(case["packId"])
    exp = case["expect"]
    band = pack.setback_for(
        pack.raw["state"],
        case["plotAreaSqm"],
        road_w_m=case["roadWidthM"],
        height_m=case["heightM"],
    )
    for key in ("frontM", "rearM", "sideM"):
        if key in exp:
            assert band[key] == exp[key], f"{case['case']}: {key}"
    if "maxHeightM" in exp:
        assert pack.max_height_for(case["roadWidthM"]) == exp["maxHeightM"], case["case"]
    if "farAllowed" in exp:
        assert pack.far_allowed() == exp["farAllowed"], case["case"]
    if "instantApprovalEligible" in exp:
        got = pack.instant_approval_eligible(case["plotAreaSqm"], case["heightM"])
        assert got == exp["instantApprovalEligible"], case["case"]
    if case.get("cornerPlot") and "cornerSecondFront" in exp:
        assert pack.corner_second_front() == exp["cornerSecondFront"], case["case"]


def test_every_setback_band_carries_a_source():
    # The data law: no silent legal guesses — grep-equivalent enforcement.
    for pack_id in (
        "tg-ghmc",
        "tg-ulb-common",
        "ap-dpms-common",
        "ap-crda",
        "ap-tuda",
        "ap-vmrda",
        "ka-legacy",
    ):
        pack = get_rulepack(pack_id)
        for band in pack.raw.get("setbacks", []):
            src = band.get("source")
            assert isinstance(src, dict) and src.get("ref"), f"{pack_id}: band missing source"
            assert src.get("confidence") in ("verified", "needs_verification"), pack_id


# ---- inheritance + routing ----------------------------------------------------------


def test_ap_authorities_inherit_dpms_bands():
    root = get_rulepack("ap-dpms-common")
    for pid in ("ap-crda", "ap-tuda", "ap-vmrda"):
        child = get_rulepack(pid)
        assert child.pack_id == pid  # identity keys override
        assert child.raw["setbacks"] == root.raw["setbacks"]
        assert child.far_allowed() == root.far_allowed()
        assert child.rwh_threshold_sqm() == root.rwh_threshold_sqm()


def test_resolver_routing():
    assert resolve_jurisdiction("TG", "Hyderabad").pack_id == "tg-ghmc"
    assert resolve_jurisdiction("TG", "Warangal").pack_id == "tg-ulb-common"
    assert resolve_jurisdiction("AP", "Tirupati").pack_id == "ap-tuda"
    assert resolve_jurisdiction("AP", "Visakhapatnam").pack_id == "ap-vmrda"
    assert resolve_jurisdiction("AP", "Vijayawada").pack_id == "ap-crda"
    assert resolve_jurisdiction("AP", "Kurnool").pack_id == "ap-dpms-common"
    # ulb_hint override wins when it names a real pack; bogus hints fall through.
    assert resolve_jurisdiction("TG", "Hyderabad", ulb_hint="tg-ulb-common").pack_id == "tg-ulb-common"
    assert resolve_jurisdiction("TG", "Hyderabad", ulb_hint="no-such-pack").pack_id == "tg-ghmc"


def test_ka_resolves_to_its_real_jurisdiction_pack():
    ka = resolve_jurisdiction("KA", "Bengaluru")
    assert isinstance(ka, JurisdictionPack)
    assert ka.pack_id == "ka-legacy"


def test_tg_vs_ap_regimes_differ():
    tg = get_rulepack("tg-ghmc")
    ap = get_rulepack("ap-dpms-common")
    # The headline regime difference: TG models no separate FAR cap (setback/
    # height-controlled envelope); AP keeps a numeric FAR.
    assert tg.far_allowed() is None
    assert ap.far_allowed() is not None


# ---- pack flowing through the real pipeline ----------------------------------------


def _plot(state: StateCode, city: City, floors: int = 1) -> Plot:
    return Plot(
        width_m=9.144, depth_m=12.192, facing=Facing.E, state=state, city=city, floors=floors
    )


def test_tg_pack_generation_end_to_end_citations_and_zero_fails():
    pack = resolve_jurisdiction("TG", "Hyderabad")
    plan, _vastu, code, _meta = generate_plan(
        2, _plot(StateCode.TG, City.Hyderabad), floors=1, code_rules=pack
    )
    assert code.summary.fail_count == 0
    by_id = {c.rule_id: c for c in code.checks}

    # Clause citations attached to the pack-defined checks.
    for rid in ("ground_coverage", "setbacks"):
        assert by_id[rid].citation, f"{rid} missing citation"
        assert by_id[rid].confidence in ("verified", "needs_verification")

    # TG regime: FAR is an informational no-cap check, clearly explained.
    assert by_id["far"].status == "pass"
    assert by_id["far"].required == "no separate FAR cap"

    # Pack-only intelligence present; height passes for a single-storey house.
    assert "height_vs_road" in by_id
    assert by_id["height_vs_road"].status == "pass"
    # 111.5 m2 plot < 200 m2 RWH threshold and > instant-approval envelope:
    assert "rwh_mandate" not in by_id
    assert "instant_approval" not in by_id
    # Legacy road width was assumed — the message says so honestly.
    assert "9.0 m" in by_id["height_vs_road"].message


def test_ka_legacy_checks_unchanged(sample_plan):
    plan, _ = normalize(sample_plan)
    legacy = check_code(plan, get_code_rules())
    ids = {c.rule_id for c in legacy.checks}
    assert not ids & PACK_ONLY_RULE_IDS
    assert all(c.citation is None for c in legacy.checks)
    assert all(c.confidence == "needs_verification" for c in legacy.checks)  # model default
