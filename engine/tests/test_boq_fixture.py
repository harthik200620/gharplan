"""BOQ invariants against the realistic 30x40 fixture (seeded rates)."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models.boq import BoqOptions, ExtraLine, LineOverride
from app.models.enums import City, FinishTier
from app.services.boq_service import generate_boq
from app.services.plan_service import normalize
from app.services.rates import get_rates_provider
from app.services.rules import get_boq_rules


def _gen(plan, tier=FinishTier.standard, **kw):
    return generate_boq(plan, City.Bengaluru, tier, get_rates_provider(), get_boq_rules(), **kw)


def test_fixture_invariants(sample_plan):
    plan, _ = normalize(sample_plan)
    rep = _gen(plan)
    zero = Decimal("0")

    assert all(ln.qty >= 0 for ln in rep.lines)
    # Grand total = works subtotal + GST + the data-driven site contingency
    # (contingencyPct in boq_rules.json), with contingency quantised to paise.
    assert rep.summary.grand_total == (
        rep.summary.subtotal + rep.summary.gst_total + rep.summary.contingency
    )
    assert rep.summary.contingency == rep.summary.contingency.quantize(Decimal("0.01"))
    assert rep.summary.contingency > zero  # real rules carry a non-zero policy pct
    assert rep.summary.cgst_total + rep.summary.sgst_total == rep.summary.gst_total
    assert rep.summary.grand_total == (
        sum((ln.total for ln in rep.lines), zero) + rep.summary.contingency
    )
    assert rep.summary.grand_total > zero

    for ln in rep.lines:
        assert ln.total == ln.amount + ln.gst_amount
        assert ln.material_rate + ln.labour_rate > 0  # no silent zero-rate line

    # door / window counted once (no double-count across rooms)
    door_nos = sum(ln.qty for ln in rep.lines if ln.item_code.startswith("DOR"))
    win_nos = sum(ln.qty for ln in rep.lines if ln.item_code.startswith("WIN"))
    assert door_nos == sum(o.count for o in plan.doors)
    assert win_nos == sum(o.count for o in plan.windows)

    # virtual / point room types never produce lines
    excluded = {"brahmasthan", "borewell", "overhead_tank"}
    assert not any(ln.room_type in excluded for ln in rep.lines)

    # waterproofing lines == count of wet rooms present
    wet = {"toilet", "bathroom", "utility", "balcony"}
    wet_rooms = [r for r in plan.rooms if r.type.value in wet]
    wpf = [ln for ln in rep.lines if ln.item_code.startswith("WPF")]
    assert len(wpf) == len(wet_rooms)


def test_finish_tier_ordering(sample_plan):
    plan, _ = normalize(sample_plan)
    eco = _gen(plan, FinishTier.economy).summary.grand_total
    std = _gen(plan, FinishTier.standard).summary.grand_total
    prm = _gen(plan, FinishTier.premium).summary.grand_total
    assert eco < std < prm


def test_false_ceiling_toggle(sample_plan):
    plan, _ = normalize(sample_plan)
    base = _gen(plan)
    with_fc = _gen(plan, options=BoqOptions(false_ceiling_room_ids=["living"]))
    fc_lines = [ln for ln in with_fc.lines if ln.item_code.startswith("FCL")]
    assert len(fc_lines) == 1
    assert fc_lines[0].room_id == "living"
    assert with_fc.summary.grand_total > base.summary.grand_total


def test_editable_override_and_remove(sample_plan):
    plan, _ = normalize(sample_plan)
    base = _gen(plan)
    target = next(ln for ln in base.lines if ln.item_code == "FLR-VIT")

    # override quantity -> amount tracks the new qty
    edited = _gen(plan, overrides=[LineOverride(line_id=target.id, qty=target.qty + 10)])
    new_line = next(ln for ln in edited.lines if ln.id == target.id)
    assert new_line.edited is True
    assert new_line.qty == pytest.approx(target.qty + 10)
    assert new_line.amount > target.amount

    # remove a line -> it disappears and total drops
    removed = _gen(plan, options=BoqOptions(remove_line_ids=[target.id]))
    assert not any(ln.id == target.id for ln in removed.lines)
    assert removed.summary.grand_total < base.summary.grand_total


def test_extra_custom_line(sample_plan):
    plan, _ = normalize(sample_plan)
    base = _gen(plan)
    extra = ExtraLine(
        description="Modular kitchen",
        unit="rft",
        qty=12,
        material_rate=Decimal("1900"),
        labour_rate=Decimal("450"),
        trade="Modular",
    )
    out = _gen(plan, extra_lines=[extra])
    assert out.summary.line_count == base.summary.line_count + 1
    assert out.summary.grand_total > base.summary.grand_total
