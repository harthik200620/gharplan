"""DXF export (ezdxf, R2010).

Each room is a closed LWPOLYLINE on a per-room-type layer with an MTEXT label
(name + area) at its centroid. The plot boundary is dimensioned (width + depth),
a north arrow is drawn, and a title block carries the project name + disclaimer.
"""

from __future__ import annotations

import io

import ezdxf
from ezdxf.enums import TextEntityAlignment

from app.config import DISCLAIMER_EXPORT
from app.models.enums import room_label
from app.models.plan import Plan

# AutoCAD Color Index per room type (cosmetic).
ROOM_ACI = {
    "kitchen": 1,
    "pooja": 2,
    "master_bedroom": 5,
    "bedroom": 5,
    "childrens_bedroom": 4,
    "living": 3,
    "dining": 30,
    "toilet": 6,
    "bathroom": 6,
    "staircase": 8,
    "entrance": 40,
    "study": 5,
    "store": 9,
    "utility": 9,
    "balcony": 3,
    "parking": 8,
    "overhead_tank": 6,
    "borewell": 6,
    "brahmasthan": 2,
}


def _layer_name(room_type: str) -> str:
    return f"ROOM_{room_type.upper()}"


def build_dxf(plan: Plan) -> bytes:
    doc = ezdxf.new("R2010", setup=True)
    msp = doc.modelspace()

    w = plan.plot.width_m
    d = plan.plot.depth_m

    # --- plot boundary ---
    if "PLOT" not in doc.layers:
        doc.layers.add("PLOT", color=7)
    msp.add_lwpolyline([(0, 0), (w, 0), (w, d), (0, d)], close=True, dxfattribs={"layer": "PLOT"})

    # --- rooms ---
    for room in plan.rooms:
        layer = _layer_name(room.type.value)
        if layer not in doc.layers:
            doc.layers.add(layer, color=ROOM_ACI.get(room.type.value, 7))
        pts = [(float(x), float(y)) for x, y in room.polygon]
        msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": layer})

        cx, cy = (room.centroid or (0.0, 0.0))
        label = f"{room_label(room.type.value)}\\P{round(room.area_sqm, 2)} m2"
        mt = msp.add_mtext(label, dxfattribs={"layer": layer, "char_height": 0.18})
        mt.set_location((float(cx), float(cy)), attachment_point=5)  # 5 = middle-center

    # --- dimensions (plot width along bottom, depth along left) ---
    msp.add_linear_dim(
        base=(0, -1.2), p1=(0, 0), p2=(w, 0), dimstyle="EZDXF", override={"dimtxt": 0.25}
    ).render()
    msp.add_linear_dim(
        base=(-1.2, 0), p1=(0, 0), p2=(0, d), angle=90, dimstyle="EZDXF", override={"dimtxt": 0.25}
    ).render()

    # --- north arrow (top-right, pointing +y = North) ---
    if "NORTH" not in doc.layers:
        doc.layers.add("NORTH", color=1)
    nx, ny = w + 1.2, d - 1.5
    msp.add_lwpolyline([(nx, ny), (nx, ny + 1.2)], dxfattribs={"layer": "NORTH"})
    msp.add_lwpolyline(
        [(nx - 0.18, ny + 0.85), (nx, ny + 1.2), (nx + 0.18, ny + 0.85)],
        dxfattribs={"layer": "NORTH"},
    )
    msp.add_text("N", dxfattribs={"layer": "NORTH", "height": 0.3}).set_placement(
        (nx, ny + 1.4), align=TextEntityAlignment.MIDDLE_CENTER
    )

    # --- title block / disclaimer below the plot ---
    if "TITLE" not in doc.layers:
        doc.layers.add("TITLE", color=7)
    msp.add_text(
        f"GharPlan - {plan.project.name}", dxfattribs={"layer": "TITLE", "height": 0.35}
    ).set_placement((0, -2.2), align=TextEntityAlignment.LEFT)
    msp.add_text(
        DISCLAIMER_EXPORT, dxfattribs={"layer": "TITLE", "height": 0.22}
    ).set_placement((0, -2.9), align=TextEntityAlignment.LEFT)

    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode(doc.encoding or "utf-8")
