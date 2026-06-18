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

FINISH_SPECS = {
    'economy': {
        'floor_living': 'Vitrified tiles 600x600mm (Grade 2)',
        'floor_bedroom': 'Vitrified tiles 600x600mm (Grade 2)',
        'floor_kitchen': 'Ceramic tiles 400x400mm anti-skid',
        'floor_toilet': 'Ceramic tiles 300x300mm anti-skid',
        'wall_living': 'OBD paint 2 coats, putty finish',
        'wall_bedroom': 'OBD paint 2 coats',
        'wall_kitchen': 'Glazed ceramic dado to 2.1m ht',
        'wall_toilet': 'Glazed ceramic dado full height',
        'ceiling': 'POP punning on RCC slab',
        'doors': 'Flush door in sal wood frame',
        'windows': 'Powder-coated aluminum sliding',
        'kitchen_platform': 'Granite 20mm Black Galaxy',
    },
    'standard': {
        'floor_living': 'Vitrified tiles 800x800mm (Premium Grade)',
        'floor_bedroom': 'Vitrified tiles 600x600mm / Laminated Wooden Flooring',
        'floor_kitchen': 'Matte finish ceramic tiles 600x600mm',
        'floor_toilet': 'Anti-skid ceramic tiles 300x300mm',
        'wall_living': 'Acrylic Emulsion paint 2 coats, putty finish',
        'wall_bedroom': 'Acrylic Emulsion paint 2 coats',
        'wall_kitchen': 'Designer glazed ceramic dado to 2.1m ht',
        'wall_toilet': 'Designer glazed ceramic dado full height',
        'ceiling': 'Gypsum false ceiling with cove lighting in living',
        'doors': 'Veneer finish flush door in teak wood frame',
        'windows': 'UPVC sliding windows (2.5 track with mesh)',
        'kitchen_platform': 'Granite 20mm Jet Black / Quartz',
    },
    'premium': {
        'floor_living': 'Italian Marble (Boticino / Dyna)',
        'floor_bedroom': 'Engineered Wooden Flooring',
        'floor_kitchen': 'Large format vitrified tiles 1200x600mm',
        'floor_toilet': 'Large format anti-skid tiles 600x600mm',
        'wall_living': 'Premium washable emulsion / Wallpaper accents',
        'wall_bedroom': 'Premium washable emulsion',
        'wall_kitchen': 'Quartz / Large format dado full height',
        'wall_toilet': 'Large format tiles full height / Marble dado',
        'ceiling': 'Designer gypsum false ceiling in all rooms',
        'doors': 'Solid teak wood doors with premium hardware',
        'windows': 'UPVC / Aluminum system windows (Schuco or eq.)',
        'kitchen_platform': 'Premium Quartz / Corian',
    }
}

def get_finish_specification(room_type: str, tier: FinishTier) -> dict:
    """Returns the specifications for a room type based on the finish tier."""
    specs = FINISH_SPECS.get(tier.value, FINISH_SPECS['standard'])
    # Customize slightly based on room_type if needed, but returning full tier spec as requested
    return specs

def estimate_construction_timeline(total_sqft: float, floors: int, tier: str) -> dict:
    """Estimates construction timeline based on project size and complexity."""
    base_foundation_weeks = 4 if total_sqft < 2000 else 6
    superstructure_per_floor = 8 if total_sqft / floors < 1000 else 12
    mep_per_floor = 3 if tier == 'economy' else 4
    finishes_per_floor = 6 if tier == 'economy' else (8 if tier == 'standard' else 10)
    finishing_touches = 4 if tier == 'economy' else 6
    
    total_weeks = (
        base_foundation_weeks + 
        (superstructure_per_floor * floors) +
        (mep_per_floor * floors) +
        (finishes_per_floor * floors) +
        finishing_touches
    )
    
    return {
        'phases': {
            'Foundation': f"{base_foundation_weeks} weeks",
            'Superstructure': f"{superstructure_per_floor * floors} weeks",
            'MEP Rough-in': f"{mep_per_floor * floors} weeks",
            'Finishes': f"{finishes_per_floor * floors} weeks",
            'Finishing touches': f"{finishing_touches} weeks"
        },
        'total_duration_months': round(total_weeks / 4.33, 1),
        'ideal_start_season': 'Post-Monsoon (October-November) to avoid foundation delays'
    }

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
    total_area_sqm = sum(r.area_sqm for r in plan.rooms) if plan.rooms else 0
    total_sqft = total_area_sqm * 10.7639
    floor_count = len({r.floor for r in plan.rooms if r.floor is not None}) or 1

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
            
            # Regional labor rate variations (MH & KA = +15%, AP & TG = +0%)
            labour_multiplier = Decimal("1.15") if city_name in ("Bengaluru", "Pune") else Decimal("1.0")
            adj_labour_rate = rate.labour_rate * labour_multiplier
            
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
                    labour_rate=adj_labour_rate,
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
    
    jugaad_contingency = subtotal * Decimal("0.10")

    summary = BoqSummary(
        subtotal=subtotal,
        gst_total=gst_total,
        cgst_total=cgst_total,
        sgst_total=sgst_total,
        jugaad_contingency=jugaad_contingency,
        grand_total=subtotal + gst_total + jugaad_contingency,
        line_count=len(lines),
    )

    by_trade_groups = _group(lines, lambda ln: ln.trade, lambda ln: ln.trade)
    trade_summary = [
        {
            "trade": g.label,
            "subtotal": float(g.subtotal),
            "percentage": float(g.total / summary.grand_total * 100) if summary.grand_total > 0 else 0
        }
        for g in by_trade_groups
    ]
    timeline = estimate_construction_timeline(total_sqft, floor_count, tier)

    return BoqReport(
        city=city,
        finish_tier=finish_tier,
        lines=lines,
        by_room=_group(lines, lambda ln: ln.room_id or "unassigned", lambda ln: ln.room_label or "Unassigned"),
        by_trade=by_trade_groups,
        trade_summary=trade_summary,
        construction_timeline=timeline,
        summary=summary,
        warnings=warnings,
        disclaimer="Indicative BOQ generated from plan geometry. Rates are seed values — verify before quoting.",
    )
