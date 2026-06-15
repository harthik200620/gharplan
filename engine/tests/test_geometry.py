"""Polygon geometry helpers."""

from __future__ import annotations

import pytest

from app.services.geometry import area_of, centroid_of, perimeter_of, validate_polygon

SQ = [[0, 0], [4, 0], [4, 3], [0, 3]]


def test_area_perimeter_centroid():
    assert area_of(SQ) == pytest.approx(12.0)
    assert perimeter_of(SQ) == pytest.approx(14.0)
    assert centroid_of(SQ) == pytest.approx((2.0, 1.5))


def test_closed_ring_equals_open():
    closed = SQ + [[0, 0]]
    assert area_of(closed) == pytest.approx(area_of(SQ))
    assert perimeter_of(closed) == pytest.approx(perimeter_of(SQ))


def test_area_orientation_independent():
    cw = [[0, 0], [0, 3], [4, 3], [4, 0]]  # clockwise
    assert area_of(cw) == pytest.approx(12.0)


def test_valid_square():
    ok, reason = validate_polygon(SQ)
    assert ok and reason == ""


def test_invalid_too_few_points():
    ok, _ = validate_polygon([[0, 0], [1, 1]])
    assert not ok


def test_invalid_zero_area_collinear():
    ok, _ = validate_polygon([[0, 0], [1, 0], [2, 0]])
    assert not ok


def test_invalid_self_intersecting():
    bowtie = [[0, 0], [4, 4], [4, 0], [0, 4]]
    ok, _ = validate_polygon(bowtie)
    assert not ok
