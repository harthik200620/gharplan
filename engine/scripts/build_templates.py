"""Build the v2 generator template registry from the curated sample plan.

Converts the sample 30x40 east-facing plan's room rectangles into FRACTIONS of
the buildable envelope (plot minus setbacks), so the scaler can fit the same
Vastu-zoned layout into any east-facing plot. TODO(human): hire an architect to
author/extend templates for more plot sizes and facings.

Run:  python scripts/build_templates.py
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.code_service import buildable_envelope

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE = REPO_ROOT / "fixtures" / "sample_plan_30x40_east.json"
OUT_DIR = REPO_ROOT / "fixtures" / "templates"

# Setbacks used to derive fractions — must match code_rules KA <150 sqm band, facing E.
FRONT, REAR, SIDE = 1.5, 1.0, 0.6


def main() -> None:
    sample = json.loads(SAMPLE.read_text(encoding="utf-8"))
    w = sample["plot"]["widthM"]
    d = sample["plot"]["depthM"]
    minx, miny, maxx, maxy = buildable_envelope(w, d, "E", FRONT, REAR, SIDE)
    ew, ed = maxx - minx, maxy - miny

    def frac_rect(poly):
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        return [
            round((min(xs) - minx) / ew, 4),
            round((min(ys) - miny) / ed, 4),
            round((max(xs) - minx) / ew, 4),
            round((max(ys) - miny) / ed, 4),
        ]

    rooms = [
        {
            "id": r["id"],
            "type": r["type"],
            "rect": frac_rect(r["polygon"]),
            "ceilingHeightM": r.get("ceilingHeightM", 3.0),
        }
        for r in sample["rooms"]
    ]

    template = {
        "id": "30x40_E",
        "name": "30x40 ft East-facing (Ground floor) — Vastu template",
        "plotType": "30x40",
        "facing": "E",
        "refPlotWidthM": w,
        "refPlotDepthM": d,
        "setbacksUsed": {"frontM": FRONT, "rearM": REAR, "sideM": SIDE},
        "note": "Room rects are fractions [fx0,fy0,fx1,fy1] of the buildable envelope. TODO(human): architect to review/extend.",
        "rooms": rooms,
        "doors": sample["doors"],
        "windows": sample["windows"],
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "30x40_E.json").write_text(
        json.dumps(template, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wrote template 30x40_E with {len(rooms)} rooms to {OUT_DIR}")


if __name__ == "__main__":
    main()
