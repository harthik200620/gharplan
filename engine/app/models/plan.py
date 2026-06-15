"""The canonical Plan schema — the contract every module is wired through.

Coordinates are in METRES. Origin = plot SW corner. +x = East, +y = North.
A room's compass ``zone`` is computed from its centroid relative to plot center.
``areaSqm``, ``perimeterM``, ``centroid`` and ``zone`` are *computed* fields:
``plan_service.normalize`` recomputes and overwrites them from ``polygon``.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import Field, field_validator

from .base import CamelModel
from .enums import City, Compass, Facing, RoomType, StateCode

# A 2D point [x, y] in metres.
Point = tuple[float, float]


class Project(CamelModel):
    id: str
    name: str
    client_name: Optional[str] = None
    created_at: Optional[str] = None


class Plot(CamelModel):
    width_m: float = Field(gt=0, description="Plot width along +x (East), metres")
    depth_m: float = Field(gt=0, description="Plot depth along +y (North), metres")
    area_sqm: float = Field(default=0.0, ge=0, description="Computed = width*depth")
    facing: Facing
    state: StateCode
    city: City
    floors: int = Field(default=1, ge=1)


class Opening(CamelModel):
    id: str
    room_id: str
    kind: Literal["door", "window"]
    width_m: float = Field(gt=0)
    height_m: float = Field(gt=0)
    count: int = Field(default=1, ge=1)


class Room(CamelModel):
    id: str
    type: RoomType
    polygon: list[Point] = Field(description="Closed ring of [x,y] metre vertices")
    area_sqm: float = Field(default=0.0, ge=0)
    perimeter_m: float = Field(default=0.0, ge=0)
    centroid: Optional[Point] = None
    zone: Optional[Compass] = None
    ceiling_height_m: float = Field(default=3.0, gt=0)

    @field_validator("polygon")
    @classmethod
    def _at_least_three_vertices(cls, v: list[Point]) -> list[Point]:
        # A polygon may be supplied open or closed; we need >=3 distinct corners.
        distinct = {(round(x, 6), round(y, 6)) for x, y in v}
        if len(distinct) < 3:
            raise ValueError("polygon needs at least 3 distinct vertices")
        return v


class Plan(CamelModel):
    schema_version: Literal["1.0"] = "1.0"
    project: Project
    plot: Plot
    rooms: list[Room]
    doors: list[Opening] = Field(default_factory=list)
    windows: list[Opening] = Field(default_factory=list)
