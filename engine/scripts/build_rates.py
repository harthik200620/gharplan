"""Generate the seed rate table for the 3 launch cities.

Emits BOTH:
  - fixtures/rates/rates_seed.json  (engine reads this)
  - fixtures/rates/rates_seed.sql   (Supabase `rates` table seed)

Rates are researched INDICATIVE 2025-26 ballpark composite (material+labour)
rates for Indian residential finishing/civil work, derived from a Bengaluru
base + per-city multiplier (see `# Sources:` block below). They are NOT
quote-ready. EVERY row keeps `"verify": True` — confirm against current local
market quotes and the correct HSN/SAC + GST slab before quoting a real client.

Magnitude note: per-unit rates are PER the stated `unit` (sqm, not sqft).
Most published Indian costs are quoted per sqft, so per-sqm items below were
converted ×10.764 (1 sqm = 10.764 sqft). All-in Bengaluru sanity check for the
big-ticket items: 12mm internal plaster ~Rs 280/sqm; standard vitrified flooring
laid ~Rs 1100-1500/sqm; emulsion 2-coat ~Rs 110-150/sqm.

Run:  python scripts/build_rates.py
"""

# Sources: (researched 2026-06-01; representative mid-range Indian rates)
#   Plaster (~Rs 26/sqft = ~Rs 280/sqm all-in, 1:6, 12mm):
#     https://civilsir.com/plaster-cost-per-square-foot-with-material-in-india/
#     https://constructionestimatorindia.com/plaster-cost-per-square-foot-with-material-in-india/
#     https://www.comaron.com/blog/plastering-cost-per-sq-ft-india-2026-complete-rate-guide
#   Floor tiling (economy ceramic Rs 65-120/sqft; std vitrified Rs 100-170/sqft;
#   premium Rs 135-310/sqft all-in; labour Rs 25-60/sqft):
#     https://www.houseyog.com/blog/floor-tiling-cost-per-sqft-india/
#     https://buildingandinteriors.com/vitrified-tiles-rate-in-india/
#     https://morbitilehub.com/blog/true-cost-of-tiling-a-floor-india-2025
#   Wall tiles / dado (Rs 80-130/sqft laid):
#     https://www.houseyog.com/blog/floor-tiling-cost-per-sqft-india/
#   Putty + primer + emulsion (putty Rs 8-13/sqft; primer Rs 10-30/sqft;
#   emulsion 2-coat Rs 12-28/sqft; premium Rs 38-58/sqft; all-in fresh Rs 18-35):
#     https://www.houseyog.com/blog/wall-putty-cost-india/
#     https://aapkapainter.com/blog/painting-cost-in-bangalore/
#     https://buildingandinteriors.com/painting-price-per-sq-ft/
#   False ceiling (POP Rs 60-105/sqft; gypsum Rs 70-150/sqft):
#     https://www.houseyog.com/blog/false-ceiling-cost-per-sq-ft-pop-gypsum-pvc-in-india/
#     https://buildingandinteriors.com/false-ceiling-price-per-sq-ft/
#   Waterproofing (coating/cementitious Rs 30-50/sqft; membrane/PU Rs 50-120/sqft):
#     https://www.houseyog.com/blog/waterproofing-cost-per-sq-ft-india/
#     https://limehouse.in/terrace-waterproofing-cost-in-india/
#   Flush / teak-veneer doors (teak-veneer flush ~Rs 340-500/sqft → ~Rs 7-12k
#   for a 3'x7' door incl frame; teak panel Rs 18-35k/door):
#     https://www.veneermart.in/teak-veneer-doors.html
#     https://dir.indiamart.com/impcat/teak-veneers-door.html
#   Aluminium / UPVC windows (UPVC Rs 450-900/sqft incl install; aluminium
#   from ~Rs 350/sqft → ~Rs 4.5-8k alu / Rs 9-16k UPVC for a typical sash):
#     https://buildingandinteriors.com/upvc-windows-price-per-sq-ft/
#     https://thegreenfortune.com/greenfortune-upvc-windows-pricing/
#   Electrical points (concealed point all-in ~Rs 700-1200; light point ~Rs 150
#   labour-only + material):
#     https://www.houseyog.com/blog/electrical-wiring-cost-per-sq-ft-in-india-complete-guide/
#     https://constructionestimatorindia.com/electrical-wiring-cost-per-square-foot-in-india/
#   Plumbing points (CPVC supply + drainage point ~Rs 1500-2800 all-in):
#     https://www.houseyog.com/blog/cost-of-plumbing-in-new-construction-per-bathroom-amp-whole-house-india-2025-guide/
#   CP & sanitaryware per WC (basic Rs 10-20k; mid Rs 20-40k incl install):
#     https://www.houseyog.com/blog/bathroom-fitting-cost-in-india-jaquar-hindware-kohler-price-installation-guide/
#   Modular kitchen (laminate Rs 1500-2500/sqft; converted to per-rft of run
#   ~Rs 1300-3500/rft basic→premium):
#     https://www.houseyog.com/blog/modular-kitchen-cost-in-india/
#     https://gharkabudget.com/articles/modular-kitchen-price-india-2026/
#     https://www.bricknbolt.com/blogs-and-articles/home-design-guide/modular-kitchen-cost
#   Wardrobe / TV unit (laminate Rs 1300-2200/sqft incl labour):
#     https://limehouse.in/wardrobe-cost-in-india-2025/
#     https://www.houzz.in/magazine/what-is-the-cost-of-making-a-new-wooden-wardrobe-stsetivw-vs~123309357
#   Granite counter (stone Rs 150-700/sqft; counter run Rs 220-450/rft incl
#   fabrication+fixing):
#     https://www.nobroker.in/forum/what-is-the-price-of-granite-per-square-foot/
#     https://civillane.com/cost/kitchen-platform/
#   MS grill (Rs 120-300/sqft fabricated+fixed → ~Rs 1700-3200/sqm):
#     https://www.contractorbhai.com/cost-for-making-window-grills/
#     https://www.paramvisions.com/2021/11/how-to-calculate-cost-of-ms-window.html
#   Civil labour day rate (skilled mason ~Rs 700-900/day + helper ~Rs 450-600;
#   mason+helper pair ~Rs 1000-1400/day in metros 2025):
#     https://www.ceicdata.com/en/india/average-daily-wage-rate-rural-non-agricultural-by-state-mason/average-daily-wage-rate-rural-non-agricultural-mason-men-karnataka
#     https://civilpracticalknowledge.com/civil-work-cost-breakdown/
#
# GST note: finishing GOODS (tiles 6907, putty 3214, paint 3209, gypsum 6809,
# CP/sanitaryware 3922, MS 7308) and composite WORKS-CONTRACT services (SAC 9954)
# are 18% — kept as-is. Verify each HSN/SAC + slab against current GST notifs
# before quoting; some items (e.g. certain low-value sanitaryware) can differ.

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "fixtures" / "rates"
UPDATED_AT = "2026-06-01"  # researched-as-of date; fixed for diff-friendly output

# Per-city cost multiplier vs Bengaluru base (indicative). Verify before quoting.
# Bengaluru/Pune are higher-cost metros; Hyderabad slightly cheaper labour;
# Tirupati tier-2 (AP) cheapest. Multipliers are coarse — confirm locally.
CITY_MULTIPLIER = {
    "Bengaluru": 1.00,
    "Hyderabad": 0.95,
    "Pune": 1.03,
    "Tirupati": 0.90,  # tier-2 temple city (AP); lower labour/material vs metro
}

# Base spec (Bengaluru). (code, description, unit, material, labour, gst%, hsn, tier)
# Rates are INDICATIVE 2025-26 composite material+labour all-in per `unit`
# (sqm/rmt/nos/day/rft/sqft). See `# Sources:` block above. verify:true on all.
BASE = [
    # Plaster: ~Rs 280/sqm all-in (1:6, 12mm); material-light, labour-heavy.
    ("PLS-CEM", "Internal cement plaster 12mm", "sqm", 95, 195, 18, "9954", "all"),
    # Flooring (per sqm laid, incl tile + adhesive + labour). Eco ceramic
    # ~Rs 65-120/sqft→~Rs 800/sqm; std vitrified ~Rs 100-170/sqft→~Rs 1300/sqm;
    # premium large-slab ~Rs 170-300/sqft→~Rs 2100/sqm.
    ("FLR-CER", "Ceramic floor tiles (economy)", "sqm", 520, 280, 18, "6907", "economy"),
    ("FLR-VIT", "Vitrified floor tiles 600x600", "sqm", 850, 450, 18, "6907", "standard"),
    ("FLR-VITP", "Premium vitrified/large slab", "sqm", 1550, 550, 18, "6907", "premium"),
    # Skirting (per rmt; ~150mm strip cut from tile + fix).
    ("SKB-CER", "Ceramic skirting", "rmt", 95, 55, 18, "6907", "economy"),
    ("SKB-VIT", "Vitrified skirting", "rmt", 130, 70, 18, "6907", "standard"),
    ("SKB-VITP", "Premium skirting", "rmt", 220, 90, 18, "6907", "premium"),
    # Dado / wall tiling (per sqm laid ~Rs 80-130/sqft → ~Rs 1000-1200/sqm).
    ("WTL-CER", "Ceramic wall tiles (dado)", "sqm", 680, 380, 18, "6907", "standard"),
    ("WTL-CERP", "Designer wall tiles (dado)", "sqm", 1150, 480, 18, "6907", "premium"),
    # Putty / primer / paint (per sqm). Putty 2-coat ~Rs 8-13/sqft→~Rs 90/sqm;
    # primer ~Rs 35-55/sqm; emulsion 2-coat ~Rs 90-150/sqm; premium ~Rs 180-280.
    ("PUT-WAL", "Wall putty 2 coats", "sqm", 48, 42, 18, "3214", "all"),
    ("PRM-WAL", "Primer 1 coat", "sqm", 26, 20, 18, "3209", "all"),
    ("PNT-ECO", "Distemper / economy emulsion 2 coats", "sqm", 42, 38, 18, "3209", "economy"),
    ("PNT-STD", "Emulsion paint 2 coats", "sqm", 72, 52, 18, "3209", "standard"),
    ("PNT-PRM", "Premium emulsion 2 coats", "sqm", 140, 80, 18, "3209", "premium"),
    # False ceiling (per sqm). POP ~Rs 60-105/sqft→~Rs 900-1300/sqm;
    # gypsum ~Rs 70-150/sqft→~Rs 1100-1700/sqm.
    ("FCL-POP", "POP false ceiling", "sqm", 620, 480, 18, "6809", "economy"),
    ("FCL-GYP", "Gypsum board false ceiling", "sqm", 820, 520, 18, "6809", "standard"),
    ("FCL-GYPP", "Designer false ceiling", "sqm", 1150, 650, 18, "6809", "premium"),
    # Waterproofing (per sqm). Coating/cementitious ~Rs 30-50/sqft→~Rs 350-540;
    # membrane/PU ~Rs 50-120/sqft→~Rs 900-1300/sqm.
    ("WPF-STD", "Waterproofing (coating)", "sqm", 280, 180, 18, "3214", "standard"),
    ("WPF-PRM", "Waterproofing (membrane)", "sqm", 720, 380, 18, "3214", "premium"),
    # Doors (per nos, incl frame+fixing). Laminated flush ~Rs 6-9k; flush w/
    # frame std ~Rs 8-12k; teak/veneer panel ~Rs 18-35k.
    ("DOR-FLM", "Flush door (laminated)", "nos", 5800, 1400, 18, "4418", "economy"),
    ("DOR-FL8", "Flush door 32mm with frame", "nos", 8200, 1800, 18, "4418", "standard"),
    ("DOR-TEK", "Teak/veneer panel door", "nos", 19500, 4500, 18, "4418", "premium"),
    # Windows (per nos sash, incl glazing+fixing). Aluminium ~Rs 4.5-8k;
    # UPVC ~Rs 9-16k; premium UPVC higher.
    ("WIN-ALU", "Aluminium window with glazing", "nos", 5200, 1200, 18, "7610", "economy"),
    ("WIN-UPV", "UPVC window with glazing", "nos", 9800, 2000, 18, "3925", "standard"),
    ("WIN-UPVP", "Premium UPVC window", "nos", 13500, 2500, 18, "3925", "premium"),
    # Electrical point (per nos, concealed wiring + accessory ~Rs 700-1200).
    ("ELE-PT", "Electrical point (wiring + accessory)", "nos", 520, 360, 18, "8536", "standard"),
    ("ELE-PTP", "Premium electrical point", "nos", 780, 470, 18, "8536", "premium"),
    # Plumbing point (per nos, CPVC supply + drainage ~Rs 1500-2800).
    ("PLM-PT", "Plumbing point (supply + drainage)", "nos", 1150, 750, 18, "3917", "standard"),
    ("PLM-PTP", "Premium plumbing point", "nos", 1750, 1050, 18, "3917", "premium"),
    # Items available for manual add in the editable BOQ (not auto-taken-off).
    # MS grill (per sqm fabricated+fixed ~Rs 120-300/sqft → ~Rs 1700-3200/sqm).
    ("GRL-MS", "MS safety grill", "sqm", 1850, 650, 18, "7308", "all"),
    # Modular kitchen (per rft of cabinetry run, all-in ~Rs 1300-3500/rft).
    ("KIT-ECO", "Modular kitchen (economy)", "rft", 1150, 350, 18, "9403", "economy"),
    ("KIT-STD", "Modular kitchen (standard)", "rft", 1850, 550, 18, "9403", "standard"),
    ("KIT-PRM", "Modular kitchen (premium)", "rft", 2900, 750, 18, "9403", "premium"),
    # CP & sanitaryware set per WC (basic Rs 10-20k incl install).
    ("CPF-SET", "CP & sanitary fittings set (per WC)", "nos", 13500, 3500, 18, "3922", "standard"),
    # Granite counter (per rft of run, stone + fabrication + fixing ~Rs 220-450/rft).
    ("GRN-CTR", "Granite kitchen counter", "rft", 240, 110, 18, "6802", "all"),
    # Wardrobe / TV unit (per sqft of elevation, laminate ~Rs 1300-2200/sqft).
    ("WRD-STD", "Wardrobe (standard)", "sqft", 1250, 400, 18, "9403", "standard"),
    ("WRD-PRM", "Wardrobe (premium)", "sqft", 1650, 500, 18, "9403", "premium"),
    ("TVU-STD", "TV unit", "sqft", 1150, 400, 18, "9403", "standard"),
    # Civil labour: mason+helper pair per day (~Rs 1000-1400/day metro 2025).
    ("LAB-CIV", "Civil labour (mason+helper)", "day", 0, 1200, 18, "9954", "all"),
]


def build_rows() -> list[dict]:
    rows: list[dict] = []
    for city, mult in CITY_MULTIPLIER.items():
        for code, desc, unit, mat, lab, gst, hsn, tier in BASE:
            rows.append(
                {
                    "city": city,
                    "item_code": code,
                    "description": desc,
                    "unit": unit,
                    "material_rate": round(mat * mult),
                    "labour_rate": round(lab * mult),
                    "gst_percent": gst,
                    "hsn_code": hsn,
                    "finish_tier": tier,
                    "updated_at": UPDATED_AT,
                    "verify": True,
                }
            )
    return rows


def _sql_escape(s: str) -> str:
    return s.replace("'", "''")


def build_sql(rows: list[dict]) -> str:
    lines = [
        "-- GharPlan seed rates. Researched INDICATIVE 2025-26 ballpark composite",
        "-- (material+labour) rates for Indian residential work (see sources in",
        "-- scripts/build_rates.py). NOT quote-ready: every row is verify:true —",
        "-- confirm against current local market quotes and the correct HSN/SAC +",
        "-- GST slab before quoting a real client.",
        "create table if not exists rates (",
        "  id            bigserial primary key,",
        "  city          text not null,",
        "  item_code     text not null,",
        "  description   text not null,",
        "  unit          text not null,",
        "  material_rate numeric not null,",
        "  labour_rate   numeric not null,",
        "  gst_percent   numeric not null,",
        "  hsn_code      text,",
        "  finish_tier   text not null,",
        "  updated_at    date not null default current_date,",
        "  unique (city, item_code)",
        ");",
        "",
        "insert into rates (city, item_code, description, unit, material_rate, labour_rate, gst_percent, hsn_code, finish_tier, updated_at) values",
    ]
    values = []
    for r in rows:
        values.append(
            "  ('{city}', '{code}', '{desc}', '{unit}', {mat}, {lab}, {gst}, '{hsn}', '{tier}', '{upd}')".format(
                city=_sql_escape(r["city"]),
                code=_sql_escape(r["item_code"]),
                desc=_sql_escape(r["description"]),
                unit=_sql_escape(r["unit"]),
                mat=r["material_rate"],
                lab=r["labour_rate"],
                gst=r["gst_percent"],
                hsn=_sql_escape(r["hsn_code"]),
                tier=_sql_escape(r["finish_tier"]),
                upd=r["updated_at"],
            )
        )
    return "\n".join(lines) + "\n" + ",\n".join(values) + "\non conflict (city, item_code) do nothing;\n"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = build_rows()
    (OUT_DIR / "rates_seed.json").write_text(
        json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (OUT_DIR / "rates_seed.sql").write_text(build_sql(rows), encoding="utf-8")
    print(f"Wrote {len(rows)} rate rows for {len(CITY_MULTIPLIER)} cities to {OUT_DIR}")


if __name__ == "__main__":
    main()
