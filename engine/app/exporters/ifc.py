"""IFC4 STEP (SPF) exporter — dependency-free, deterministic.

A hand-written ISO 10303-21 writer (no ifcopenshell): pure string building with
a monotonic entity-id allocator. Scope (v1):

- Spatial tree: IfcProject → IfcSite → IfcBuilding → one IfcBuildingStorey per
  floor (elevation = floor × 3.0 m). SI metre / m² / m³ units, one 3D 'Model'
  geometric representation context.
- One IfcSpace per REAL room — virtual markers and open site zones (parking,
  sitout, garden, service_shaft, future_expansion, balcony, courtyard,
  brahmasthan, borewell, overhead_tank) are skipped — with the room polygon as
  an IfcArbitraryClosedProfileDef extruded to the room's ceiling height.
- One IfcWallStandardCase per unique room-rectangle edge segment (shared edges
  between two rooms are de-duplicated), extruded rectangle body only:
  0.23 m thick on the floor outline, 0.115 m internal, 2.75 m clear height.
  No Axis representation and no IfcMaterialLayerSetUsage in v1.
- IfcDoor / IfcWindow entities placed from the shared ``place_openings`` model
  (the same inference the DXF/PDF/3D views draw) carrying overall width/height
  attributes only — no geometric representation and NO IfcOpeningElement
  boolean subtraction in v1.
- When a preliminary ``StructuralDesign`` is supplied (duck-typed; imported
  only under TYPE_CHECKING so this module has no hard dependency on the
  structural package): one IfcColumn per column member and one IfcFooting per
  footing member, extruded rectangle sections centred at (x_m, y_m).

Strings are sanitised to ASCII with parentheses folded to square brackets so
every emitted line has balanced parens; quotes are doubled per ISO 10303-21.
The FILE_NAME timestamp comes from ``plan.project.created_at`` (fallback
'2026-01-01T00:00:00'), so the payload is byte-deterministic for tests.
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING, Optional

from app.models.enums import room_label
from app.models.plan import Plan, Room
from app.services.cad_geom import (
    LEVELS,
    SITE_OPENINGS,
    VIRTUAL,
    bounds,
    building_footprint,
    floors_of,
    place_openings,
)

if TYPE_CHECKING:  # no runtime dependency — build_ifc duck-types the argument
    from app.structural.models import StructuralDesign

# Room types that never become an IfcSpace (site zones + point markers).
SKIP_TYPES = VIRTUAL | SITE_OPENINGS

WALL_EXT_T = 0.23  # m — walls on the building outline
WALL_INT_T = 0.115  # m — internal partitions
WALL_H = LEVELS.CEIL  # m — clear wall height (slab-to-soffit, v1)
_EDGE_TOL = 0.06  # m — segment-on-footprint tolerance (matches cad_geom)
_MIN_SEG = 0.08  # m — ignore degenerate room edges

_B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"


def _guid(seed: str) -> str:
    """Deterministic 22-char IFC GlobalId (base-64 of a 128-bit md5)."""
    n = int.from_bytes(hashlib.md5(seed.encode("utf-8")).digest(), "big")
    chars = []
    for _ in range(22):
        chars.append(_B64[n & 63])
        n >>= 6
    return "".join(reversed(chars))


def _f(v: float) -> str:
    """A STEP REAL literal — always carries a decimal point."""
    s = f"{float(v):.5f}".rstrip("0")
    return s + "0" if s.endswith(".") else s


def _s(v: object) -> str:
    """A STEP string literal: ASCII-only, parens folded to brackets (keeps every
    line's parens balanced), quotes doubled per ISO 10303-21."""
    text = str(v).replace("(", "[").replace(")", "]")
    text = text.encode("ascii", "replace").decode("ascii")
    text = text.replace("\\", "\\\\").replace("'", "''")
    return f"'{text}'"


class _Step:
    """Monotonic entity-id allocator + line buffer for the DATA section."""

    def __init__(self) -> None:
        self.lines: list[str] = []
        self._next_id = 0

    def add(self, body: str) -> int:
        self._next_id += 1
        self.lines.append(f"#{self._next_id}={body};")
        return self._next_id


# --------------------------------------------------------------------------- #
# Geometry helpers
# --------------------------------------------------------------------------- #


def _pt2(w: _Step, x: float, y: float) -> int:
    return w.add(f"IFCCARTESIANPOINT(({_f(x)},{_f(y)}))")


def _pt3(w: _Step, x: float, y: float, z: float) -> int:
    return w.add(f"IFCCARTESIANPOINT(({_f(x)},{_f(y)},{_f(z)}))")


def _placement(w: _Step, rel_to: Optional[int], x: float, y: float, z: float) -> int:
    loc = _pt3(w, x, y, z)
    ax = w.add(f"IFCAXIS2PLACEMENT3D(#{loc},$,$)")
    rel = f"#{rel_to}" if rel_to else "$"
    return w.add(f"IFCLOCALPLACEMENT({rel},#{ax})")


def _extruded_ring_shape(w: _Step, ctx: int, ring: list[tuple[float, float]], height: float) -> int:
    """IfcProductDefinitionShape: closed 2D ring extruded +z by ``height``."""
    pts = [_pt2(w, float(x), float(y)) for x, y in ring]
    pts.append(pts[0])  # close the polyline
    poly = w.add(f"IFCPOLYLINE(({','.join(f'#{p}' for p in pts)}))")
    prof = w.add(f"IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#{poly})")
    origin = _pt3(w, 0.0, 0.0, 0.0)
    pos = w.add(f"IFCAXIS2PLACEMENT3D(#{origin},$,$)")
    zdir = w.add("IFCDIRECTION((0.,0.,1.))")
    solid = w.add(f"IFCEXTRUDEDAREASOLID(#{prof},#{pos},#{zdir},{_f(height)})")
    rep = w.add(f"IFCSHAPEREPRESENTATION(#{ctx},'Body','SweptSolid',(#{solid}))")
    return w.add(f"IFCPRODUCTDEFINITIONSHAPE($,$,(#{rep}))")


def _extruded_rect_shape(w: _Step, ctx: int, xdim: float, ydim: float, height: float) -> int:
    """IfcProductDefinitionShape: rectangle centred at the local origin, +z."""
    centre = _pt2(w, 0.0, 0.0)
    pos2d = w.add(f"IFCAXIS2PLACEMENT2D(#{centre},$)")
    prof = w.add(f"IFCRECTANGLEPROFILEDEF(.AREA.,$,#{pos2d},{_f(xdim)},{_f(ydim)})")
    origin = _pt3(w, 0.0, 0.0, 0.0)
    pos = w.add(f"IFCAXIS2PLACEMENT3D(#{origin},$,$)")
    zdir = w.add("IFCDIRECTION((0.,0.,1.))")
    solid = w.add(f"IFCEXTRUDEDAREASOLID(#{prof},#{pos},#{zdir},{_f(height)})")
    rep = w.add(f"IFCSHAPEREPRESENTATION(#{ctx},'Body','SweptSolid',(#{solid}))")
    return w.add(f"IFCPRODUCTDEFINITIONSHAPE($,$,(#{rep}))")


def _open_ring(poly: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Drop a duplicated closing vertex so the ring is open (we re-close it)."""
    ring = [(float(x), float(y)) for x, y in poly]
    if len(ring) > 1 and abs(ring[0][0] - ring[-1][0]) < 1e-9 and abs(ring[0][1] - ring[-1][1]) < 1e-9:
        ring = ring[:-1]
    return ring


def _real_rooms(plan: Plan, floor: int) -> list[Room]:
    return [
        r
        for r in plan.rooms
        if (r.floor or 0) == floor and r.type.value not in SKIP_TYPES
    ]


def _wall_segments(plan: Plan, floor: int) -> list[tuple[float, float, float, float, bool]]:
    """Unique axis-aligned wall segments (x0,y0,x1,y1,exterior) for one floor.

    One segment per unique room-rectangle edge; an edge shared by two rooms
    collapses to a single wall. ``exterior`` when the segment lies on the
    floor's building-footprint outline (±tol)."""
    fp = building_footprint(plan, floor)
    segs: dict[tuple[float, float, float, float], tuple[float, float, float, float, bool]] = {}
    for room in _real_rooms(plan, floor):
        r = bounds(room.polygon)
        edges = [
            (r.x, r.y, r.x + r.w, r.y),  # S
            (r.x, r.y + r.h, r.x + r.w, r.y + r.h),  # N
            (r.x, r.y, r.x, r.y + r.h),  # W
            (r.x + r.w, r.y, r.x + r.w, r.y + r.h),  # E
        ]
        for x0, y0, x1, y1 in edges:
            if max(abs(x1 - x0), abs(y1 - y0)) < _MIN_SEG:
                continue
            key = (round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2))
            if key in segs:
                continue
            if abs(y1 - y0) < 1e-9:  # horizontal
                ext = abs(y0 - fp.y) <= _EDGE_TOL or abs(y0 - (fp.y + fp.h)) <= _EDGE_TOL
            else:  # vertical
                ext = abs(x0 - fp.x) <= _EDGE_TOL or abs(x0 - (fp.x + fp.w)) <= _EDGE_TOL
            segs[key] = (x0, y0, x1, y1, ext)
    return list(segs.values())


def _wall_ring(x0: float, y0: float, x1: float, y1: float, t: float) -> list[tuple[float, float]]:
    half = t / 2.0
    if abs(y1 - y0) < 1e-9:  # horizontal run
        return [(x0, y0 - half), (x1, y0 - half), (x1, y0 + half), (x0, y0 + half)]
    return [(x0 - half, y0), (x0 + half, y0), (x0 + half, y1), (x0 - half, y1)]


def _floor_name(f: int) -> str:
    if f == 0:
        return "Ground Floor"
    if f == 1:
        return "First Floor"
    if f == 2:
        return "Second Floor"
    return f"Floor {f}"


# --------------------------------------------------------------------------- #
# Writer
# --------------------------------------------------------------------------- #


def build_ifc(plan: Plan, structural: "StructuralDesign | None" = None) -> bytes:
    """Serialize a Plan (+ optional preliminary StructuralDesign) to IFC4 SPF."""
    w = _Step()
    pid = plan.project.id or "plan"

    def guid(tag: str) -> str:
        return _s(_guid(f"{pid}/{tag}"))

    # ---- units + context ----
    u_len = w.add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")
    u_area = w.add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)")
    u_vol = w.add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")
    units = w.add(f"IFCUNITASSIGNMENT((#{u_len},#{u_area},#{u_vol}))")
    wcs_origin = _pt3(w, 0.0, 0.0, 0.0)
    wcs = w.add(f"IFCAXIS2PLACEMENT3D(#{wcs_origin},$,$)")
    ctx = w.add(f"IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,{_f(1e-5)},#{wcs},$)")

    # ---- spatial tree ----
    project = w.add(
        f"IFCPROJECT({guid('project')},$,{_s(plan.project.name)},$,$,$,$,(#{ctx}),#{units})"
    )
    site_pl = _placement(w, None, 0.0, 0.0, 0.0)
    site = w.add(f"IFCSITE({guid('site')},$,'Site',$,$,#{site_pl},$,$,.ELEMENT.,$,$,$,$,$)")
    bldg_pl = _placement(w, site_pl, 0.0, 0.0, 0.0)
    building = w.add(
        f"IFCBUILDING({guid('building')},$,'Building',$,$,#{bldg_pl},$,$,.ELEMENT.,$,$,$)"
    )

    floors = floors_of(plan) or [0]
    storey_ids: dict[int, int] = {}
    storey_pl: dict[int, int] = {}
    for f in floors:
        elev = f * LEVELS.FLOOR_TO_FLOOR
        pl = _placement(w, bldg_pl, 0.0, 0.0, elev)
        storey_pl[f] = pl
        storey_ids[f] = w.add(
            f"IFCBUILDINGSTOREY({guid(f'storey/{f}')},$,{_s(_floor_name(f))},$,$,"
            f"#{pl},$,$,.ELEMENT.,{_f(elev)})"
        )

    w.add(f"IFCRELAGGREGATES({guid('rel/project-site')},$,$,$,#{project},(#{site}))")
    w.add(f"IFCRELAGGREGATES({guid('rel/site-building')},$,$,$,#{site},(#{building}))")
    storey_refs = ",".join(f"#{storey_ids[f]}" for f in floors)
    w.add(f"IFCRELAGGREGATES({guid('rel/building-storeys')},$,$,$,#{building},({storey_refs}))")

    contained: dict[int, list[int]] = {f: [] for f in floors}  # products per storey

    # ---- spaces ----
    spaces_by_floor: dict[int, list[int]] = {f: [] for f in floors}
    for room in plan.rooms:
        if room.type.value in SKIP_TYPES:
            continue
        f = room.floor or 0
        if f not in storey_ids:
            continue
        ring = _open_ring(room.polygon)
        shape = _extruded_ring_shape(w, ctx, ring, room.ceiling_height_m or 3.0)
        pl = _placement(w, storey_pl[f], 0.0, 0.0, 0.0)
        space = w.add(
            f"IFCSPACE({guid(f'space/{room.id}')},$,{_s(room_label(room.type.value))},$,$,"
            f"#{pl},#{shape},{_s(room.id)},.ELEMENT.,.INTERNAL.,$)"
        )
        spaces_by_floor[f].append(space)
    for f in floors:
        if spaces_by_floor[f]:
            refs = ",".join(f"#{s}" for s in spaces_by_floor[f])
            w.add(f"IFCRELAGGREGATES({guid(f'rel/storey-spaces/{f}')},$,$,$,#{storey_ids[f]},({refs}))")

    # ---- walls (per unique room-edge segment) ----
    n_wall = 0
    for f in floors:
        for x0, y0, x1, y1, ext in _wall_segments(plan, f):
            n_wall += 1
            t = WALL_EXT_T if ext else WALL_INT_T
            shape = _extruded_ring_shape(w, ctx, _wall_ring(x0, y0, x1, y1, t), WALL_H)
            pl = _placement(w, storey_pl[f], 0.0, 0.0, 0.0)
            wall = w.add(
                f"IFCWALLSTANDARDCASE({guid(f'wall/{n_wall}')},$,{_s(f'Wall W{n_wall}')},$,$,"
                f"#{pl},#{shape},{_s(f'W{n_wall}')},.STANDARD.)"
            )
            contained[f].append(wall)

    # ---- doors + windows (attribute-only, from the shared opening model) ----
    room_floor = {r.id: (r.floor or 0) for r in plan.rooms}
    n_door = n_win = 0
    for op in place_openings(plan):
        f = room_floor.get(op.room_id, 0)
        if f not in storey_ids:
            continue
        if op.kind == "door":
            n_door += 1
            pl = _placement(w, storey_pl[f], op.cx, op.cy, 0.0)
            door = w.add(
                f"IFCDOOR({guid(f'door/{n_door}')},$,{_s(f'Door {op.room_id}')},$,$,#{pl},$,"
                f"{_s(f'D{n_door}')},{_f(LEVELS.LINTEL)},{_f(op.length)},.DOOR.,$,$)"
            )
            contained[f].append(door)
        else:
            n_win += 1
            pl = _placement(w, storey_pl[f], op.cx, op.cy, LEVELS.SILL)
            win = w.add(
                f"IFCWINDOW({guid(f'window/{n_win}')},$,{_s(f'Window {op.room_id}')},$,$,#{pl},$,"
                f"{_s(f'N{n_win}')},{_f(LEVELS.LINTEL - LEVELS.SILL)},{_f(op.length)},.WINDOW.,$,$)"
            )
            contained[f].append(win)

    # ---- structural members (optional, duck-typed) ----
    if structural is not None:
        ground = floors[0]
        total_h = len(floors) * LEVELS.FLOOR_TO_FLOOR
        for m in getattr(structural, "members", []):
            kind = getattr(m, "kind", "")
            x_m, y_m = getattr(m, "x_m", None), getattr(m, "y_m", None)
            if x_m is None or y_m is None:
                continue
            size = getattr(m, "size_mm", (230, 230))
            if kind == "column":
                shape = _extruded_rect_shape(w, ctx, size[0] / 1000.0, size[1] / 1000.0, total_h)
                pl = _placement(w, storey_pl[ground], x_m, y_m, 0.0)
                col = w.add(
                    f"IFCCOLUMN({guid(f'column/{m.id}')},$,{_s(m.id)},$,$,#{pl},#{shape},"
                    f"{_s(m.id)},.COLUMN.)"
                )
                contained[ground].append(col)
            elif kind == "footing":
                thk = (getattr(m, "thickness_mm", None) or 300) / 1000.0
                shape = _extruded_rect_shape(w, ctx, size[0] / 1000.0, size[1] / 1000.0, thk)
                pl = _placement(w, storey_pl[ground], x_m, y_m, -LEVELS.FOOTING)
                foot = w.add(
                    f"IFCFOOTING({guid(f'footing/{m.id}')},$,{_s(m.id)},$,$,#{pl},#{shape},"
                    f"{_s(m.id)},.PAD_FOOTING.)"
                )
                contained[ground].append(foot)

    # ---- containment ----
    for f in floors:
        if contained[f]:
            refs = ",".join(f"#{e}" for e in contained[f])
            w.add(
                f"IFCRELCONTAINEDINSPATIALSTRUCTURE({guid(f'rel/contained/{f}')},$,$,$,"
                f"({refs}),#{storey_ids[f]})"
            )

    # ---- assemble the file ----
    stamp = plan.project.created_at or "2026-01-01T00:00:00"
    header = [
        "ISO-10303-21;",
        "HEADER;",
        "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
        f"FILE_NAME({_s(plan.project.name + '.ifc')},{_s(stamp)},('Vastukala AI'),"
        "('Vastukala AI'),'Vastukala AI IFC4 writer','Vastukala AI','');",
        "FILE_SCHEMA(('IFC4'));",
        "ENDSEC;",
        "DATA;",
    ]
    footer = ["ENDSEC;", "END-ISO-10303-21;", ""]
    return "\n".join(header + w.lines + footer).encode("ascii")
