"""Seismic base-shear CHECK per IS 1893 (Part 1):2016 — magnitude report only.

This is an equivalent-static base-shear assessment (zone factor → design
horizontal acceleration coefficient → base shear as a % of seismic weight) plus
ductile-detailing guidance. It is NOT member-level seismic design: lateral
member forces, drift and joint checks are for the licensed structural engineer.
"""

from __future__ import annotations

from .loads import LL_FLOOR_KPA, STOREY_HEIGHT_M, WALL_LINE_KN_M, slab_dead_kpa

# IS 1893-1:2016 Annex E (city → zone). Needs verification for the exact site.
CITY_ZONE: dict[str, str] = {
    "Hyderabad": "II",
    "Warangal": "II",
    "Vijayawada": "III",
    "Guntur": "III",
    "Amaravati": "III",
    "Visakhapatnam": "II",
    "Tirupati": "II",
    "Bengaluru": "II",
    "Pune": "III",
}
ZONE_Z: dict[str, float] = {"II": 0.10, "III": 0.16, "IV": 0.24, "V": 0.36}  # Table 3


def assess_seismic(
    city: str,
    floors: int,
    footprint_area_m2: float,
    wall_length_m: float,
    slab_thickness_mm: float = 125.0,
) -> dict:
    """Base-shear check per IS 1893-1:2016 Cl.7.2.1 (Vb = Ah·W).

    Ah = (Z/2)·(I/R)·(Sa/g) per Cl.6.4.2 with I = 1.0 (residential, Table 8) and
    R = 3.0 (OMRF, Table 9 — conservative; adopt SMRF R = 5 with IS 13920
    detailing in Zone III and above). Ta = 0.075·h^0.75 (Cl.7.6.2, RC frame);
    Sa/g = 2.5 (short-period plateau, medium soil — valid for low-rise houses).
    Seismic weight = full DL + 25% of floor LL (LL ≤ 3 kPa, Table 10; roof LL
    excluded per Cl.7.3.2).
    """
    zone = CITY_ZONE.get(city)
    needs_verification = zone is None
    zone = zone or "II"
    z = ZONE_Z[zone]
    i_factor, r_factor, sa_g = 1.0, 3.0, 2.5

    h = STOREY_HEIGHT_M * max(1, floors)
    ta = 0.075 * h**0.75
    ah = (z / 2.0) * (i_factor / r_factor) * sa_g

    area = max(footprint_area_m2, 1.0)
    levels = max(1, floors)
    w = area * slab_dead_kpa(slab_thickness_mm) * levels  # slabs + finishes
    w += WALL_LINE_KN_M * max(wall_length_m, 4.0 * area**0.5) * levels  # masonry walls
    w += 0.25 * LL_FLOOR_KPA * area * max(0, levels - 1)  # 25% LL, roof excluded
    vb = ah * w

    note = (
        "R = 3.0 (OMRF) used conservatively for the base-shear magnitude; adopt SMRF "
        "(R = 5.0) with full IS 13920:2016 ductile detailing in Zone III and above. "
        "This is a base-shear magnitude check, not member-level seismic design."
    )
    if needs_verification:
        note += f" Zone for '{city}' not in the verified city list — Zone II assumed; needs verification against IS 1893-1:2016 Annex E."

    return {
        "zone": zone,
        "Z": z,
        "I": i_factor,
        "R": r_factor,
        "Sa_g": sa_g,
        "Ta_s": round(ta, 3),
        "Ah": round(ah, 4),
        "seismicWeight_kN": round(w, 0),
        "baseShear_kN": round(vb, 1),
        "baseShearPctW": round(100.0 * ah, 2),
        "clause": "IS 1893-1:2016 Cl.7.2.1",
        "zoneSource": "IS 1893-1:2016 Annex E (needs verification for the exact site)",
        "note": note,
    }
