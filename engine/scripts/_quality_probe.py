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

from app.generator.designer import _envelope_and_keepout, generate_plan
from app.models.plan import Plot
from app.services.rules import get_code_rules

HAB = {"living", "master_bedroom", "bedroom", "childrens_bedroom", "study"}

# A leftover gap larger than this (m^2) inside the building footprint on any floor
# is an unassigned interior void — a 10-yr architect would never ship blank floor.
# The generator fills every such gap with a labelled courtyard (or welds a thin
# strip), so this must stay ~0 across the matrix.
VOID_MAX_SQM = 2.0


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
    ("TG", "E", 9.144, 12.192, 3), ("TG", "E", 9.144, 12.192, 4),
    ("AP", "E", 9.144, 12.192, 3), ("AP", "E", 9.144, 12.192, 4),
    ("KA", "W", 9.144, 12.192, 3), ("KA", "W", 9.144, 12.192, 4),
    ("KA", "N", 9.144, 12.192, 3), ("KA", "N", 9.144, 12.192, 4),
    ("KA", "S", 9.144, 12.192, 3), ("KA", "S", 9.144, 12.192, 4),
    ("KA", "E", 14.0, 16.0, 3), ("KA", "E", 16.0, 18.0, 4),
]

_CODE_RULES = get_code_rules()


def _interior_void(plan, plot) -> tuple[float, int]:
    """Worst per-floor interior void and which floor it is on. A floor's void is the
    buildable-envelope area MINUS the area of every room whose rectangle lies inside
    the envelope (a courtyard counts as filling; site rooms in the setback margins
    sit OUTSIDE the envelope and so are excluded automatically)."""
    env, _ = _envelope_and_keepout(plot, _CODE_RULES)
    mnx, mny, mxx, mxy = env
    env_area = max(0.0, mxx - mnx) * max(0.0, mxy - mny)
    worst, worst_fl = 0.0, 0
    site = {
        "parking", "sitout", "courtyard", "garden", "service_shaft",
        "future_expansion", "balcony", "overhead_tank", "borewell", "brahmasthan",
    }
    for fl in sorted({(r.floor or 0) for r in plan.rooms}):
        # A floor with NO enclosed (non-site) room isn't a "blank gap inside a room
        # layout" — it's a storey that simply wasn't built up (e.g. a 2BHK forced to
        # G+1 keeps every room on the ground). Skip it; the void check is about
        # unassigned floor WITHIN a populated footprint.
        floor_rooms = [r for r in plan.rooms if (r.floor or 0) == fl]
        if not any(r.type.value not in site for r in floor_rooms):
            continue
        used = 0.0
        for r in floor_rooms:
            x0, y0, x1, y1 = _bb(r.polygon)
            if x0 >= mnx - 0.02 and y0 >= mny - 0.02 and x1 <= mxx + 0.02 and y1 <= mxy + 0.02:
                used += (x1 - x0) * (y1 - y0)
        void = env_area - used
        if void > worst:
            worst, worst_fl = void, fl
    return worst, worst_fl


def _scenario_spot() -> int:
    """SCENARIO SPOT — inline spot-run of two canonical scenarios from
    tests/test_scenarios.py (3: Warangal pentagon polygon; 6: TS-bPASS instant
    tier). One ok/FAIL line each; returns the number of FAILs so main() can
    flip the exit code. Kept tiny on purpose: the full matrix lives in pytest."""
    from shapely.geometry import Polygon as ShapelyPolygon

    from app.services.rules import resolve_jurisdiction

    virtual = {
        "parking", "sitout", "courtyard", "garden", "service_shaft",
        "future_expansion", "balcony", "overhead_tank", "borewell", "brahmasthan",
    }
    bad = 0
    print("\nSCENARIO SPOT")

    # (3) Warangal irregular pentagon — tg-ulb-common pack, envelope containment.
    pentagon = [(0.0, 0.0), (12.0, 0.0), (12.0, 8.5), (6.0, 12.4), (0.0, 8.5)]
    try:
        pack = resolve_jurisdiction("TG", "Warangal")
        plot = Plot.model_validate({
            "widthM": 12.0, "depthM": 12.4, "facing": "E", "state": "TG",
            "city": "Hyderabad", "floors": 1, "polygon": pentagon,
        })
        plan, _, code, meta = generate_plan(2, plot, code_rules=pack)
        env = ShapelyPolygon(meta["envelopePolygon"]).buffer(1e-6)
        real = [r for r in plan.rooms if r.type.value not in virtual]
        contained = bool(real) and all(ShapelyPolygon(r.polygon).within(env) for r in real)
        fails = code.summary.fail_count
        ok = (
            fails == 0 and contained
            and str(meta.get("polygonMode", "")).startswith("v1-inscribed-rect")
        )
        print(
            f"pentagon-warangal  fails={fails} mode={meta.get('polygonMode')} "
            f"envUtil={meta.get('envelopeUtilization')} contained={'Y' if contained else 'N'}"
            f"  {'ok' if ok else '** FAIL'}"
        )
        bad += 0 if ok else 1
    except Exception as e:  # a spot probe must never crash the whole report
        print(f"pentagon-warangal  ** FAIL ({type(e).__name__}: {e})")
        bad += 1

    # (6) TS-bPASS instant tier — 59.5 m2 <= 62.71 m2 (75 sq yd), single storey.
    try:
        pack = resolve_jurisdiction("TG", "Hyderabad")
        plot = Plot.model_validate({
            "widthM": 7.0, "depthM": 8.5, "facing": "E", "state": "TG",
            "city": "Hyderabad", "floors": 1,
        })
        _, _, code, _ = generate_plan(2, plot, code_rules=pack)
        instant = [c for c in code.checks if c.rule_id == "instant_approval"]
        fails = code.summary.fail_count
        ok = fails == 0 and bool(instant) and instant[0].status == "pass"
        print(
            f"instant-ghmc       fails={fails} "
            f"instant_approval={instant[0].status if instant else 'MISSING'}"
            f"  {'ok' if ok else '** FAIL'}"
        )
        bad += 0 if ok else 1
    except Exception as e:
        print(f"instant-ghmc       ** FAIL ({type(e).__name__}: {e})")
        bad += 1

    return bad


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
        void, void_fl = _interior_void(plan, _plot(state, facing, w, d))
        has_void = void > VOID_MAX_SQM
        flags = []
        if fails:
            flags.append("FAILS")
        if not kd:
            flags.append("KD")
        if has_void:
            flags.append(f"VOID={void:.1f}@f{void_fl}")
        if "SW" in lz:
            flags.append("LIV-SW")
        tag = "G+1" if len(floors) > 1 else "1F"
        status = "ok" if not flags else "** " + ",".join(flags)
        print(
            f"{state} {facing} {bhk}BHK {tag:3} fails={fails} v={vastu.score:5} "
            f"KD={'Y' if kd else 'N'} SL={'Y' if sl else 'N'} livLargest={liv_largest} "
            f"lz={lz} livA={la} minBed={min_bed_a:.1f} maxAsp={max_asp:.2f} "
            f"void={void:.1f}  {status}"
        )
        if fails or not kd or has_void:
            bad += 1
    print(f"\nbad (code-fail / kitchen-dining break / interior-void > {VOID_MAX_SQM} m2) = {bad}")
    spot_bad = _scenario_spot()
    return 1 if (bad or spot_bad) else 0


if __name__ == "__main__":
    sys.exit(main())
