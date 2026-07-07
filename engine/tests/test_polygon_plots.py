"""Plot-v2 polygon support: true-boundary envelope (v1 = uniform conservative
inset + largest inscribed axis-aligned rect) feeding the unchanged rect packer."""

import pytest
from shapely.geometry import Polygon as ShapelyPolygon

from app.generator.designer import generate_plan
from app.models.enums import City, Facing, StateCode
from app.models.plan import Plot
from app.services.geometry import inset_polygon, largest_inscribed_rect, polygon_area

# Irregular 5-sided plot (a rectangle with a "roof" gable on the North side).
# The bbox (12 x 12.4 = 148.8 m²) deliberately stays inside KA's <= 150 m²
# setback band (front 1.5 / rear 1.0 / side 0.6 -> uniform inset 1.5): one band
# up (>150 m² bbox) the conservative inset becomes 3.0 m and the inscribed rect
# right-sizes the program down to a studio, which would make a weaker test.
PENTAGON = [(0.0, 0.0), (12.0, 0.0), (12.0, 8.5), (6.0, 12.4), (0.0, 8.5)]

# Room types the code checker classifies as virtual / open-site space — these
# are allowed in the setback margins, so envelope containment only binds the rest.
_VIRTUAL = {
    "brahmasthan", "borewell", "overhead_tank", "parking", "sitout", "courtyard",
    "garden", "service_shaft", "future_expansion", "balcony",
}


def _plot(polygon=None, w=12.0, d=12.4, floors=1) -> Plot:
    return Plot(
        width_m=w, depth_m=d, facing=Facing.E,
        state=StateCode.KA, city=City.Bengaluru, floors=floors, polygon=polygon,
    )


# --------------------------------------------------------------------------- #
# geometry unit tests
# --------------------------------------------------------------------------- #
def test_polygon_area_shoelace():
    assert polygon_area([(0, 0), (10, 0), (10, 10), (0, 10)]) == pytest.approx(100.0)
    # closed ring gives the same answer
    assert polygon_area([(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)]) == pytest.approx(100.0)
    assert polygon_area([(0, 0), (12, 0), (12, 9), (6, 13), (0, 9)]) == pytest.approx(132.0)


def test_inset_polygon_square_10_by_1_gives_8x8():
    ring = inset_polygon([(0, 0), (10, 0), (10, 10), (0, 10)], 1.0)
    assert ring is not None
    assert polygon_area(ring) == pytest.approx(64.0)
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    assert (min(xs), min(ys), max(xs), max(ys)) == pytest.approx((1.0, 1.0, 9.0, 9.0))


def test_inset_polygon_collapse_returns_none():
    assert inset_polygon([(0, 0), (3, 0), (3, 3), (0, 3)], 2.0) is None


def test_largest_inscribed_rect_square():
    ring = inset_polygon([(0, 0), (10, 0), (10, 10), (0, 10)], 1.0)
    rect = largest_inscribed_rect(ring)
    assert rect is not None
    x0, y0, x1, y1 = rect
    assert (x1 - x0) * (y1 - y0) == pytest.approx(64.0, rel=0.02)


def test_largest_inscribed_rect_l_shape_picks_larger_arm():
    # bottom arm 12x5 = 60 m² beats the left arm 4x10 = 40 m²
    l_shape = [(0, 0), (12, 0), (12, 5), (4, 5), (4, 10), (0, 10)]
    rect = largest_inscribed_rect(l_shape)
    assert rect is not None
    x0, y0, x1, y1 = rect
    assert (x1 - x0) * (y1 - y0) == pytest.approx(60.0, rel=0.02)
    assert y1 == pytest.approx(5.0, abs=0.05)   # it is the wide bottom arm
    assert x1 - x0 == pytest.approx(12.0, abs=0.05)


# --------------------------------------------------------------------------- #
# generator integration
# --------------------------------------------------------------------------- #
def test_pentagon_plot_generates_inside_envelope():
    plan, vastu, code, meta = generate_plan(2, _plot(polygon=PENTAGON))
    assert code.summary.fail_count == 0
    # polygon-mode meta surface
    assert meta["polygonMode"].startswith("v1-inscribed-rect")
    assert meta["plotPolygon"] and meta["envelopePolygon"]
    assert 0.0 < meta["envelopeUtilization"] <= 1.0
    # every REAL room lies inside the inset envelope polygon
    env_poly = ShapelyPolygon(meta["envelopePolygon"]).buffer(1e-6)
    real = [r for r in plan.rooms if r.type.value not in _VIRTUAL]
    assert real, "expected enclosed rooms on a ~126 m² pentagon"
    for r in real:
        assert ShapelyPolygon(r.polygon).within(env_poly), (
            f"room '{r.id}' escapes the buildable envelope polygon"
        )
    # the true boundary survives into the plan for the exporters
    assert plan.plot.polygon is not None and len(plan.plot.polygon) == len(PENTAGON)


def test_rect_polygon_matches_plain_rect_run():
    # A 4-vertex polygon that IS the width x depth rectangle must not change the
    # design: same env (per-edge setbacks), so same room count and total area.
    w, d = 9.144, 12.192
    rect_poly = [(0.0, 0.0), (w, 0.0), (w, d), (0.0, d)]
    base_plan, _, base_code, _ = generate_plan(2, _plot(polygon=None, w=w, d=d))
    poly_plan, _, poly_code, poly_meta = generate_plan(2, _plot(polygon=rect_poly, w=w, d=d))
    assert poly_meta["polygonMode"].startswith("rect-equivalent")
    assert poly_meta["envelopeUtilization"] == 1.0
    assert len(poly_plan.rooms) == len(base_plan.rooms)
    base_area = sum(r.area_sqm for r in base_plan.rooms)
    poly_area_total = sum(r.area_sqm for r in poly_plan.rooms)
    assert abs(poly_area_total - base_area) <= 0.10 * base_area
    assert poly_code.summary.fail_count == base_code.summary.fail_count == 0


def test_degenerate_tiny_polygon_raises():
    # 3x3 m rect-equivalent: the per-edge setback envelope collapses below 2 m.
    with pytest.raises(ValueError):
        generate_plan(2, _plot(polygon=[(0, 0), (3, 0), (3, 3), (0, 3)], w=3, d=3))
    # 3x3 m triangle: the uniform inset swallows the polygon entirely.
    with pytest.raises(ValueError):
        generate_plan(2, _plot(polygon=[(0, 0), (3, 0), (0, 3)], w=3, d=3))
