"""Generate the seed rate table for the 3 launch cities.

Emits BOTH:
  - fixtures/rates/rates_seed.json  (engine reads this)
  - fixtures/rates/rates_seed.sql   (Supabase `rates` table seed)

Rates are INDICATIVE placeholders derived from a Bengaluru base + per-city
multiplier. EVERY value is TODO(human): verify against current market rates and
the correct HSN/SAC + GST slab before quoting a real client.

Run:  python scripts/build_rates.py
"""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "fixtures" / "rates"
UPDATED_AT = "2025-01-01"  # fixed for reproducible, diff-friendly output

# Per-city cost multiplier vs Bengaluru base (indicative). TODO(human): verify.
CITY_MULTIPLIER = {
    "Bengaluru": 1.00,
    "Hyderabad": 0.95,
    "Pune": 1.03,
}

# Base spec (Bengaluru). (code, description, unit, material, labour, gst%, hsn, tier)
BASE = [
    ("PLS-CEM", "Internal cement plaster 12mm", "sqm", 38, 32, 18, "9954", "all"),
    ("FLR-CER", "Ceramic floor tiles (economy)", "sqm", 55, 45, 18, "6907", "economy"),
    ("FLR-VIT", "Vitrified floor tiles 600x600", "sqm", 95, 50, 18, "6907", "standard"),
    ("FLR-VITP", "Premium vitrified/large slab", "sqm", 180, 70, 18, "6907", "premium"),
    ("SKB-CER", "Ceramic skirting", "rmt", 28, 18, 18, "6907", "economy"),
    ("SKB-VIT", "Vitrified skirting", "rmt", 45, 22, 18, "6907", "standard"),
    ("SKB-VITP", "Premium skirting", "rmt", 80, 30, 18, "6907", "premium"),
    ("WTL-CER", "Ceramic wall tiles (dado)", "sqm", 48, 42, 18, "6907", "standard"),
    ("WTL-CERP", "Designer wall tiles (dado)", "sqm", 110, 55, 18, "6907", "premium"),
    ("PUT-WAL", "Wall putty 2 coats", "sqm", 18, 14, 18, "3214", "all"),
    ("PRM-WAL", "Primer 1 coat", "sqm", 12, 10, 18, "3209", "all"),
    ("PNT-ECO", "Distemper / economy emulsion 2 coats", "sqm", 14, 12, 18, "3209", "economy"),
    ("PNT-STD", "Emulsion paint 2 coats", "sqm", 22, 16, 18, "3209", "standard"),
    ("PNT-PRM", "Premium emulsion 2 coats", "sqm", 40, 20, 18, "3209", "premium"),
    ("FCL-POP", "POP false ceiling", "sqm", 60, 55, 18, "6809", "economy"),
    ("FCL-GYP", "Gypsum board false ceiling", "sqm", 85, 65, 18, "6809", "standard"),
    ("FCL-GYPP", "Designer false ceiling", "sqm", 150, 90, 18, "6809", "premium"),
    ("WPF-STD", "Waterproofing (coating)", "sqm", 45, 35, 18, "3214", "standard"),
    ("WPF-PRM", "Waterproofing (membrane)", "sqm", 95, 55, 18, "3214", "premium"),
    ("DOR-FLM", "Flush door (laminated)", "nos", 3200, 700, 18, "4418", "economy"),
    ("DOR-FL8", "Flush door 32mm with frame", "nos", 4500, 900, 18, "4418", "standard"),
    ("DOR-TEK", "Teak/veneer panel door", "nos", 9500, 1500, 18, "4418", "premium"),
    ("WIN-ALU", "Aluminium window with glazing", "nos", 4200, 600, 18, "7610", "economy"),
    ("WIN-UPV", "UPVC window with glazing", "nos", 7800, 900, 18, "3925", "standard"),
    ("WIN-UPVP", "Premium UPVC window", "nos", 12500, 1200, 18, "3925", "premium"),
    ("ELE-PT", "Electrical point (wiring + accessory)", "nos", 380, 320, 18, "8536", "standard"),
    ("ELE-PTP", "Premium electrical point", "nos", 650, 450, 18, "8536", "premium"),
    ("PLM-PT", "Plumbing point (supply + drainage)", "nos", 850, 650, 18, "3917", "standard"),
    ("PLM-PTP", "Premium plumbing point", "nos", 1400, 900, 18, "3917", "premium"),
    # Items available for manual add in the editable BOQ (not auto-taken-off).
    ("GRL-MS", "MS safety grill", "sqm", 380, 120, 18, "7308", "all"),
    ("KIT-ECO", "Modular kitchen (economy)", "rft", 1100, 300, 18, "9403", "economy"),
    ("KIT-STD", "Modular kitchen (standard)", "rft", 1900, 450, 18, "9403", "standard"),
    ("KIT-PRM", "Modular kitchen (premium)", "rft", 3200, 650, 18, "9403", "premium"),
    ("CPF-SET", "CP & sanitary fittings set (per WC)", "nos", 9000, 1500, 18, "3922", "standard"),
    ("GRN-CTR", "Granite kitchen counter", "rft", 750, 250, 18, "6802", "all"),
    ("WRD-STD", "Wardrobe (standard)", "sqft", 1100, 250, 18, "9403", "standard"),
    ("WRD-PRM", "Wardrobe (premium)", "sqft", 1800, 350, 18, "9403", "premium"),
    ("TVU-STD", "TV unit", "sqft", 950, 250, 18, "9403", "standard"),
    ("LAB-CIV", "Civil labour (mason+helper)", "day", 0, 900, 18, "9954", "all"),
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
        "-- GharPlan seed rates. INDICATIVE values — TODO(human): verify every row",
        "-- (rate, HSN/SAC, GST slab) before quoting a real client.",
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
