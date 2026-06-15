"""Canonical enumerations for the Plan contract."""

from __future__ import annotations

from enum import Enum


class RoomType(str, Enum):
    pooja = "pooja"
    kitchen = "kitchen"
    master_bedroom = "master_bedroom"
    bedroom = "bedroom"
    childrens_bedroom = "childrens_bedroom"
    living = "living"
    dining = "dining"
    toilet = "toilet"
    bathroom = "bathroom"
    staircase = "staircase"
    entrance = "entrance"
    study = "study"
    store = "store"
    utility = "utility"
    balcony = "balcony"
    parking = "parking"
    overhead_tank = "overhead_tank"
    borewell = "borewell"
    brahmasthan = "brahmasthan"  # virtual center marker


class Compass(str, Enum):
    N = "N"
    NE = "NE"
    E = "E"
    SE = "SE"
    S = "S"
    SW = "SW"
    W = "W"
    NW = "NW"
    CENTER = "CENTER"


class Facing(str, Enum):
    N = "N"
    NE = "NE"
    E = "E"
    SE = "SE"
    S = "S"
    SW = "SW"
    W = "W"
    NW = "NW"


class StateCode(str, Enum):
    KA = "KA"  # Karnataka
    MH = "MH"  # Maharashtra
    TG = "TG"  # Telangana


class City(str, Enum):
    Bengaluru = "Bengaluru"
    Hyderabad = "Hyderabad"
    Pune = "Pune"


class FinishTier(str, Enum):
    economy = "economy"
    standard = "standard"
    premium = "premium"


# Human-friendly room labels (used in BOQ grouping, DXF labels, PDF).
ROOM_LABELS: dict[str, str] = {
    "pooja": "Pooja",
    "kitchen": "Kitchen",
    "master_bedroom": "Master Bedroom",
    "bedroom": "Bedroom",
    "childrens_bedroom": "Children's Bedroom",
    "living": "Living",
    "dining": "Dining",
    "toilet": "Toilet",
    "bathroom": "Bathroom",
    "staircase": "Staircase",
    "entrance": "Entrance",
    "study": "Study",
    "store": "Store",
    "utility": "Utility",
    "balcony": "Balcony",
    "parking": "Parking",
    "overhead_tank": "Overhead Tank",
    "borewell": "Borewell",
    "brahmasthan": "Brahmasthan",
}


def room_label(room_type: str) -> str:
    return ROOM_LABELS.get(room_type, room_type.replace("_", " ").title())
