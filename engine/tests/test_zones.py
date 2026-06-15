"""Zone computation: 8 directions, sector boundaries, center, degenerate."""

from __future__ import annotations

import pytest

from app.services.zones import bearing_deg, sector, zone_of

W = D = 10.0  # square plot; center (5,5); 3x3 grid center cell = [3.333, 6.667]^2


@pytest.mark.parametrize(
    "pt,expected",
    [
        ((5, 9), "N"),
        ((9, 9), "NE"),
        ((9, 5), "E"),
        ((9, 1), "SE"),
        ((5, 1), "S"),
        ((1, 1), "SW"),
        ((1, 5), "W"),
        ((1, 9), "NW"),
        ((5, 5), "CENTER"),
    ],
)
def test_eight_directions_and_center(pt, expected):
    assert zone_of(pt[0], pt[1], W, D).value == expected


@pytest.mark.parametrize(
    "bearing,expected",
    [
        (0, "N"),
        (22.5, "NE"),
        (45, "NE"),
        (67.5, "E"),
        (90, "E"),
        (112.5, "SE"),
        (135, "SE"),
        (157.5, "S"),
        (180, "S"),
        (202.5, "SW"),
        (225, "SW"),
        (247.5, "W"),
        (270, "W"),
        (292.5, "NW"),
        (315, "NW"),
        (337.5, "N"),
        (350, "N"),
        (359.999, "N"),
    ],
)
def test_sector_boundaries(bearing, expected):
    # Half-open [lo, hi): an exact boundary belongs to the clockwise-next sector.
    assert sector(bearing).value == expected


def test_bearing_principal_directions():
    assert bearing_deg(0, 1) == 0.0  # +y = North
    assert bearing_deg(1, 0) == 90.0  # +x = East
    assert bearing_deg(0, -1) == 180.0  # South
    assert round(bearing_deg(-1, 0), 6) == 270.0  # West


def test_degenerate_center_never_hits_atan2():
    # Point exactly at plot center resolves to CENTER (guards atan2(0,0)).
    assert zone_of(5, 5, 10, 10).value == "CENTER"


def test_area_rect_strategy():
    assert zone_of(5, 5, 10, 10, strategy="area_rect_10pct").value == "CENTER"
    # 10% rect half-extent = sqrt(0.1)/2*10 ~= 1.58; (5,7) is outside -> N sector.
    assert zone_of(5, 7, 10, 10, strategy="area_rect_10pct").value == "N"


def test_non_square_plot_grid_center():
    # 3x3 grid center cell scales with aspect ratio.
    assert zone_of(4.572, 6.096, 9.144, 12.192).value == "CENTER"
    assert zone_of(1.0, 1.0, 9.144, 12.192).value == "SW"
