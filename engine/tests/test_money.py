"""Money math — ROUND_HALF_UP and exact GST split."""

from __future__ import annotations

from decimal import Decimal

from app.services.money import gst_split, q2


def test_half_up_not_bankers_rounding():
    # Python's round() (banker's) would give 0.12 / 2.34 here.
    assert q2(Decimal("0.125")) == Decimal("0.13")
    assert q2(Decimal("0.135")) == Decimal("0.14")
    assert q2(Decimal("2.345")) == Decimal("2.35")
    assert q2(2.344) == Decimal("2.34")


def test_gst_split_even():
    gst, cgst, sgst = gst_split(Decimal("100.00"), Decimal("18"))
    assert gst == Decimal("18.00")
    assert cgst == Decimal("9.00")
    assert sgst == Decimal("9.00")
    assert cgst + sgst == gst


def test_gst_split_odd_remainder():
    gst, cgst, sgst = gst_split(Decimal("100.05"), Decimal("18"))
    assert gst == Decimal("18.01")
    assert cgst == Decimal("9.00")
    assert sgst == Decimal("9.01")  # remainder absorbs the rounding
    assert cgst + sgst == gst
