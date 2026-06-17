"""MEP (mechanical / electrical / plumbing) model derived from a Plan.

A faithful Python port of the web app's ``web/lib/mep.ts`` so the engine builds
plumbing runs, electrical points and clash checks exactly the way the on-screen
viewer does.

Coordinates are in METRES; origin = plot SW corner, +x = East, +y = North.
Keep this in lock-step with ``web/lib/mep.ts``.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Optional

from app.models.plan import Plan, Room
from app.services.cad_geom import (
    PlacedOpening,
    Rect,
    bounds,
    building_footprint,
    exterior_edges,
    floor_rooms,
    is_wet,
    place_openings,
    room_center,
)

# Literal-string unions kept as plain ``str`` (no enums), per the TS source.
# FixtureKind:    "wc" | "basin" | "shower" | "sink" | "floor_drain" | "washing_machine"
# ServiceKind:    "cold" | "hot" | "soil" | "waste" | "vent" | "rainwater"
# ElectricalKind: "light" | "fan" | "socket6a" | "socket16a" | "ac" | "exhaust"
#                 | "geyser" | "switchboard" | "db" | "bell"
# MepNodeKind:    "oht" | "sump" | "pump" | "meter" | "inspection" | "septic" | "rainpit"


@dataclass
class Fixture:
    id: str
    room_id: str
    kind: str
    x: float
    y: float


@dataclass
class PipeRun:
    id: str
    room_id: str
    service: str
    points: list[tuple[float, float]]
    size_mm: int
    slope: Optional[str] = None
    label: Optional[str] = None


@dataclass
class ElecPoint:
    id: str
    room_id: str
    kind: str
    x: float
    y: float
    # Final sub-circuit this point sits on (lighting / power / kitchen / AC / geyser / pump).
    circuit: Optional[str] = None


@dataclass
class MepNode:
    """A whole-house services node drawn as a labelled symbol: overhead tank,
    underground sump + pump, energy meter, drainage inspection chamber, septic
    tank, rainwater-harvesting pit — the fixed plant a real Indian house is
    built around. ``kind`` is one of the MepNodeKind strings above."""

    id: str
    kind: str
    x: float
    y: float
    label: str


@dataclass
class Circuit:
    """A final electrical sub-circuit off the DB, with its protective MCB rating."""

    id: str
    name: str
    mcb_a: int
    phase: str  # "1ph" | "3ph"
    points: int


@dataclass
class Conduit:
    id: str
    room_id: str
    points: list[tuple[float, float]]


@dataclass
class Clash:
    id: str
    rule_id: str
    severity: str
    message: str


@dataclass
class ServiceLegendItem:
    service: str
    label: str
    color: str
    width: float
    dash: Optional[str] = None


@dataclass
class MepModel:
    floor: Optional[int]
    rooms: list[Room]
    wet_rooms: list[Room]
    fixtures: list[Fixture]
    shaft: Optional[Rect]
    pipes: list[PipeRun]
    elec: list[ElecPoint]
    db: Optional[ElecPoint]
    conduits: list[Conduit]
    # Whole-house plant: OHT, sump, pump, meter, inspection chamber, septic, rain pit.
    nodes: list[MepNode]
    # Final electrical sub-circuits off the DB with their MCB ratings.
    circuits: list[Circuit]
    clashes: list[Clash]
    summary: dict
    legend: list[ServiceLegendItem]


SERVICE_STYLE: dict[str, ServiceLegendItem] = {
    "cold": ServiceLegendItem(service="cold", label="Cold supply", color="#2563eb", width=0.05),
    "hot": ServiceLegendItem(service="hot", label="Hot supply", color="#dc2626", width=0.05),
    "soil": ServiceLegendItem(service="soil", label="Soil (WC)", color="#7c4a1e", width=0.1),
    "waste": ServiceLegendItem(
        service="waste", label="Waste", color="#15803d", dash="0.22 0.14", width=0.06
    ),
    "vent": ServiceLegendItem(
        service="vent", label="Vent", color="#0891b2", dash="0.1 0.12", width=0.035
    ),
    "rainwater": ServiceLegendItem(
        service="rainwater", label="Rainwater", color="#7c3aed", width=0.06
    ),
}

SUPPLY_MAIN = 25
SUPPLY_MAIN_MM = 25
SUPPLY_BRANCH_MM = 15
INSET = 0.4


def wet_wall(r: Rect, fp: Rect) -> str:
    """Pick the wall a wet room's fixtures hug: first exterior in S,W,E,N order,
    else the closest interior wall (tie-break bottom > left > right > top)."""
    ext = exterior_edges(r, fp)
    order = ["S", "W", "E", "N"]
    exterior = next((e for e in order if ext[e]), None)
    if exterior:
        return exterior
    dl = r.x - fp.x
    dr = fp.x + fp.w - (r.x + r.w)
    db = r.y - fp.y
    dt = fp.y + fp.h - (r.y + r.h)
    mn = min(dl, dr, db, dt)
    if mn == db:
        return "S"
    if mn == dl:
        return "W"
    if mn == dr:
        return "E"
    return "N"


def along_wall(r: Rect, edge: str, n: int) -> list[tuple[float, float]]:
    """Evenly distribute ``n`` points along ``edge`` of rect ``r``, inset INSET
    off the wall and 0.3 m clear of each corner."""
    pts: list[tuple[float, float]] = []
    horiz = edge == "N" or edge == "S"
    lo = r.x if horiz else r.y
    span = r.w if horiz else r.h
    usable = max(0.1, span - 0.6)
    start = lo + 0.3
    for i in range(n):
        t = 0.5 if n == 1 else i / (n - 1)
        u = start + t * usable
        if horiz:
            y = r.y + INSET if edge == "S" else r.y + r.h - INSET
            pts.append((u, y))
        else:
            x = r.x + INSET if edge == "W" else r.x + r.w - INSET
            pts.append((x, u))
    return pts


def fixtures_for(room: Room, fp: Rect) -> list[Fixture]:
    r = bounds(room.polygon)
    if r.w < 0.6 or r.h < 0.6:
        return []
    edge = wet_wall(r, fp)
    # a rear "utility / wash" balcony plumbs like a wash area even though it's typed balcony
    t = "utility" if re.search(r"utility|wash", room.id) else room.type.value
    if re.search(r"toilet|bath", t):
        kinds = ["wc", "basin", "shower"]
    elif re.search(r"kitchen", t):
        kinds = ["sink"]
    elif re.search(r"utility|wash", t):
        kinds = ["washing_machine", "floor_drain"]
    else:
        kinds = ["floor_drain"]
    pts = along_wall(r, edge, len(kinds))
    return [
        Fixture(id=f"fx-{room.id}-{kind}", room_id=room.id, kind=kind, x=pts[i][0], y=pts[i][1])
        for i, kind in enumerate(kinds)
    ]


def drain_size(kind: str) -> dict:
    if kind == "wc":
        return {"service": "soil", "mm": 100}
    if kind == "basin":
        return {"service": "waste", "mm": 40}
    if kind == "sink":
        return {"service": "waste", "mm": 50}
    if kind in ("shower", "floor_drain", "washing_machine"):
        return {"service": "waste", "mm": 75}
    raise ValueError(f"unknown fixture kind: {kind}")


SHAFT_W = 0.5
SHAFT_H = 0.6


def compute_shaft(wet_rooms: list[Room], w: float, d: float) -> Optional[Rect]:
    """Place a vertical service shaft on the plot edge nearest the wet-room
    centroid (tie-break left > right > bottom > top)."""
    if not wet_rooms:
        return None
    cx = 0.0
    cy = 0.0
    for room in wet_rooms:
        c = room_center(room)
        cx += c[0]
        cy += c[1]
    cx /= len(wet_rooms)
    cy /= len(wet_rooms)
    dl = cx
    dr = w - cx
    db = cy
    dt = d - cy
    mn = min(dl, dr, db, dt)

    def clamp(v: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, v))

    if mn == dl:
        x = 0.05
        y = clamp(cy - SHAFT_H / 2, 0.05, d - SHAFT_H - 0.05)
    elif mn == dr:
        x = w - SHAFT_W - 0.05
        y = clamp(cy - SHAFT_H / 2, 0.05, d - SHAFT_H - 0.05)
    elif mn == db:
        x = clamp(cx - SHAFT_W / 2, 0.05, w - SHAFT_W - 0.05)
        y = 0.05
    else:
        x = clamp(cx - SHAFT_W / 2, 0.05, w - SHAFT_W - 0.05)
        y = d - SHAFT_H - 0.05
    return Rect(x=x, y=y, w=SHAFT_W, h=SHAFT_H)


def shaft_port(shaft: Rect) -> tuple[float, float]:
    return (shaft.x + shaft.w / 2, shaft.y + shaft.h / 2)


def manhattan(
    from_: tuple[float, float], to: tuple[float, float]
) -> list[tuple[float, float]]:
    return [from_, (to[0], from_[1]), to]


def build_plumbing(
    wet_rooms: list[Room], fixtures: list[Fixture], shaft: Optional[Rect]
) -> list[PipeRun]:
    if not shaft:
        return []
    port = shaft_port(shaft)
    runs: list[PipeRun] = []
    by_room: dict[str, list[Fixture]] = {}
    for f in fixtures:
        by_room.setdefault(f.room_id, []).append(f)
    for room in wet_rooms:
        fxs = by_room.get(room.id, [])
        for f in fxs:
            ds = drain_size(f.kind)
            service = ds["service"]
            mm = ds["mm"]
            runs.append(
                PipeRun(
                    id=f"drain-{f.id}",
                    room_id=room.id,
                    service=service,
                    points=manhattan((f.x, f.y), port),
                    size_mm=mm,
                    slope="1:40",
                    label=f"{mm}∅",
                )
            )
        c = room_center(room)
        runs.append(
            PipeRun(
                id=f"cold-{room.id}",
                room_id=room.id,
                service="cold",
                points=manhattan(port, (c[0], c[1])),
                size_mm=SUPPLY_BRANCH_MM,
                label=f"{SUPPLY_BRANCH_MM}∅",
            )
        )
        if re.search(r"toilet|bath|kitchen", room.type.value):
            runs.append(
                PipeRun(
                    id=f"hot-{room.id}",
                    room_id=room.id,
                    service="hot",
                    points=manhattan((port[0], port[1] + 0.1), (c[0], c[1] + 0.12)),
                    size_mm=SUPPLY_BRANCH_MM,
                    label=f"{SUPPLY_BRANCH_MM}∅",
                )
            )
        if any(f.kind == "wc" for f in fxs):
            runs.append(
                PipeRun(
                    id=f"vent-{room.id}",
                    room_id=room.id,
                    service="vent",
                    points=[
                        (port[0] + 0.12, port[1]),
                        (port[0] + 0.12, port[1] - 0.5),
                    ],
                    size_mm=50,
                )
            )
    return runs


ELEC_SCHEDULE: dict[str, dict[str, int]] = {
    "living": {"light": 3, "fan": 2, "socket6a": 4, "socket16a": 2, "ac": 1},
    "master_bedroom": {"light": 2, "fan": 1, "socket6a": 3, "ac": 1},
    "bedroom": {"light": 2, "fan": 1, "socket6a": 3, "ac": 1},
    "childrens_bedroom": {"light": 2, "fan": 1, "socket6a": 3, "ac": 1},
    "kitchen": {"light": 2, "socket6a": 4, "socket16a": 3, "exhaust": 1},
    "dining": {"light": 1, "fan": 1, "socket6a": 2},
    "toilet": {"light": 1, "exhaust": 1, "geyser": 1},
    "bathroom": {"light": 1, "exhaust": 1, "geyser": 1},
    "pooja": {"light": 1},
    "study": {"light": 2, "fan": 1, "socket6a": 2},
    "balcony": {"light": 1},
    "sitout": {"light": 1},
    "staircase": {"light": 1},
    "entrance": {"light": 1, "bell": 1},
}


def spread(r: Rect, n: int) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    y = r.y + 0.3
    usable = max(0.1, r.w - 0.6)
    for i in range(n):
        t = 0.5 if n == 1 else i / (n - 1)
        pts.append((r.x + 0.3 + t * usable, y))
    return pts


def elec_for(room: Room, door: Optional[PlacedOpening]) -> list[ElecPoint]:
    # the rear utility/wash balcony gets a light + a 16A point for the washing machine
    if re.search(r"utility|wash", room.id):
        spec: Optional[dict[str, int]] = {"light": 1, "socket16a": 1}
    else:
        spec = ELEC_SCHEDULE.get(room.type.value)
    if not spec:
        return []
    r = bounds(room.polygon)
    c = room_center(room)
    out: list[ElecPoint] = []

    def push(kind: str, x: float, y: float) -> None:
        out.append(
            ElecPoint(id=f"e-{room.id}-{kind}-{len(out)}", room_id=room.id, kind=kind, x=x, y=y)
        )

    n_light = spec.get("light", 0)
    for i in range(n_light):
        off = 0.0 if n_light == 1 else (i - (n_light - 1) / 2) * min(0.6, r.w / (n_light + 1))
        push("light", c[0] + off, c[1] + (0.18 if i % 2 else -0.18))
    for i in range(spec.get("fan", 0)):
        push("fan", c[0], c[1])
    sockets = ["socket6a"] * spec.get("socket6a", 0) + ["socket16a"] * spec.get("socket16a", 0)
    sp = spread(r, len(sockets))
    for i, kind in enumerate(sockets):
        push(kind, sp[i][0], sp[i][1])
    for i in range(spec.get("ac", 0)):
        push("ac", r.x + r.w - 0.5, r.y + r.h - 0.3)
    for i in range(spec.get("exhaust", 0)):
        push("exhaust", r.x + r.w - 0.35, r.y + r.h - 0.35)
    for i in range(spec.get("geyser", 0)):
        push("geyser", r.x + 0.35, r.y + r.h - 0.35)
    for i in range(spec.get("bell", 0)):
        push("bell", c[0], r.y + r.h - 0.3)
    if door:
        horiz = door.edge == "N" or door.edge == "S"
        latch_off = 0.35
        sx = door.cx
        sy = door.cy
        if horiz:
            sx = door.cx + door.length / 2 + latch_off * 0.6
            sy = door.cy + 0.25 if door.edge == "S" else door.cy - 0.25
        else:
            sy = door.cy + door.length / 2 + latch_off * 0.6
            sx = door.cx + 0.25 if door.edge == "W" else door.cx - 0.25
        sx = max(r.x + 0.15, min(r.x + r.w - 0.15, sx))
        sy = max(r.y + 0.15, min(r.y + r.h - 0.15, sy))
        push("switchboard", sx, sy)
    return out


def place_db(rooms: list[Room]) -> Optional[ElecPoint]:
    host = (
        next((r for r in rooms if r.type.value == "entrance" and not is_wet(r.type.value)), None)
        or next((r for r in rooms if r.type.value == "living"), None)
        or next(
            (r for r in rooms if not is_wet(r.type.value) and r.type.value != "staircase"), None
        )
    )
    if not host:
        return None
    r = bounds(host.polygon)
    return ElecPoint(
        id="db-main", room_id=host.id, kind="db", x=r.x + min(0.6, r.w / 2), y=r.y + 0.4
    )


def build_conduits(elec: list[ElecPoint], db: Optional[ElecPoint]) -> list[Conduit]:
    if not db:
        return []
    boards = [p for p in elec if p.kind == "switchboard"]
    return [
        Conduit(id=f"cd-{b.room_id}", room_id=b.room_id, points=manhattan((b.x, b.y), (db.x, db.y)))
        for b in boards
    ]


# --------------------------------------------------------------------------- #
# Whole-house services: overhead tank + sump + pump, drainage outlet, rainwater
# --------------------------------------------------------------------------- #

DOWNTAKE_MM = 32  # OHT gravity down-take main
PUMP_RISER_MM = 25  # sump -> OHT delivery
SOIL_MAIN_MM = 110  # shaft -> inspection chamber -> septic
RWP_MM = 75  # rainwater downpipe


def clamp_pt(p: tuple[float, float], w: float, d: float) -> tuple[float, float]:
    return (max(0.2, min(w - 0.2, p[0])), max(0.2, min(d - 0.2, p[1])))


def build_water_source(
    fp: Optional[Rect], shaft: Optional[Rect], w: float, d: float
) -> tuple[list[MepNode], list[PipeRun]]:
    """Water supply the Indian way: municipal/borewell -> underground SUMP (NE) ->
    PUMP lifts to the OVERHEAD TANK on the roof (SW) -> a gravity DOWN-TAKE main
    feeds the shaft manifold, where the per-room cold branches tap off."""
    if not fp:
        return ([], [])
    oht = clamp_pt((fp.x + 0.8, fp.y + 0.8), w, d)  # SW (Vastu: tank SW)
    sump = clamp_pt((fp.x + fp.w - 0.8, fp.y + fp.h - 0.8), w, d)  # NE (Vastu: water NE)
    pump = clamp_pt((sump[0] - 1.1, sump[1]), w, d)
    nodes: list[MepNode] = [
        MepNode(id="oht", kind="oht", x=oht[0], y=oht[1], label="OHT 1000L"),
        MepNode(id="sump", kind="sump", x=sump[0], y=sump[1], label="Sump"),
        MepNode(id="pump", kind="pump", x=pump[0], y=pump[1], label="Pump"),
    ]
    pipes: list[PipeRun] = [
        PipeRun(
            id="supply-riser",
            room_id="service",
            service="cold",
            points=[sump, pump, (pump[0], oht[1]), oht],
            size_mm=PUMP_RISER_MM,
            label=f"{PUMP_RISER_MM}∅",
        ),
    ]
    if shaft:
        port = shaft_port(shaft)
        pipes.append(
            PipeRun(
                id="downtake",
                room_id="service",
                service="cold",
                points=[oht, (oht[0], port[1]), port],
                size_mm=DOWNTAKE_MM,
                label=f"{DOWNTAKE_MM}∅",
            )
        )
    return (nodes, pipes)


def build_drainage_outlet(
    fp: Optional[Rect], shaft: Optional[Rect], w: float, d: float
) -> tuple[list[MepNode], list[PipeRun]]:
    """Drainage outlet: soil/waste gathered at the shaft runs to an INSPECTION
    CHAMBER just outside, then to the SEPTIC TANK / sewer at the plot edge
    (110 mm, 1:40)."""
    if not shaft or not fp:
        return ([], [])
    port = shaft_port(shaft)
    fcx = fp.x + fp.w / 2
    fcy = fp.y + fp.h / 2
    dx = port[0] - fcx
    dy = port[1] - fcy
    m = math.hypot(dx, dy) or 1
    dx /= m
    dy /= m
    ic = clamp_pt((port[0] + dx * 0.8, port[1] + dy * 0.8), w, d)
    septic = clamp_pt((port[0] + dx * 2.2, port[1] + dy * 2.2), w, d)
    nodes: list[MepNode] = [
        MepNode(id="ic", kind="inspection", x=ic[0], y=ic[1], label="IC"),
        MepNode(id="septic", kind="septic", x=septic[0], y=septic[1], label="Septic"),
    ]
    pipes: list[PipeRun] = [
        PipeRun(
            id="soil-outlet",
            room_id="service",
            service="soil",
            points=[port, ic, septic],
            size_mm=SOIL_MAIN_MM,
            slope="1:40",
            label=f"{SOIL_MAIN_MM}∅",
        ),
    ]
    return (nodes, pipes)


def build_rainwater(
    fp: Optional[Rect], w: float, d: float
) -> tuple[list[MepNode], list[PipeRun]]:
    """Rainwater: downpipes at the two front building corners carry roof run-off
    to a recharge PIT (rainwater harvesting), as required by most Indian
    municipalities."""
    if not fp:
        return ([], [])
    pit = clamp_pt((fp.x + fp.w + 0.5, fp.y - 0.4), w, d)
    corners = [
        (fp.x + 0.15, fp.y + 0.15),
        (fp.x + fp.w - 0.15, fp.y + 0.15),
    ]
    nodes: list[MepNode] = [MepNode(id="rainpit", kind="rainpit", x=pit[0], y=pit[1], label="RWH pit")]
    pipes: list[PipeRun] = [
        PipeRun(
            id=f"rwp-{i}",
            room_id="service",
            service="rainwater",
            points=[c, (c[0], pit[1]), pit],
            size_mm=RWP_MM,
            label=f"{RWP_MM}∅",
        )
        for i, c in enumerate(corners)
    ]
    return (nodes, pipes)


def assign_circuits(elec: list[ElecPoint]) -> list[Circuit]:
    """Tag every electrical point with its final sub-circuit and return the
    circuit schedule (lighting / power / kitchen / AC / geyser / pump) with MCB
    ratings — the way an Indian DB is actually loaded."""

    def circuit_of(p: ElecPoint) -> str:
        if p.kind in ("light", "fan", "bell", "exhaust"):
            return "Lighting"
        if p.kind == "socket16a":
            return "Kitchen/Power"
        if p.kind == "ac":
            return "AC"
        if p.kind == "geyser":
            return "Geyser"
        return "Power"  # socket6a etc.

    counts: dict[str, int] = {}
    for p in elec:
        if p.kind in ("switchboard", "db"):
            continue
        p.circuit = circuit_of(p)
        counts[p.circuit] = counts.get(p.circuit, 0) + 1
    spec: dict[str, dict[str, int | str]] = {
        "Lighting": {"mcb_a": 6, "phase": "1ph"},
        "Power": {"mcb_a": 16, "phase": "1ph"},
        "Kitchen/Power": {"mcb_a": 20, "phase": "1ph"},
        "AC": {"mcb_a": 20, "phase": "1ph"},
        "Geyser": {"mcb_a": 16, "phase": "1ph"},
        "Pump": {"mcb_a": 16, "phase": "1ph"},
    }
    order = ["Lighting", "Power", "Kitchen/Power", "AC", "Geyser", "Pump"]
    return [
        Circuit(
            id=f"ckt-{n}",
            name=n,
            mcb_a=spec[n]["mcb_a"],  # type: ignore[arg-type]
            phase=spec[n]["phase"],  # type: ignore[arg-type]
            points=counts.get(n, 1 if n == "Pump" else 0),
        )
        for n in order
        if counts.get(n, 0) > 0 or n == "Pump"
    ]


def point_in_rect(x: float, y: float, r: Rect, pad: float = 0) -> bool:
    return x >= r.x - pad and x <= r.x + r.w + pad and y >= r.y - pad and y <= r.y + r.h + pad


def door_clearance(px: float, py: float, door: PlacedOpening) -> float:
    half = door.length / 2
    horiz = door.edge == "N" or door.edge == "S"
    a = (door.cx - half, door.cy) if horiz else (door.cx, door.cy - half)
    b = (door.cx + half, door.cy) if horiz else (door.cx, door.cy + half)
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    len2 = (dx * dx + dy * dy) or 1
    t = ((px - a[0]) * dx + (py - a[1]) * dy) / len2
    t = max(0, min(1, t))
    return math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))


def compute_clashes(
    plan: Plan,
    floor: Optional[int],
    wet_rooms: list[Room],
    fixtures: list[Fixture],
    db: Optional[ElecPoint],
    elec: list[ElecPoint],
    doors: list[PlacedOpening],
) -> list[Clash]:
    out: list[Clash] = []
    if db:
        over = next(
            (r for r in wet_rooms if point_in_rect(db.x, db.y, bounds(r.polygon))), None
        )
        if over:
            out.append(
                Clash(
                    id="clash-db-wet",
                    rule_id="DB_IN_WET",
                    severity="error",
                    message="Distribution board sits in/over a wet area.",
                )
            )
    if floor is not None and floor > 0:
        below = [
            r for r in plan.rooms if (r.floor or 0) == floor - 1 and is_wet(r.type.value)
        ]
        for room in wet_rooms:
            c = room_center(room)
            stacked = any(
                math.hypot(room_center(b)[0] - c[0], room_center(b)[1] - c[1]) <= 0.5
                for b in below
            )
            if not stacked:
                out.append(
                    Clash(
                        id=f"clash-stack-{room.id}",
                        rule_id="WET_NOT_STACKED",
                        severity="warn",
                        message="Wet area not stacked over the floor below.",
                    )
                )
    door_by_room = {d.room_id: d for d in doors if d.kind == "door"}
    for p in elec:
        if p.kind != "switchboard":
            continue
        door = door_by_room.get(p.room_id)
        if not door:
            continue
        if door_clearance(p.x, p.y, door) <= door.length * 0.9:
            out.append(
                Clash(
                    id=f"clash-swb-{p.room_id}",
                    rule_id="SWB_IN_SWING",
                    severity="warn",
                    message="Switchboard falls within a door swing.",
                )
            )
    for f in fixtures:
        door = door_by_room.get(f.room_id)
        if not door:
            continue
        if door_clearance(f.x, f.y, door) <= 0.45:
            out.append(
                Clash(
                    id=f"clash-fx-{f.id}",
                    rule_id="FIXTURE_AT_DOOR",
                    severity="warn",
                    message="Fixture encroaches on a door opening.",
                )
            )
    return out


def build_mep_model(plan: Plan, floor: Optional[int] = None) -> MepModel:
    w = plan.plot.width_m
    d = plan.plot.depth_m
    fp = building_footprint(plan, floor)
    rooms = floor_rooms(plan, floor)
    wet_rooms = [r for r in rooms if is_wet(r.type.value) or re.search(r"utility|wash", r.id)]
    fixtures = [f for r in wet_rooms for f in fixtures_for(r, fp)]
    shaft = compute_shaft(wet_rooms, w, d)
    pipes = build_plumbing(wet_rooms, fixtures, shaft)

    # whole-house plant + mains: OHT down-take, sump + pump, drainage outlet to the
    # septic tank, and rainwater downpipes to a recharge pit.
    water = build_water_source(fp, shaft, w, d)
    drain = build_drainage_outlet(fp, shaft, w, d)
    rain = build_rainwater(fp, w, d)
    nodes: list[MepNode] = [*water[0], *drain[0], *rain[0]]
    pipes += [*water[1], *drain[1], *rain[1]]

    placed = place_openings(plan)
    room_ids = {r.id for r in rooms}
    floor_doors = [o for o in placed if o.room_id in room_ids]
    door_by_room = {d_.room_id: d_ for d_ in floor_doors if d_.kind == "door"}
    elec = [e for r in rooms for e in elec_for(r, door_by_room.get(r.id))]
    db = place_db(rooms)
    if db:
        elec.append(db)
    conduits = build_conduits(elec, db)
    # energy meter at the entry; the metered service main runs meter -> DB.
    if db:
        meter = clamp_pt((db.x, db.y - 0.9), w, d)
        nodes.append(MepNode(id="meter", kind="meter", x=meter[0], y=meter[1], label="Meter"))
        conduits.append(Conduit(id="cd-main", room_id="service", points=[meter, (db.x, db.y)]))
    circuits = assign_circuits(elec)

    clashes = compute_clashes(plan, floor, wet_rooms, fixtures, db, elec, floor_doors)
    summary = {
        "errors": len([c for c in clashes if c.severity == "error"]),
        "warns": len([c for c in clashes if c.severity == "warn"]),
    }
    used = {p.service for p in pipes}
    order = ["cold", "hot", "soil", "waste", "vent", "rainwater"]
    legend = [SERVICE_STYLE[s] for s in order if s in used]
    return MepModel(
        floor=floor,
        rooms=rooms,
        wet_rooms=wet_rooms,
        fixtures=fixtures,
        shaft=shaft,
        pipes=pipes,
        elec=elec,
        db=db,
        conduits=conduits,
        nodes=nodes,
        circuits=circuits,
        clashes=clashes,
        summary=summary,
        legend=legend,
    )
