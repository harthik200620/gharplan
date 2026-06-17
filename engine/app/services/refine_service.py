"""Single-prompt plan editing.

Turns a list of plain-English instructions ("make the master bedroom bigger",
"move the kitchen to the south-east", "add a study", "make it two floors") into
generator overrides — :class:`~app.generator.designer.EditOverrides` plus optional
bhk / floors / design-variant changes — which the caller folds back into
``generate_plan``. Because an edit re-runs the whole optimiser, every refined plan
stays valid (non-overlapping, Vastu-zoned, code-checked) instead of being a
hand-mutated geometry.

The parser is deterministic and offline (no LLM dependency) so refinement works in
demo mode. Instructions are applied in order, so a later one overrides an earlier
one for the same knob; adds/removes/resizes accumulate.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from app.generator.designer import EditOverrides

# Compass synonyms -> canonical zone token (longest spellings first when matched).
_ZONES = {
    "north east": "NE", "north-east": "NE", "northeast": "NE",
    "north west": "NW", "north-west": "NW", "northwest": "NW",
    "south east": "SE", "south-east": "SE", "southeast": "SE",
    "south west": "SW", "south-west": "SW", "southwest": "SW",
    "north": "N", "south": "S", "east": "E", "west": "W",
    "centre": "CENTER", "center": "CENTER", "middle": "CENTER",
}
# Order zone phrases longest-first so "north east" wins over "north".
_ZONE_PHRASES = sorted(_ZONES, key=len, reverse=True)

# Room phrase -> match key (matches a ProgramRoom by id OR type.value). Longest
# phrases first so "master bedroom" beats "bedroom".
_ROOM_KEYS = {
    "master bedroom": "master", "main bedroom": "master", "master": "master",
    "living room": "living", "drawing room": "living", "sitting room": "living",
    "living": "living", "hall": "living", "lounge": "living",
    "kitchen": "kitchen",
    "dining room": "dining", "dining": "dining", "dinning": "dining",
    "guest room": "guest", "guest bedroom": "guest", "guest": "guest",
    "children": "bedroom", "kids room": "bedroom", "kids": "bedroom",
    "bedroom": "bedroom", "bed room": "bedroom",
    "pooja room": "pooja", "pooja": "pooja", "puja": "pooja",
    "prayer room": "pooja", "prayer": "pooja", "mandir": "pooja",
    "study room": "study", "study": "study", "home office": "study", "office": "study",
    "store room": "store", "storeroom": "store", "store": "store", "storage": "store",
    "powder room": "common_toilet", "guest toilet": "common_toilet",
    "common toilet": "common_toilet", "common bathroom": "common_toilet",
    "bathroom": "toilet", "washroom": "toilet", "restroom": "toilet",
    "toilet": "toilet", "bath": "toilet",
    "balcony": "balcony",
    "sit out": "sitout", "sit-out": "sitout", "sitout": "sitout",
    "verandah": "sitout", "veranda": "sitout", "porch": "sitout",
    "staircase": "stair", "stairs": "stair", "stair": "stair",
    "parking": "parking", "car park": "parking", "garage": "parking", "car": "parking",
}
_ROOM_PHRASES = sorted(_ROOM_KEYS, key=len, reverse=True)

# Room kinds an edit may ADD (must line up with designer._ADD_ROOM_SPEC).
_ADDABLE = {"study", "store", "dining", "pooja", "sitout", "balcony", "common_toilet"}

# Verb keyword sets.
_BIGGER = ("bigger", "larger", "large", "spacious", "expand", "expand", "increase",
           "more space", "enlarge", "grow", "wider", "extend", "roomy", "huge")
_SMALLER = ("smaller", "reduce", "shrink", "less space", "tinier", "compact the", "narrow")
_ADD = ("add", "include", "want a", "want an", "need a", "need an", "put a", "put an",
        "extra", "another", "give me a", "with a")
_REMOVE = ("remove", "delete", "drop", "without", "get rid", "no ", "don't want",
           "do not want", "skip the", "take out")
_MOVE = ("move", "shift", "put", "relocate", "face", "facing", "to the", "in the", "towards")


@dataclass
class EditResult:
    """The folded result of parsing every instruction in order."""

    edits: EditOverrides = field(default_factory=EditOverrides)
    bhk: int = 2
    floors: int = 1
    variant_id: Optional[str] = None
    applied: list[str] = field(default_factory=list)   # human-readable, per change
    unmatched: list[str] = field(default_factory=list)  # instructions we couldn't map


def _find_zone(text: str) -> Optional[str]:
    for phrase in _ZONE_PHRASES:
        if re.search(rf"\b{re.escape(phrase)}\b", text):
            return _ZONES[phrase]
    return None


def _find_room(text: str) -> Optional[str]:
    for phrase in _ROOM_PHRASES:
        if re.search(rf"\b{re.escape(phrase)}\b", text):
            return _ROOM_KEYS[phrase]
    return None


def _has(text: str, words) -> bool:
    return any(w in text for w in words)


def _label(key: str) -> str:
    return {
        "master": "master bedroom", "living": "living", "kitchen": "kitchen",
        "dining": "dining", "pooja": "pooja room", "study": "study",
        "store": "store", "toilet": "bathroom", "common_toilet": "guest toilet",
        "balcony": "balcony", "sitout": "sit-out", "guest": "guest bedroom",
        "bedroom": "bedroom", "parking": "parking", "stair": "staircase",
    }.get(key, key)


def _apply_one(text: str, res: EditResult) -> bool:
    """Map ONE instruction onto ``res`` in place; return True if anything matched."""
    matched = False

    # --- storeys ---------------------------------------------------------- #
    if re.search(r"\bg\s*\+\s*2\b|three floor|3 floor|triple stor|g2", text):
        res.floors = 3
        res.applied.append("Made it a G+2 (three floors)")
        matched = True
    elif re.search(r"two floor|2 floor|double stor|two stor|duplex|g\s*\+\s*1|g1|"
                   r"first floor|second floor|upstairs|multi.?floor|two.?storey", text):
        res.floors = max(res.floors, 2)
        res.applied.append("Made it a G+1 duplex (two floors)")
        matched = True
    elif re.search(r"single floor|one floor|ground floor only|single stor|one stor", text):
        res.floors = 1
        res.applied.append("Made it a single floor")
        matched = True

    # --- bedroom count (BHK) --------------------------------------------- #
    m = re.search(r"(\d)\s*bhk", text)
    if m:
        res.bhk = max(1, min(4, int(m.group(1))))
        res.applied.append(f"Set the home to {res.bhk}BHK")
        matched = True
    elif re.search(r"add (a |an |one )?(more )?bed|extra bed|one more bed|another bed", text):
        res.bhk = min(4, res.bhk + 1)
        res.applied.append(f"Added a bedroom ({res.bhk}BHK)")
        matched = True
    elif re.search(r"(remove|delete|drop|one less|fewer) (a )?bed", text):
        res.bhk = max(1, res.bhk - 1)
        res.applied.append(f"Removed a bedroom ({res.bhk}BHK)")
        matched = True

    # --- design strategy (variant) --------------------------------------- #
    if re.search(r"open kitchen|open plan|open.?plan|great room|open hall", text):
        res.variant_id = "open"
        res.applied.append("Switched to an open-plan great room")
        matched = True
    elif re.search(r"vastu", text) and not _find_room(text):
        res.variant_id = "vastu"
        res.applied.append("Switched to the Vastu-first scheme")
        matched = True
    elif re.search(r"compact|budget|cheap|economical|dense|value plan", text) and not _find_room(text):
        res.variant_id = "compact"
        res.applied.append("Switched to the compact value scheme")
        matched = True
    elif re.search(r"courtyard|central court|daylight home", text):
        res.variant_id = "courtyard"
        res.applied.append("Switched to the courtyard / daylight scheme")
        matched = True
    elif re.search(r"entertain|guest.?first|party house", text):
        res.variant_id = "entertainer"
        res.applied.append("Switched to the entertainer / guest-first scheme")
        matched = True

    # --- ventilation ------------------------------------------------------ #
    if re.search(r"ventilat|cross.?vent|airy|air.?flow|breeze|more window|extra window|"
                 r"brighter|more light|more sunlight|more daylight|well.?lit", text):
        res.edits.ventilation_boost = True
        res.applied.append("Boosted cross-ventilation (extra / wider windows)")
        matched = True

    # --- parking ---------------------------------------------------------- #
    if re.search(r"(two|2|double|second) car|2.?car park|parking for (two|2)|two.?car", text):
        res.edits.parking_cars = 2
        res.applied.append("Sized parking for two cars")
        matched = True
    elif re.search(r"(one|single) car park|parking for (one|1)|single.?car", text):
        res.edits.parking_cars = 1
        res.applied.append("Sized parking for one car")
        matched = True

    # --- room-level resize / move / add / remove ------------------------- #
    # Adding/removing a BEDROOM changes the BHK (handled above), never the room list,
    # so a "remove the kids room" can't silently delete every secondary bedroom.
    room = _find_room(text)
    if room and room != "parking":
        zone = _find_zone(text)
        bedroomish = room in ("bedroom", "master", "guest")
        if _has(text, _BIGGER):
            step = 1.35 if re.search(r"\bmuch\b|\ba lot\b|\bway\b", text) else 1.2
            res.edits.area_scale[room] = res.edits.area_scale.get(room, 1.0) * step
            res.applied.append(f"Enlarged the {_label(room)}")
            matched = True
        elif _has(text, _SMALLER):
            res.edits.area_scale[room] = res.edits.area_scale.get(room, 1.0) * 0.82
            res.applied.append(f"Shrank the {_label(room)}")
            matched = True
        elif zone and _has(text, _MOVE):
            res.edits.zones[room] = [zone]
            res.applied.append(f"Moved the {_label(room)} to the {zone}")
            matched = True
        elif not bedroomish and _has(text, _REMOVE):
            res.edits.remove.add(room)
            res.applied.append(f"Removed the {_label(room)}")
            matched = True
        elif not bedroomish and _has(text, _ADD) and room in _ADDABLE:
            res.edits.add.add(room)
            res.applied.append(f"Added a {_label(room)}")
            matched = True
        elif zone:  # a room + a bare compass = a move
            res.edits.zones[room] = [zone]
            res.applied.append(f"Moved the {_label(room)} to the {zone}")
            matched = True

    return matched


# Split a compound instruction ("shrink the dining and make the living bigger") into
# clauses so each command is applied. Zone/room phrases never contain these joiners.
_CLAUSE_SPLIT = re.compile(r"\s+and\s+|\s*[,;]\s*|\s+then\s+|\s+also\s+|\s+plus\s+")


def parse_edits(
    instructions: list[str],
    base_bhk: int,
    base_floors: int,
    base_variant_id: Optional[str] = None,
) -> EditResult:
    """Fold an ordered list of instructions into a single :class:`EditResult`."""
    res = EditResult(bhk=max(1, min(4, int(base_bhk))), floors=max(1, int(base_floors)),
                     variant_id=base_variant_id)
    for raw in instructions:
        if not raw or not raw.strip():
            continue
        clauses = [c for c in _CLAUSE_SPLIT.split(raw.strip()) if c.strip()]
        any_matched = False
        for clause in clauses:
            text = " " + clause.strip().lower() + " "
            if _apply_one(text, res):
                any_matched = True
        if not any_matched:
            res.unmatched.append(raw.strip())
    return res
