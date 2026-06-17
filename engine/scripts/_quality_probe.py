"""Quality probe (dev tool, NOT a pytest) — generate plans across the
state/facing/tier matrix and report the 10-yr-architect invariants:
kitchen-dining adjacency, stair-touches-living, living-largest-on-floor,
living zone (front, never SW), bedroom min area + worst aspect ratio, Vastu,
code fails. Runs the generator IN-PROCESS so it always reflects the current
designer.py (no server restart needed).

Run from engine/:  ./.venv/Scripts/python.exe scripts/_quality_probe.py
Exit code 0 only when no case has a code fail or a kitchen-dining break.
"""
from __future__ import annotations

import os
import sys

# Make `app` importable no matter where this script is launched from (its own
# dir is on sys.path[0], not the engine root).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.generator.designer import generate_plan
from app.models.plan import Plot

HAB = {"living", "master_bedroom", "bedroom", "childrens_bedroom", "study"}


def _bb(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def _share(a, b, tol=0.12, mr=0.5):
    ax0, ay0, ax1, ay1 = _bb(a)
    bx0, by0, bx1, by1 = _bb(b)
    yov = min(ay1, by1) - max(ay0, by0)
    xov = min(ax1, bx1) - max(ax0, bx0)
    return (yov > mr and (abs(ax1 - bx0) < tol or abs(bx1 - ax0) < tol)) or (
        xov > mr and (abs(ay1 - by0) < tol or abs(by1 - ay0) < tol)
    )


def _plot(state, facing, w, d):
    city = "Bengaluru" if state == "KA" else ("Hyderabad" if state == "TG" else "Tirupati")
    return Plot.model_validate(
        {"widthM": w, "depthM": d, "facing": facing, "state": state, "city": city, "floors": 1}
    )


CASES = [
    ("KA", "E", 9.144, 12.192, 2), ("KA", "E", 9.144, 12.192, 3), ("KA", "E", 9.144, 12.192, 4),
    ("TG", "E", 9.144, 12.192, 3), ("AP", "E", 9.144, 12.192, 3),
    ("KA", "W", 9.144, 12.192, 3), ("KA", "N", 9.144, 12.192, 3), ("KA", "S", 9.144, 12.192, 3),
    ("KA", "E", 14.0, 16.0, 3), ("KA", "E", 16.0, 18.0, 4),
]


def main() -> int:
    bad = 0
    for state, facing, w, d, bhk in CASES:
        plan, vastu, code, meta = generate_plan(bhk, _plot(state, facing, w, d))
        rooms = plan.rooms
        floors = sorted({(r.floor or 0) for r in rooms})
        fails = code.summary.fail_count
        kd = sl = True
        liv_largest = []
        for f in floors:
            fr = [r for r in rooms if (r.floor or 0) == f]
            ks = [r for r in fr if r.type.value == "kitchen"]
            ds = [r for r in fr if r.type.value == "dining"]
            lvs = [r for r in fr if r.type.value == "living"]
            sts = [r for r in fr if r.type.value == "staircase"]
            for dn in ds:
                if not any(_share(dn.polygon, k.polygon) for k in ks):
                    kd = False
            if sts and lvs and not any(_share(s.polygon, l.polygon) for s in sts for l in lvs):
                sl = False
            hab = [r for r in fr if r.type.value in HAB]
            if hab and lvs:
                liv_largest.append(max(hab, key=lambda r: r.area_sqm).type.value == "living")
        beds = [r for r in rooms if "bedroom" in r.type.value]

        def _dim(r):
            x0, y0, x1, y1 = _bb(r.polygon)
            return (x1 - x0, y1 - y0)

        def _aspect(r):
            wd = _dim(r)
            return max(wd) / max(1e-6, min(wd))

        min_bed_a = min((r.area_sqm for r in beds), default=0.0)
        max_asp = max((_aspect(r) for r in beds), default=0.0)
        lz = [r.zone.value for r in rooms if r.type.value == "living"]
        la = [round(r.area_sqm, 1) for r in rooms if r.type.value == "living"]
        flags = []
        if fails:
            flags.append("FAILS")
        if not kd:
            flags.append("KD")
        if "SW" in lz:
            flags.append("LIV-SW")
        tag = "G+1" if len(floors) > 1 else "1F"
        status = "ok" if not flags else "** " + ",".join(flags)
        print(
            f"{state} {facing} {bhk}BHK {tag:3} fails={fails} v={vastu.score:5} "
            f"KD={'Y' if kd else 'N'} SL={'Y' if sl else 'N'} livLargest={liv_largest} "
            f"lz={lz} livA={la} minBed={min_bed_a:.1f} maxAsp={max_asp:.2f}  {status}"
        )
        if fails or not kd:
            bad += 1
    print(f"\nbad (code-fail or kitchen-dining break) = {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
