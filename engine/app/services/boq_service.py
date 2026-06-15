"""BOQ takeoff — generate an itemized, GST'd Bill of Quantities from plan geometry.

This is the product's moat: room polygons drive the quantities. Guards from the
design review are applied: skirting and wall-plaster are clamped at 0 (with a
warning when the raw value was negative); in tiled wet areas the dado band is
subtracted from plaster so tile and plaster are never billed on the same m2;
door/window counts are attributed once via the opening's single ``roomId``.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.models.boq import (
    BoqGroup,
    BoqLine,
    BoqOptions,
    BoqReport,
    BoqSummary,
    ExtraLine,
    LineOverride,
)
from app.models.enums import City, FinishTier, room_label
from app.models.plan import Plan, Room
from app.services.money import gst_split, q2, to_decimal
from app.services.rates import RatesProvider
from app.services.rules import BoqRules

ZERO = Decimal("0")


@dataclass
class _RoomCtx:
    """Per-room quantities derived once from geometry, reused by every formula."""

    area: float
    perimeter: float
    ceiling: float
    door_width_sum: float
    door_count: int
    window_count: int
    wall_plaster_billed: float
    paintable: float
    skirting: float
    dado_area: float
    electrical: int
    plumbing: int


def _build_ctx(room: Room, plan: Plan, rules: BoqRules, warnings: list[str]) -> _RoomCtx:
    rdoors = [o for o in plan.doors if o.room_id == room.id]
    rwins = [o for o in plan.windows if o.room_id == room.id]
    door_width_sum = sum(o.width_m * o.count for o in rdoors)
    door_area = sum(o.width_m * o.height_m * o.count for o in rdoors)
    window_area = sum(o.width_m * o.height_m * o.count for o in rwins)

    area = room.area_sqm
    perimeter = room.perimeter_m
    ceiling = room.ceiling_height_m

    dado_h = rules.dado_height(room.type.value)
    dado_area = perimeter * dado_h if dado_h else 0.0

    wall_plaster_raw = perimeter * ceiling - (door_area + window_area)
    if wall_plaster_raw < 0:
        warnings.append(
            f"room '{room.id}': openings exceed wall area; wall plaster clamped to 0"
        )
    wall_plaster = max(0.0, wall_plaster_raw)
    # In tiled wet areas, tile substitutes plaster on the dado band.
    wall_plaster_billed = max(0.0, wall_plaster - dado_area) if dado_h else wall_plaster

    skirting = max(0.0, perimeter - door_width_sum)

    return _RoomCtx(
        area=area,
        perimeter=perimeter,
        ceiling=ceiling,
        door_width_sum=door_width_sum,
        door_count=sum(o.count for o in rdoors),
        window_count=sum(o.count for o in rwins),
        wall_plaster_billed=wall_plaster_billed,
        paintable=wall_plaster_billed + area,  # walls (above dado) + ceiling
        skirting=skirting,
        dado_area=dado_area,
        electrical=rules.electrical_points(room.type.value),
        plumbing=rules.plumbing_points(room.type.value),
    )


def _qty_for(formula: str, ctx: _RoomCtx, rules: BoqRules) -> float:
    if formula == "flooring":
        return ctx.area * rules.wastage("flooring", 1.08)
    if formula == "skirting":
        return ctx.skirting
    if formula == "wall_plaster":
        return ctx.wall_plaster_billed
    if formula == "paintable":
        return ctx.paintable
    if formula == "false_ceiling":
        return ctx.area
    if formula == "wall_tile_dado":
        return ctx.dado_area
    if formula == "waterproofing":
        return ctx.area
    if formula == "door_count":
        return float(ctx.door_count)
    if formula == "window_count":
        return float(ctx.window_count)
    if formula == "electrical_points":
        return float(ctx.electrical)
    if formula == "plumbing_points":
        return float(ctx.plumbing)
    raise ValueError(f"unknown BOQ formula '{formula}'")


def _make_line(
    *,
    line_id: str,
    room: Room | None,
    trade: str,
    item_code: str,
    description: str,
    unit: str,
    qty: float,
    material_rate: Decimal,
    labour_rate: Decimal,
    gst_percent: Decimal,
    hsn_code: str,
    edited: bool = False,
) -> BoqLine:
    qty_r = round(qty, 3)
    rate = material_rate + labour_rate
    amount = q2(to_decimal(qty_r) * rate)
    gst, cgst, sgst = gst_split(amount, gst_percent)
    return BoqLine(
        id=line_id,
        room_id=room.id if room else None,
        room_label=room_label(room.type.value) if room else None,
        room_type=room.type.value if room else None,
        trade=trade,
        item_code=item_code,
        description=description,
        unit=unit,
        qty=qty_r,
        material_rate=material_rate,
        labour_rate=labour_rate,
        rate=rate,
        amount=amount,
        hsn_code=hsn_code,
        gst_percent=gst_percent,
        gst_amount=gst,
        cgst_amount=cgst,
        sgst_amount=sgst,
        total=amount + gst,
        edited=edited,
    )


def _applies(item: dict, room: Room) -> bool:
    rt = room.type.value
    include = item.get("includeRoomTypes")
    exclude = set(item.get("excludeRoomTypes", []))
    if include is not None and rt not in include:
        return False
    if rt in exclude:
        return False
    return True


def _group(lines: list[BoqLine], key_fn, label_fn) -> list[BoqGroup]:
    order: list[str] = []
    buckets: dict[str, list[BoqLine]] = {}
    for ln in lines:
        k = key_fn(ln)
        if k not in buckets:
            buckets[k] = []
            order.append(k)
        buckets[k].append(ln)
    groups: list[BoqGroup] = []
    for k in order:
        grp = buckets[k]
        subtotal = sum((ln.amount for ln in grp), ZERO)
        gst_total = sum((ln.gst_amount for ln in grp), ZERO)
        groups.append(
            BoqGroup(
                key=k,
                label=label_fn(grp[0]),
                line_ids=[ln.id for ln in grp],
                subtotal=subtotal,
                gst_total=gst_total,
                total=subtotal + gst_total,
            )
        )
    return groups


def generate_boq(
    plan: Plan,
    city: City,
    finish_tier: FinishTier,
    rates: RatesProvider,
    rules: BoqRules,
    options: BoqOptions | None = None,
    overrides: list[LineOverride] | None = None,
    extra_lines: list[ExtraLine] | None = None,
) -> BoqReport:
    options = options or BoqOptions()
    tier = finish_tier.value
    city_name = city.value
    excluded = rules.excluded_types()
    false_ceiling = set(options.false_ceiling_room_ids)
    warnings: list[str] = []

    lines: list[BoqLine] = []
    for room in plan.rooms:
        if room.type.value in excluded:
            continue
        ctx = _build_ctx(room, plan, rules, warnings)
        for item in rules.items():
            formula = item["formula"]
            if not _applies(item, room):
                continue
            if item.get("optional") and formula == "false_ceiling" and room.id not in false_ceiling:
                continue
            qty = _qty_for(formula, ctx, rules)
            if qty <= 0:
                continue
            item_code = item["itemCodeByTier"][tier]
            rate = rates.get(city_name, item_code)
            lines.append(
                _make_line(
                    line_id=f"{room.id}:{item['key']}",
                    room=room,
                    trade=item["trade"],
                    item_code=item_code,
                    description=item["description"],
                    unit=item["unit"],
                    qty=qty,
                    material_rate=rate.material_rate,
                    labour_rate=rate.labour_rate,
                    gst_percent=rate.gst_percent,
                    hsn_code=rate.hsn_code,
                )
            )

    # ---- editable-BOQ adjustments ----
    if options.remove_line_ids:
        remove = set(options.remove_line_ids)
        lines = [ln for ln in lines if ln.id not in remove]

    if overrides:
        by_id = {ln.id: ln for ln in lines}
        rooms_by_id = {r.id: r for r in plan.rooms}
        for ov in overrides:
            old = by_id.get(ov.line_id)
            if not old:
                warnings.append(f"override for unknown line '{ov.line_id}' ignored")
                continue
            new = _make_line(
                line_id=old.id,
                room=rooms_by_id.get(old.room_id) if old.room_id else None,
                trade=old.trade,
                item_code=old.item_code,
                description=old.description,
                unit=old.unit,
                qty=ov.qty if ov.qty is not None else old.qty,
                material_rate=ov.material_rate if ov.material_rate is not None else old.material_rate,
                labour_rate=ov.labour_rate if ov.labour_rate is not None else old.labour_rate,
                gst_percent=old.gst_percent,
                hsn_code=old.hsn_code,
                edited=True,
            )
            lines[lines.index(old)] = new

    if extra_lines:
        rooms_by_id = {r.id: r for r in plan.rooms}
        for i, ex in enumerate(extra_lines):
            lines.append(
                _make_line(
                    line_id=f"extra:{i}:{ex.item_code}",
                    room=rooms_by_id.get(ex.room_id) if ex.room_id else None,
                    trade=ex.trade,
                    item_code=ex.item_code,
                    description=ex.description,
                    unit=ex.unit,
                    qty=ex.qty,
                    material_rate=ex.material_rate,
                    labour_rate=ex.labour_rate,
                    gst_percent=ex.gst_percent,
                    hsn_code=ex.hsn_code,
                    edited=True,
                )
            )

    # ---- totals (round only at the line; aggregate exactly) ----
    subtotal = sum((ln.amount for ln in lines), ZERO)
    gst_total = sum((ln.gst_amount for ln in lines), ZERO)
    cgst_total = sum((ln.cgst_amount for ln in lines), ZERO)
    sgst_total = sum((ln.sgst_amount for ln in lines), ZERO)

    summary = BoqSummary(
        subtotal=subtotal,
        gst_total=gst_total,
        cgst_total=cgst_total,
        sgst_total=sgst_total,
        grand_total=subtotal + gst_total,
        line_count=len(lines),
    )

    return BoqReport(
        city=city,
        finish_tier=finish_tier,
        lines=lines,
        by_room=_group(lines, lambda ln: ln.room_id or "unassigned", lambda ln: ln.room_label or "Unassigned"),
        by_trade=_group(lines, lambda ln: ln.trade, lambda ln: ln.trade),
        summary=summary,
        warnings=warnings,
        disclaimer="Indicative BOQ generated from plan geometry. Rates are seed values — verify before quoting.",
    )
