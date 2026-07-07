"""BOQ math against a synthetic 1-room plan with known round rates.

These pin EXACT quantities (geometry-derived, stable) and EXACT rupee amounts
(Decimal, half-up) so any regression in the takeoff or money pipeline trips here.
"""

from __future__ import annotations

from decimal import Decimal

from app.models.enums import City, FinishTier
from app.services.boq_service import generate_boq
from app.services.plan_service import normalize
from app.services.rules import BoqRules


def _line(report, item_code):
    return next(ln for ln in report.lines if ln.item_code == item_code)


def test_boq_synthetic_exact(synthetic_plan, test_rates, boq_rules):
    plan, _ = normalize(synthetic_plan)
    # Zero the policy layers (metro labour factor, site contingency) so this test
    # pins the PURE takeoff+money pipeline; policy invariants live in
    # test_boq_fixture.py against the real rules.
    pure_rules = BoqRules({**boq_rules.raw, "labourCityFactor": {}, "contingencyPct": 0})
    rep = generate_boq(plan, City.Bengaluru, FinishTier.standard, test_rates, pure_rules)

    # --- geometry-derived quantities (4m x 3m room, ceiling 3.0) ---
    assert _line(rep, "FLR-VIT").qty == 12.96  # 12 * 1.08
    assert _line(rep, "SKB-VIT").qty == 13.0  # perimeter 14 - door width 1.0
    assert _line(rep, "PLS-CEM").qty == 38.1  # 14*3 - (2.1 + 1.8)
    assert _line(rep, "PUT-WAL").qty == 50.1  # 38.1 + 12 (ceiling)
    assert _line(rep, "PRM-WAL").qty == 50.1
    assert _line(rep, "PNT-STD").qty == 50.1
    assert _line(rep, "DOR-FL8").qty == 1.0
    assert _line(rep, "WIN-UPV").qty == 1.0
    assert _line(rep, "ELE-PT").qty == 6.0  # bedroom lookup

    # --- money (exact, ROUND_HALF_UP) ---
    fl = _line(rep, "FLR-VIT")
    assert fl.amount == Decimal("12960.00")  # 12.96 * 1000
    assert fl.gst_amount == Decimal("2332.80")
    assert fl.cgst_amount == Decimal("1166.40")
    assert fl.sgst_amount == Decimal("1166.40")
    assert fl.total == Decimal("15292.80")

    assert _line(rep, "PLS-CEM").amount == Decimal("5715.00")  # 38.1 * 150
    assert _line(rep, "PLS-CEM").gst_amount == Decimal("1028.70")
    assert _line(rep, "PUT-WAL").amount == Decimal("2505.00")  # 50.1 * 50
    assert _line(rep, "PRM-WAL").amount == Decimal("2004.00")  # 50.1 * 40
    assert _line(rep, "PNT-STD").amount == Decimal("3006.00")  # 50.1 * 60
    assert _line(rep, "SKB-VIT").amount == Decimal("2600.00")  # 13 * 200
    assert _line(rep, "DOR-FL8").amount == Decimal("5000.00")
    assert _line(rep, "WIN-UPV").amount == Decimal("7000.00")
    assert _line(rep, "ELE-PT").amount == Decimal("3600.00")

    # --- no wet-area / plumbing lines for a bedroom ---
    assert not any(ln.item_code in ("WTL-CER", "WPF-STD") for ln in rep.lines)
    assert not any(ln.trade == "Plumbing" for ln in rep.lines)

    # --- aggregation invariants ---
    zero = Decimal("0")
    assert rep.summary.subtotal == sum((ln.amount for ln in rep.lines), zero)
    assert rep.summary.gst_total == sum((ln.gst_amount for ln in rep.lines), zero)
    assert rep.summary.cgst_total + rep.summary.sgst_total == rep.summary.gst_total
    assert rep.summary.grand_total == rep.summary.subtotal + rep.summary.gst_total
    assert rep.summary.grand_total == sum((ln.total for ln in rep.lines), zero)
    assert rep.summary.subtotal == Decimal("44390.00")  # pinned

    for ln in rep.lines:
        assert ln.total == ln.amount + ln.gst_amount
        assert ln.cgst_amount + ln.sgst_amount == ln.gst_amount
