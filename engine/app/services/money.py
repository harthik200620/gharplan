"""Money math — Decimal with ROUND_HALF_UP (Indian GST convention).

Python's built-in ``round`` uses banker's rounding on binary floats, which would
silently disagree with any accountant's spreadsheet / Tally. All rupee amounts go
through :func:`q2` so the BOQ reconciles to the paise.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

TWO_PLACES = Decimal("0.01")


def to_decimal(x: float | int | str | Decimal) -> Decimal:
    """Safely build a Decimal (via str, never directly from a binary float)."""
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


def q2(x: float | int | str | Decimal) -> Decimal:
    """Quantize to 2 decimals, half-up."""
    return to_decimal(x).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def gst_split(amount: Decimal, pct: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    """Return (gst, cgst, sgst) for an intra-state supply.

    ``sgst`` is the remainder (``gst - cgst``) so that ``cgst + sgst == gst``
    exactly, with no double rounding.
    """
    gst = q2(amount * pct / Decimal(100))
    cgst = q2(amount * pct / Decimal(200))
    sgst = gst - cgst
    return gst, cgst, sgst
