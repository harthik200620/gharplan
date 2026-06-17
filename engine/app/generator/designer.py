"""Deterministic, Vastu-aware floor-plan generator.

Turns a structured brief (bhk / plot / facing / state) into a valid :class:`Plan`
whose rooms tile (most of) the buildable envelope, respect classical Vastu zoning,
and pass the per-state building-code minimums. The pipeline is:

    brief --> room PROGRAM (which rooms + target areas, scaled to envelope)
          --> buildable ENVELOPE (plot minus setbacks, via code_service)
          --> VastuGridPacker (lay rooms into a 3x3 compass grid, merge/split)
          --> openings (one door toward the centre + windows on exterior walls)
          --> Plan + normalize() + vastu/code checks
          --> OPTIMIZE (a few band/zone variants, keep the best)

Coordinates are in METRES, origin = plot SW corner, +x = East, +y = North — the
same contract as :mod:`app.models.plan`. All geometry is float; no money here.

Nothing in this module duplicates rule numbers: setbacks/min-areas/min-dims are
read from the code ruleset, and ideal Vastu zones are derived from the Vastu
ruleset where present (classical fallbacks fill the gaps).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.models.enums import Compass, Facing, RoomType, StateCode
from app.models.plan import Opening, Plan, Plot, Project, Room
from app.services.code_service import buildable_envelope, check_code
from app.services.plan_service import normalize
from app.services.rules import CodeRules, VastuRules, get_code_rules, get_vastu_rules
from app.services.vastu_service import check_vastu
from app.services.zones import zone_of

# --------------------------------------------------------------------------- #
# Vastu zone preferences
# --------------------------------------------------------------------------- #
# Classical ideal zone per room type. These are *fallbacks* / priors; where the
# Vastu ruleset declares an ``ideal`` list we prefer the first entry that the
# plot geometry can actually satisfy (see ``ideal_zone_for``).
_CLASSICAL_IDEAL: dict[str, list[str]] = {
    "pooja": ["NE", "N", "E"],
    "kitchen": ["SE", "S", "E"],  # NW is the classical alt but we keep wet/fire apart
    "master_bedroom": ["SW", "S", "W"],
    "bedroom": ["S", "W", "SW", "NW"],
    "childrens_bedroom": ["W", "NW", "E"],
    "living": ["E", "NE", "N"],
    "dining": ["W", "NW", "E"],
    "toilet": ["NW", "W", "S"],
    "bathroom": ["NW", "W", "S"],
    "staircase": ["S", "SW", "W"],
    "entrance": ["NE", "E", "N"],
    "utility": ["NW", "N", "W"],
    "study": ["NE", "E", "N"],
    "store": ["S", "SW", "W"],
}

# Grid cell that geometrically realises each compass zone (north = +y = top row).
#   top:    NW | N  | NE
#   middle: W  | C  | E
#   bottom: SW | S  | SE
_ZONE_CELL: dict[str, tuple[int, int]] = {
    "NW": (0, 2), "N": (1, 2), "NE": (2, 2),
    "W": (0, 1), "CENTER": (1, 1), "E": (2, 1),
    "SW": (0, 0), "S": (1, 0), "SE": (2, 0),
}


# --------------------------------------------------------------------------- #
# Right-sizing — buildable footprint -> largest sensible program tier
# --------------------------------------------------------------------------- #
# Tier names map to a bedroom count. STUDIO has no separate bedroom (a single
# living-cum-bedroom + kitchenette + one bath); 1..4 BHK have that many bedrooms.
_TIER_BEDROOMS: dict[str, int] = {
    "STUDIO": 0,
    "1BHK": 1,
    "2BHK": 2,
    "3BHK": 3,
    "4BHK": 4,
}
_TIER_ORDER = ["STUDIO", "1BHK", "2BHK", "3BHK", "4BHK"]

# Footprint thresholds (m^2) mapping the per-floor buildable footprint the packer
# can actually fill -> the largest tier whose COMFORTABLE program fits. These are
# the design doc's reference bands (Quick generator constants): Studio <= 35,
# 1BHK 35-70, 2BHK 70-105, 3BHK 105-150, 4BHK >= 150. Each value is the exclusive
# upper bound for that tier. A realistic program (every bedroom with its own
# attached bath from 2BHK, comfortable room sizes) is what sets these bands -- e.g.
# a BBMP 30x40 yields ~72.5 m^2 of single-floor footprint, which lands in the 2BHK
# band: a clean 2BHK (two ensuite bedrooms + common toilet) fits there, whereas
# three attached-bath bedrooms genuinely do not, so requesting 3 or 4 BHK on a
# 30x40 single floor right-sizes down to 2BHK rather than cramming sub-minimum
# rooms or dropping baths.
_TIER_MAX_FOOTPRINT: list[tuple[str, float]] = [
    ("STUDIO", 35.0),
    ("1BHK", 70.0),
    ("2BHK", 105.0),
    ("3BHK", 150.0),
    ("4BHK", float("inf")),
]


def buildable_footprint_sqm(plot: Plot, code_rules: CodeRules) -> float:
    """The per-floor area the packer can actually fill: setback envelope area
    capped at the ground-coverage limit. No magic numbers — both come from
    ``code_service`` / the code ruleset."""
    env, _ = _envelope_and_keepout(plot, code_rules)
    minx, miny, maxx, maxy = env
    env_area = max(0.0, (maxx - minx)) * max(0.0, (maxy - miny))
    st = code_rules.state(plot.state.value)
    max_cov = float(st.get("maxGroundCoveragePct", 65.0))
    cov_cap = (max_cov / 100.0) * (plot.width_m * plot.depth_m)
    return min(env_area, cov_cap)


def tier_for_footprint(footprint_sqm: float) -> str:
    """Largest tier whose minimum footprint the buildable area meets."""
    for tier, cap in _TIER_MAX_FOOTPRINT:
        if footprint_sqm < cap:
            return tier
    return "4BHK"


def resolve_tier(bhk: int, footprint_sqm: float) -> tuple[str, str, bool, str]:
    """Reconcile the requested bhk with what the space can hold.

    ``effectiveTier = min(tier implied by bhk, max tier that fits)``. If the
    request does not fit we DOWNSCALE to what fits; if the user asks for less than
    fits we honour the request. Returns
    ``(effective_tier, requested_tier, downscaled, note)``."""
    bhk = max(1, min(4, int(bhk)))
    requested_tier = _TIER_ORDER[bhk]  # bhk 1->1BHK ... 4->4BHK (index 0 is STUDIO)
    fits_tier = tier_for_footprint(footprint_sqm)
    eff_idx = min(_TIER_ORDER.index(requested_tier), _TIER_ORDER.index(fits_tier))
    effective_tier = _TIER_ORDER[eff_idx]
    downscaled = eff_idx < _TIER_ORDER.index(requested_tier)
    foot = round(footprint_sqm, 1)
    if downscaled:
        note = (
            f"Requested {requested_tier} needs more than the {foot} m2 buildable "
            f"footprint affords; right-sized down to {effective_tier} so every room "
            f"keeps a comfortable size and an attached bath rather than cramming "
            f"sub-minimum rooms."
        )
    elif eff_idx < _TIER_ORDER.index(fits_tier):
        note = (
            f"Honoured the requested {effective_tier}; the {foot} m2 footprint could "
            f"support up to {fits_tier}."
        )
    else:
        note = f"{effective_tier} fits the {foot} m2 buildable footprint."
    return effective_tier, requested_tier, downscaled, note


@dataclass
class ProgramRoom:
    """One entry in the room program: what to place, where it wants to go."""

    id: str
    type: RoomType
    target_sqm: float
    ideal_zones: list[str]
    priority: int  # higher = more important (kept when space is tight)
    ceiling_height_m: float = 3.0
    # When set, this rectangle is a COMBINED bedroom+attached-bath block: after
    # packing it is guillotine-split into a bedroom + a "toilet" strip. Carries
    # the attached bath's minimum area and the bedroom's own comfortable minimum.
    attach_bath: bool = False
    bath_min_sqm: float = 0.0
    bedroom_min_sqm: float = 0.0
    bath_id: Optional[str] = None
    dressing: bool = False  # 4BHK master: also carve a slim wardrobe/dressing strip
    # A soft comfort floor (m^2) the packer should not shrink the room below before
    # it would rather drop an optional room. Lets the living stay roomy on tight
    # plots instead of collapsing to the bare code minimum.
    min_area_floor: float = 0.0


# Room "kinds" a single-prompt edit may add/remove/resize/move. Keys match a
# ProgramRoom by ``id`` OR by ``type.value`` so "master", "master_bedroom" and
# "bedroom" all resolve. Essentials (living/kitchen/master/stair) are protected
# from removal in ``_apply_edits``.
_EDIT_ESSENTIAL = {"living", "kitchen", "master", "master_bedroom", "stair", "staircase"}
# Default target area (m^2) + Vastu key for a room an edit ADDS to the program.
_ADD_ROOM_SPEC: dict[str, tuple[RoomType, float, str]] = {
    "study": (RoomType.study, 11.0, "study"),  # > habitable min so it never lands sub-code
    "store": (RoomType.store, 6.0, "store"),
    "dining": (RoomType.dining, 10.0, "dining"),
    "pooja": (RoomType.pooja, 3.0, "pooja"),
    "sitout": (RoomType.sitout, 6.0, "sitout"),
    "balcony": (RoomType.balcony, 5.0, "balcony"),
    "dressing": (RoomType.store, 3.0, "store"),
    "entrance": (RoomType.entrance, 2.4, "entrance"),
    "common_toilet": (RoomType.toilet, 2.2, "toilet"),
}
# In a G+1, an ADDED social room belongs on the ground floor; everything else
# (study, dressing, balcony) routes to the private upper floor.
_GROUND_ADD = {"dining", "pooja", "sitout", "entrance", "common_toilet", "store"}
# An edit match key -> the room TYPE value(s) it targets, so "master" hits both the
# single-floor "master" id and the G+1 "u_master" (type master_bedroom), and
# "bedroom" hits the secondary + children's bedrooms.
_EDIT_KEY_TYPES: dict[str, set[str]] = {
    "master": {"master_bedroom"},
    "living": {"living"},
    "kitchen": {"kitchen"},
    "dining": {"dining"},
    "pooja": {"pooja"},
    "study": {"study"},
    "store": {"store"},
    "balcony": {"balcony"},
    "sitout": {"sitout"},
    "toilet": {"toilet"},
    "stair": {"staircase"},
    "bedroom": {"bedroom", "childrens_bedroom"},
}


@dataclass
class EditOverrides:
    """Program-level changes a single natural-language instruction maps to.

    Folded into ``build_program`` so the whole optimiser re-runs afterwards — an
    edit therefore always yields a *valid* (non-overlapping, code-checked) plan
    rather than a hand-mutated geometry. ``bhk`` / ``floors`` / ``variant`` are
    resolved separately by :mod:`app.services.refine_service` and passed straight
    to ``generate_plan``; this object carries only the room-list deltas."""

    area_scale: dict[str, float] = field(default_factory=dict)   # match key -> target multiplier
    zones: dict[str, list[str]] = field(default_factory=dict)    # match key -> preferred zones
    add: set[str] = field(default_factory=set)                   # _ADD_ROOM_SPEC keys to include
    remove: set[str] = field(default_factory=set)               # match keys to drop (non-essential)
    ventilation_boost: bool = False                              # extra cross-ventilation windows
    parking_cars: Optional[int] = None                          # override car-porch capacity

    def is_empty(self) -> bool:
        return not (
            self.area_scale or self.zones or self.add or self.remove
            or self.ventilation_boost or self.parking_cars
        )

    def _match(self, room: "ProgramRoom", key: str) -> bool:
        if key == room.id or key == room.type.value:
            return True
        if room.type.value in _EDIT_KEY_TYPES.get(key, ()):  # alias by room type
            return True
        if key == "common_toilet" and "toilet_common" in room.id:
            return True
        if key == "guest" and room.id.startswith("guest"):
            return True
        return False


def _apply_edits(
    prog: list["ProgramRoom"], edits: Optional["EditOverrides"], zones_fn
) -> list["ProgramRoom"]:
    """Apply an edit's add/remove/resize/re-zone deltas to a built program.

    ``zones_fn`` resolves a Vastu key -> ideal zone list (build_program's local
    ``zones`` closure). Removal skips essentials so an edit can never delete the
    living, kitchen, master bedroom or stair."""
    if edits is None or edits.is_empty():
        return prog

    # -- remove (non-essential only) --
    if edits.remove:
        kept: list[ProgramRoom] = []
        for r in prog:
            drop = any(
                edits._match(r, k) for k in edits.remove
            ) and r.id not in _EDIT_ESSENTIAL and r.type.value not in _EDIT_ESSENTIAL
            if not drop:
                kept.append(r)
        prog = kept

    # -- resize (scale target so the water-fill grows/shrinks the room) --
    for r in prog:
        for k, mult in edits.area_scale.items():
            if edits._match(r, k):
                r.target_sqm *= mult
                if r.min_area_floor:
                    r.min_area_floor *= max(mult, 0.85) if mult > 1 else 1.0
                if r.attach_bath:  # grow the bedroom portion, not the bath
                    r.bedroom_min_sqm *= mult

    # -- re-zone (move a room toward a requested compass zone) --
    for r in prog:
        for k, zs in edits.zones.items():
            if edits._match(r, k) and zs:
                r.ideal_zones = list(zs)

    # -- add (only kinds not already present) --
    have = {r.id for r in prog} | {r.type.value for r in prog}
    for kind in edits.add:
        spec = _ADD_ROOM_SPEC.get(kind)
        if spec is None or kind in have:
            continue
        rtype, target, zkey = spec
        # A habitable add (study) gets a comfort floor so it can't be trimmed below
        # the code minimum. priority 6 (> the ESS=5 coverage threshold) means a room
        # the user explicitly ASKED to add survives footprint trimming — a lower-
        # priority optional gives way instead. It can still be left unplaced on a
        # genuinely full plot.
        floor = target * 0.92 if rtype == RoomType.study else 0.0
        prog.append(
            ProgramRoom(kind, rtype, target, zones_fn(zkey), priority=6, min_area_floor=floor)
        )
        have.add(kind)
        have.add(rtype.value)
    return prog


@dataclass
class PlacedRoom:
    id: str
    type: RoomType
    x0: float
    y0: float
    x1: float
    y1: float
    ceiling_height_m: float = 3.0
    floor: int = 0

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def depth(self) -> float:
        return self.y1 - self.y0

    @property
    def area(self) -> float:
        return self.width * self.depth

    @property
    def min_side(self) -> float:
        return min(self.width, self.depth)

    def polygon(self) -> list[list[float]]:
        return [
            [self.x0, self.y0],
            [self.x1, self.y0],
            [self.x1, self.y1],
            [self.x0, self.y1],
            [self.x0, self.y0],
        ]


# --------------------------------------------------------------------------- #
# Room program
# --------------------------------------------------------------------------- #
def ideal_zone_for(room_type: str, vastu: VastuRules) -> list[str]:
    """Preferred zones for a room type: the Vastu ruleset's ``ideal`` first,
    then the classical fallback, de-duplicated. Never returns CENTER."""
    order: list[str] = []
    rule = vastu.rule_for(room_type)
    if rule:
        order.extend(rule.get("ideal", []))
        order.extend(rule.get("acceptable", []))
    order.extend(_CLASSICAL_IDEAL.get(room_type, []))
    seen: set[str] = set()
    out: list[str] = []
    for z in order:
        if z and z != "CENTER" and z not in seen:
            seen.add(z)
            out.append(z)
    return out or ["S"]


# Comfortable target areas from the design doc (built-up m^2). Used as the *aim*
# for each room; the packer scales toward these but holds region minimums as the
# floor and shrinks proportionally when the envelope is tight.
_COMFORT = {
    "living": 19.0,        # 16-22
    "living_studio": 16.0,  # studio living-cum-bedroom (kept compact)
    "master": 17.0,        # 15-21 (combined block incl. its bath)
    "bedroom": 13.0,       # 12-14
    "kitchen": 8.5,        # 7.5-10
    "kitchenette": 5.0,    # studio
    "dining": 10.0,        # 9-13
    "attached_bath": 4.0,  # 3.5-6
    "master_bath": 4.8,    # >= 4.5 for 3/4BHK
    "shared_bath": 4.0,    # 1BHK / studio single bath
    "common_toilet": 2.2,  # ~2 powder/WC near living
    "pooja": 1.8,          # niche 1.5-2 (dedicated room a touch larger)
    "pooja_room": 3.0,
    "utility": 2.8,        # 2.5-3
    "entrance": 2.4,
    "dressing": 2.4,       # 4BHK master wardrobe/dressing strip
}

# Bath strip geometry (the guillotine slice carved off a bedroom block).
_BATH_STRIP_MIN_W = 1.5   # >= 1.5 m clear
_BATH_STRIP_MAX_W = 1.8   # keep it a strip, not a second room
_BATH_AREA_MIN = 3.3      # doc: attached bath area >= 3.3 m^2

# Soft upper bound on a bedroom+bath block's bounding aspect (max side / min side).
# The packer caps a block's stacked RUN at this multiple of its column width so a
# block never stretches into a ribbon on a narrow side band; the leftover band depth
# goes to the band's living / bare habitable room instead. A touch below the 1.9
# "ribbon" line so the post-carve bedroom (slightly shorter than the block) lands
# comfortably under it.
_ASPECT_SOFT = 1.85


# --------------------------------------------------------------------------- #
# DESIGN VARIANTS — one brief, five distinct-but-all-good plans.
# Real architects vary a handful of decisions (open vs. closed social core,
# Vastu-purity, density, daylight, guest-forwardness) to give a client options.
# Each profile is a parameter set that modulates the program, the packer and the
# ranking; ``generate_options`` runs all five and dedupes for genuine diversity.
# See docs/indian-design-conventions.md and docs/region-research.md.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class VariantProfile:
    id: str
    name: str
    tagline: str
    merge_dining: bool = False      # fold the dining into the living -> one open hall
    open_kitchen: bool = False      # tag the kitchen semi-open (breakfast counter)
    pooja_mode: str = "auto"        # "auto" | "room" | "niche" | "none"
    courtyard: bool = False         # keep the centre open as a daylight court
    sitout: bool = False            # add a front verandah / sit-out
    guest_first: bool = False       # common toilet toward the entry + big social zone
    shrink_secondary: bool = False  # secondary bedrooms toward their minimum
    big_social: bool = False        # enlarge the living (+ dining) targets
    fill_center: bool = False       # dense pack, no open-Brahmasthan band
    prefer_area: bool = False       # rank denser / fewer-drops ahead of Vastu
    prefer_vastu: bool = False      # rank Vastu hardest (after correctness)
    min_footprint_sqm: float = 0.0  # suppress this variant below this buildable area


# The default profile (``variant=None``) reproduces the legacy single-plan
# behaviour exactly, so existing callers/tests are unaffected.
VARIANT_PROFILES: list[VariantProfile] = [
    VariantProfile(
        id="vastu",
        name="Vastu-First Family Home",
        tagline="Every room on its auspicious compass zone, with a dedicated pooja in the NE.",
        pooja_mode="room",
        prefer_vastu=True,
    ),
    VariantProfile(
        id="open",
        name="Open-Plan Great Room",
        tagline="Living and dining merge into one bright hall with a semi-open kitchen.",
        merge_dining=True,
        open_kitchen=True,
        big_social=True,
    ),
    VariantProfile(
        id="compact",
        name="Compact Value Plan",
        tagline="Maximum carpet area and minimal circulation — the budget-smart build.",
        merge_dining=True,
        pooja_mode="niche",
        fill_center=True,
        prefer_area=True,
    ),
    VariantProfile(
        id="courtyard",
        name="Courtyard / Daylight Home",
        tagline="An open central court and a front verandah for cross-ventilation and light.",
        sitout=True,
        courtyard=True,
        min_footprint_sqm=95.0,
    ),
    VariantProfile(
        id="entertainer",
        name="Entertainer / Guest-First",
        tagline="Oversized living and formal dining with a guest WC right by the entrance.",
        big_social=True,
        guest_first=True,
        shrink_secondary=True,
    ),
]


def _tier_program_spec(tier: str, slack: float = 1e9, variant: Optional["VariantProfile"] = None) -> dict:
    """What the tier contains: bedroom count, whether bedrooms get attached baths,
    common toilet, dedicated pooja vs niche, dressing strip on the master.

    ``slack`` is the buildable footprint MINUS the tier's essential-room area (the
    non-droppable core). The Indian drop-order (dressing -> store -> extra balcony
    -> pooja room -> dining -> sit-out -> common toilet -> ensuite -> utility ->
    foyer) is honoured by switching the *optional* extras on only when there is
    room for them, so a tier sitting at the bottom of its band keeps comfortable
    essentials instead of cramming a dining + foyer it cannot afford."""
    bedrooms = _TIER_BEDROOMS[tier]
    attached = tier in ("2BHK", "3BHK", "4BHK")  # per-bedroom ensuite from 2BHK
    # Slack thresholds (m^2 above the essential core) at which each optional extra
    # switches on, following the Indian drop-order. Thresholds are roomy because a
    # 3-band packer needs noticeably more than a room's nominal area to actually
    # place it (column-width quantisation), so an extra is added only when there is
    # comfortable space — otherwise a tight tier keeps clean, comfortable essentials
    # (every bedroom + its ensuite, a roomy living, a pooja niche) instead of
    # cramming a dining + foyer it cannot afford.
    spec = {
        "tier": tier,
        "bedrooms": bedrooms,
        "attached_baths": attached,
        "common_toilet": False,                # owner brief: ensuite baths only — no standalone common WC
        "dedicated_pooja": tier in ("3BHK", "4BHK") and slack >= 10.0,  # else a niche
        "pooja": tier != "STUDIO",             # niche-sized room otherwise
        "utility": False,    # dropped per owner — no utility room; space goes to living/kitchen
        "dining": tier in ("1BHK", "2BHK", "3BHK", "4BHK") and slack >= 16.0,
        "dressing": tier == "4BHK" and slack >= 8.0,
        "stair": True,
        "entrance": tier in ("2BHK", "3BHK", "4BHK") and slack >= 22.0,
    }

    # --- variant overrides: shift the program toward the chosen strategy --- #
    if variant is not None and tier != "STUDIO":
        if variant.merge_dining:
            spec["dining"] = False              # absorbed into a bigger living hall
        elif variant.big_social and tier in ("2BHK", "3BHK", "4BHK"):
            spec["dining"] = slack >= 8.0        # entertainer keeps a formal dining sooner
        if variant.pooja_mode == "room":
            spec["pooja"] = True
            spec["dedicated_pooja"] = tier in ("2BHK", "3BHK", "4BHK") and slack >= 6.0
        elif variant.pooja_mode == "niche":
            spec["pooja"] = True
            spec["dedicated_pooja"] = False
        elif variant.pooja_mode == "none":
            spec["pooja"] = False
            spec["dedicated_pooja"] = False
        if variant.guest_first:
            # Owner brief: no common WC even for the guest-first variant — the
            # entry-adjacent ensuite bedroom's attached bath serves ground guests.
            spec["entrance"] = tier in ("2BHK", "3BHK", "4BHK") and slack >= 12.0
    return spec


def _tier_essential_area(
    tier: str, min_habitable: float, min_kitchen: float, bath_min: float
) -> float:
    """Rough non-droppable core area for a tier: living + kitchen + every bedroom
    (with its attached bath) + common toilet + a pooja niche + stair. Drives the
    ``slack`` that gates optional extras (see ``_tier_program_spec``)."""
    if tier == "STUDIO":
        return max(_COMFORT["living_studio"], min_habitable) + max(_COMFORT["kitchenette"], min_kitchen) + bath_min + 3.0
    bedrooms = _TIER_BEDROOMS[tier]
    attached = tier in ("2BHK", "3BHK", "4BHK")
    tight = bedrooms >= 3
    master = (13.0 if tight else 14.0) + (max(4.5, bath_min) if attached else 0.0)
    sec = (11.0 + bath_min) if attached else max(_COMFORT["bedroom"], min_habitable)
    core = (
        max(11.0, min_habitable + 1.0)                      # living comfort floor
        + max(6.5, min_kitchen + 1.0)                       # kitchen comfort floor
        + master
        + sec * (bedrooms - 1)
        + (max(_COMFORT["common_toilet"], bath_min * 0.6) if attached else bath_min)
        + 2.0   # pooja niche
        + 3.0   # stair
    )
    return core


def build_program(
    bhk: int,
    floors: int,
    env_w: float,
    env_d: float,
    min_habitable: float,
    min_kitchen: float,
    min_toilet: float,
    vastu: VastuRules,
    tier: Optional[str] = None,
    footprint: Optional[float] = None,
    variant: Optional["VariantProfile"] = None,
    edits: Optional["EditOverrides"] = None,
) -> list[ProgramRoom]:
    """Produce the room list (target areas + Vastu zones) for the effective tier.

    ``tier`` is the right-sized program (Studio/1BHK/2BHK/3BHK/4BHK). When omitted
    it is derived from ``bhk`` directly (1..4 BHK) so callers/tests that pass a bhk
    still work; ``generate_plan`` passes the space-resolved tier. Bedrooms in a
    2BHK+ are emitted as COMBINED bedroom+bath blocks (``attach_bath``) that are
    guillotine-split after packing so each bedroom gets its own attached toilet.
    ``footprint`` (the buildable area) gates the optional extras via the Indian
    drop-order; when omitted, the envelope area is used. ``floors`` only affects
    the staircase (kept even single-floor as a core slot).
    """
    if tier is None:
        tier = _TIER_ORDER[max(1, min(4, int(bhk)))]
    env_area = env_w * env_d

    def zones(rt: str) -> list[str]:
        return ideal_zone_for(rt, vastu)

    # Region area floors per room class (never go below code/realistic minimum).
    bath_min = max(_BATH_AREA_MIN, min_toilet * 1.6)
    master_bath_min = max(4.5, bath_min)

    # Slack above the tier's essential core decides which optional extras fit.
    foot = footprint if footprint is not None else env_area
    slack = foot - _tier_essential_area(tier, min_habitable, min_kitchen, bath_min)
    spec = _tier_program_spec(tier, slack, variant)

    prog: list[ProgramRoom] = []

    # -- STUDIO: one living-cum-bedroom + kitchenette + one bath, nothing else -- #
    if tier == "STUDIO":
        prog.append(
            ProgramRoom("living", RoomType.living,
                        max(_COMFORT["living_studio"], min_habitable * 1.3),
                        zones("living"), priority=10)
        )
        prog.append(
            ProgramRoom("kitchen", RoomType.kitchen,
                        max(_COMFORT["kitchenette"], min_kitchen),
                        zones("kitchen"), priority=9)
        )
        prog.append(
            ProgramRoom("toilet1", RoomType.toilet,
                        max(_COMFORT["shared_bath"], bath_min),
                        zones("toilet"), priority=8)
        )
        prog.append(
            ProgramRoom("stair", RoomType.staircase, max(0.045 * env_area, 3.0),
                        zones("staircase"), priority=6)
        )
        return prog

    # -- Slack distribution: the leftover footprint above the essential core is
    # handed preferentially to the LIVING and the BEDROOMS (the rooms a family
    # actually lives in), so they dominate the built-up area while service rooms
    # (toilets, pooja, stair, dining) stay at their modest comfort targets. Bounded
    # so one big plot doesn't balloon a single room. -- #
    slack_pos = max(0.0, slack)
    living_bonus = min(8.0, slack_pos * 0.16)
    master_bonus = min(7.0, slack_pos * 0.13)
    sec_bonus = min(4.5, slack_pos * 0.09)

    # -- Living (largest single space) -- #
    # A modest comfort floor (a touch above the code minimum) keeps the hall from
    # collapsing to the bare minimum without starving the bedrooms; the living's
    # large target lets it grow to a roomy size whenever the band has slack.
    living_floor = max(11.0, min_habitable + 1.0)
    living_target = max(_COMFORT["living"], min_habitable * 1.7) + living_bonus
    if variant is not None:
        # open-plan folds the dining into the hall; big-social variants enlarge it.
        if variant.merge_dining:
            living_target += _COMFORT["dining"]
        if variant.big_social:
            living_target += 4.0
    prog.append(
        ProgramRoom("living", RoomType.living, living_target,
                    zones("living"), priority=9, min_area_floor=living_floor)
    )
    # -- Kitchen (SE) -- #
    prog.append(
        ProgramRoom("kitchen", RoomType.kitchen, max(_COMFORT["kitchen"], min_kitchen * 1.4),
                    zones("kitchen"), priority=9, min_area_floor=max(6.5, min_kitchen + 1.0))
    )

    # Lean bedroom MINIMUMS so several bulky bedroom+bath blocks still fit; targets
    # stay at comfortable sizes so a room grows when its band has slack. Tighter on
    # 3BHK/4BHK (three/four blocks compete) than on 2BHK.
    tight = spec["bedrooms"] >= 3
    master_bed_min = max((13.0 if tight else 14.0), min_habitable * 1.25)
    sec_bed_min = max(11.0, min_habitable)
    mbath_min = master_bath_min  # >= 4.5 m^2 master bath for every attached tier

    # -- Master bedroom (+ its attached bath as one combined block from 2BHK) -- #
    if spec["attached_baths"]:
        master_block = master_bed_min + mbath_min + (
            _COMFORT["dressing"] if spec["dressing"] else 0.0
        )
        # target = block minimum + a slack share so the master grows into a roomy
        # 15-21 m^2 bedroom (the carve gives the surplus to the sleeping area, not
        # the bath) without starving the secondary bedrooms.
        prog.append(
            ProgramRoom("master", RoomType.master_bedroom, master_block + master_bonus,
                        zones("master_bedroom"), priority=10,
                        attach_bath=True, bath_min_sqm=mbath_min,
                        bedroom_min_sqm=master_bed_min, bath_id="toilet_master",
                        dressing=spec["dressing"])
        )
    else:
        prog.append(
            ProgramRoom("master", RoomType.master_bedroom,
                        max(_COMFORT["master"], min_habitable * 1.25) + master_bonus,
                        zones("master_bedroom"), priority=10)
        )

    # -- Secondary bedrooms (each its own attached bath from 2BHK) -- #
    extra = spec["bedrooms"] - 1
    sec_specs = [("kids", RoomType.childrens_bedroom, 7, "childrens_bedroom")]
    for i in range(2, extra + 1):
        sec_specs.append((f"bedroom{i}", RoomType.bedroom, 6, "bedroom"))
    # entertainer/guest-first keeps the secondary bedrooms lean so the social zone
    # can grow; every other strategy lets them share the slack like the master.
    sec_target_bonus = 0.0 if (variant is not None and variant.shrink_secondary) else sec_bonus
    for j in range(extra):
        rid, rtype, base_prio, zkey = sec_specs[j]
        if spec["attached_baths"]:
            prog.append(
                ProgramRoom(rid, rtype, sec_bed_min + bath_min + sec_target_bonus,
                            zones(zkey), priority=base_prio,
                            attach_bath=True, bath_min_sqm=bath_min,
                            bedroom_min_sqm=sec_bed_min, bath_id=f"toilet_{rid}")
            )
        else:
            prog.append(
                ProgramRoom(rid, rtype, max(_COMFORT["bedroom"], min_habitable * 1.05) + sec_target_bonus,
                            zones(zkey), priority=base_prio)
            )

    # -- Dining nook (1BHK+ has one; optional/droppable) -- #
    if spec["dining"]:
        prog.append(
            ProgramRoom("dining", RoomType.dining, max(_COMFORT["dining"], min_habitable * 0.7),
                        zones("dining"), priority=4)
        )

    # -- Shared bath for tiers WITHOUT attached baths (1BHK) -- #
    if not spec["attached_baths"]:
        prog.append(
            ProgramRoom("toilet1", RoomType.toilet, max(_COMFORT["shared_bath"], bath_min),
                        zones("toilet"), priority=8)
        )

    # -- Common / powder toilet near living-dining (2BHK+) -- #
    if spec["common_toilet"]:
        prog.append(
            ProgramRoom("toilet_common", RoomType.toilet,
                        max(_COMFORT["common_toilet"], min_toilet * 1.6),
                        zones("toilet"), priority=8)
        )

    # -- Pooja (dedicated room from 3BHK, else a niche-sized room) -- #
    if spec["pooja"]:
        target = _COMFORT["pooja_room"] if spec["dedicated_pooja"] else _COMFORT["pooja"]
        prog.append(
            ProgramRoom("pooja", RoomType.pooja, max(target, 1.8),
                        zones("pooja"), priority=5)
        )

    # -- Staircase (service core slot) -- #
    prog.append(
        ProgramRoom("stair", RoomType.staircase, max(0.045 * env_area, 3.0),
                    zones("staircase"), priority=6)
    )

    # -- Utility / wash off kitchen rear (high Indian priority, kept late) -- #
    if spec["utility"]:
        prog.append(
            ProgramRoom("utility", RoomType.utility, max(_COMFORT["utility"], 2.5),
                        zones("utility"), priority=3)
        )

    # -- Entrance / foyer (token transition) -- #
    if spec["entrance"]:
        prog.append(
            ProgramRoom("entrance", RoomType.entrance, max(_COMFORT["entrance"], 2.2),
                        zones("entrance"), priority=4)
        )

    # -- Front sit-out / verandah (courtyard / daylight variant) -- #
    if variant is not None and variant.sitout:
        prog.append(
            ProgramRoom("sitout", RoomType.sitout, max(_COMFORT.get("sitout", 6.0), 5.0),
                        ["N", "E", "NE"], priority=3)
        )

    # -- Single-prompt edits (add/remove/resize/move) fold in last, then the whole
    # optimiser re-runs over this program so the result stays a valid plan. -- #
    prog = _apply_edits(prog, edits, zones)
    return prog


# --------------------------------------------------------------------------- #
# VastuGridPacker — lay the program into a 3-band compass grid over the envelope
# --------------------------------------------------------------------------- #
_COL_OF_ZONE = {  # E-W band index 0=West 1=Center 2=East
    "W": 0, "NW": 0, "SW": 0,
    "N": 1, "S": 1, "CENTER": 1,
    "E": 2, "NE": 2, "SE": 2,
}
_ROW_RANK_OF_ZONE = {  # N-S preference: smaller = further South (lower y)
    "S": 0, "SW": 0, "SE": 0,
    "CENTER": 1, "W": 1, "E": 1,
    "N": 2, "NW": 2, "NE": 2,
}


@dataclass
class PackResult:
    placed: list[PlacedRoom]
    dropped: list[str] = field(default_factory=list)


class VastuGridPacker:
    """Pack program rooms into three vertical bands (West / Centre / East) of the
    buildable envelope, stacking the rooms assigned to each band from South to
    North by their ideal zone. Band *widths* are tunable (``band_fracs``) so the
    optimiser can nudge column proportions; ``col_overrides`` lets it reassign a
    room's column. Output is axis-aligned, gap-free per band, non-overlapping.

    The packer guarantees (subject to space) that every kept room meets the
    region's ``min_dim`` width and a sensible ``min_area``; a room that cannot be
    made to fit is dropped lowest-priority-first and recorded.
    """

    def __init__(
        self,
        env: tuple[float, float, float, float],
        min_dim: float,
        min_habitable: float,
        min_area_by_type: dict[str, float],
        center_keepout: tuple[float, float],
        band_fracs: tuple[float, float, float] = (0.40, 0.20, 0.40),
        col_overrides: Optional[dict[str, int]] = None,
        force_two_band: bool = False,
        fill_center: bool = False,
    ) -> None:
        self.minx, self.miny, self.maxx, self.maxy = env
        self.env_w = self.maxx - self.minx
        self.env_d = self.maxy - self.miny
        self.min_dim = min_dim
        self.min_habitable = min_habitable
        self.min_area_by_type = min_area_by_type
        # y-range (in plot coords) of the Brahmasthan keep-open band: centre-band
        # rooms are split to sit south and north of this gap, never inside it.
        self.keep_lo, self.keep_hi = center_keepout
        self.band_fracs = band_fracs
        self.col_overrides = col_overrides or {}
        # Collapse the centre service spine into the two side bands — no narrow
        # central column / open-Brahmasthan corridor (used for the looser multi-
        # floor programs where a real home keeps living & dining adjacent).
        self.force_two_band = force_two_band
        # Pack the centre band like a normal column (no open-Brahmasthan gap) so a
        # narrow service spine is filled top-to-bottom rather than leaving a void.
        self.fill_center = fill_center

    # -- helpers ----------------------------------------------------------- #
    _HABITABLE = ("living", "master_bedroom", "bedroom", "childrens_bedroom", "study")

    # Useful UPPER area for service / circulation rooms — past this they only waste
    # space, so the water-fill caps them and hands the surplus to habitable rooms
    # (which keeps a stair / WC / pooja from ballooning and starving the living).
    _MAX_AREA_BY_TYPE = {
        "staircase": 5.5,
        "toilet": 6.0,
        "bathroom": 6.0,
        "pooja": 4.0,
        "utility": 4.5,
        "entrance": 3.5,
        "store": 4.0,
        "dining": 14.0,
    }

    def _max_run_for(self, room: ProgramRoom, col_w: float) -> float:
        """Upper run for a room in a ``col_w``-wide column. The living and bare
        bedrooms are uncapped (return +inf) so they soak up a band's slack. A
        bedroom+bath BLOCK is capped so its bounding aspect stays at most
        ``_ASPECT_SOFT`` — it grows to a generous size on a wide band but never
        stretches into a 3:1 ribbon on a narrow one (the lone full-depth bedroom
        defect). The min-run floor still wins if a room genuinely needs more depth to
        meet its minimum area (a sub-minimum room is worse than a slightly long one).
        Service rooms keep their useful-area cap so they never balloon when alone."""
        rt = room.type.value
        if room.attach_bath:
            if col_w <= 1e-6:
                return float("inf")
            return max(self._effective_min_run(room, col_w), _ASPECT_SOFT * col_w)
        if rt in self._HABITABLE:
            return float("inf")
        cap = self._MAX_AREA_BY_TYPE.get(rt)
        if cap is None or col_w <= 1e-6:
            return float("inf")
        return max(self._min_run_for(rt), cap / col_w)

    def _min_area_for(self, rt: str) -> float:
        """Smallest acceptable area for a room of this type (region-driven)."""
        if rt in self.min_area_by_type:
            return float(self.min_area_by_type[rt])
        if rt in self._HABITABLE:
            return self.min_habitable
        # service / circulation rooms: a modest box.
        return max(1.4, self.min_dim * 0.9)

    def _room_min_area(self, room: ProgramRoom) -> float:
        """Minimum area a specific program room must keep. For a combined
        bedroom+bath block this is the bedroom's comfortable minimum PLUS its
        attached bath (and a dressing strip when present) so the packer never
        shrinks the block below what a guillotine cut needs; otherwise the
        type-driven minimum applies."""
        base = self._min_area_for(room.type.value)
        if room.attach_bath:
            block = room.bedroom_min_sqm + max(room.bath_min_sqm, _BATH_AREA_MIN)
            if room.dressing:
                block += _COMFORT["dressing"]
            return max(base, block)
        return max(base, room.min_area_floor)

    def _min_run_for(self, rt: str) -> float:
        """Minimum vertical run (stacked height) for a room of this type. The
        region's ``min_dim`` only binds on *habitable* rooms; service / wet rooms
        may be shallower, which lets the narrow service spine pack tightly."""
        if rt in self._HABITABLE or rt == "kitchen":
            return self.min_dim
        if rt in ("toilet", "bathroom"):
            return 1.2
        if rt in ("staircase",):
            return 2.4  # need run for a flight + landing
        if rt == "dining":
            return 2.1
        if rt in ("pooja", "utility", "store", "entrance"):
            return 1.5
        return 1.5

    def _min_width_for(self, rt: str) -> float:
        """Minimum horizontal width for a room of this type (column-width floor)."""
        if rt in self._HABITABLE or rt in ("kitchen", "dining"):
            return self.min_dim
        if rt in ("toilet", "bathroom"):
            return 0.9
        if rt in ("staircase",):
            return 1.02  # >= regional min staircase clear width (1.0 m) + margin
        return 1.1

    def _effective_min_run(self, room: ProgramRoom, col_w: float) -> float:
        """Vertical run a room MUST get in a column of width ``col_w`` to satisfy
        both its per-type min-run and (for area-bound rooms) its minimum area.
        Guarantees area >= min when the column is at least min-width wide."""
        rt = room.type.value
        run = self._min_run_for(rt)
        # Combined bedroom+bath block: the run must hold the bedroom at >= its min
        # AND a bath strip of >= 1.5 m (the strip is carved off the North edge on
        # the narrow side bands). Sizing the run this way guarantees the post-pack
        # guillotine cut leaves a bedroom that still meets its minimum.
        if room.attach_bath and col_w > 1e-6:
            bed_run = room.bedroom_min_sqm / col_w
            bath_run = max(_BATH_STRIP_MIN_W, max(room.bath_min_sqm, _BATH_AREA_MIN) / col_w)
            dress_run = (_COMFORT["dressing"] / col_w) if room.dressing else 0.0
            return max(run, bed_run + bath_run + dress_run)
        # area-bound rooms: ensure width*run >= required minimum area.
        if rt in self._HABITABLE or rt in self.min_area_by_type or rt == "kitchen":
            need_area = self._room_min_area(room)
            if col_w > 1e-6:
                run = max(run, need_area / col_w)
        return run

    # Service rooms that may form the narrow central spine (never a heavy room).
    # Pooja stays OUT — it wants the NE corner, not the compass-neutral centre.
    _SPINE_TYPES = ("staircase", "utility", "store", "toilet", "bathroom")
    # Heavy / habitable rooms that must own a wide side band (never the centre).
    _SIDE_ONLY = (
        "living", "master_bedroom", "bedroom", "childrens_bedroom", "study", "kitchen", "dining"
    )

    def _assign_column(self, room: ProgramRoom) -> int:
        if room.id in self.col_overrides:
            return self.col_overrides[room.id]
        col = _COL_OF_ZONE.get(room.ideal_zones[0], 1)
        if col == 1 and room.type.value in self._SIDE_ONLY:
            # a heavy room whose ideal is N/S still belongs in a side band:
            # pick the compass side from its next zone, else West.
            for z in room.ideal_zones[1:]:
                c = _COL_OF_ZONE.get(z)
                if c in (0, 2):
                    return c
            return 0
        return col

    def _row_rank(self, room: ProgramRoom) -> int:
        return _ROW_RANK_OF_ZONE.get(room.ideal_zones[0], 1)

    def _family_columns(self, room: ProgramRoom) -> set[int]:
        """Columns whose compass family this room's zones are compatible with —
        used when balancing so a West room never lands in the East band. Heavy /
        habitable rooms are barred from the centre spine."""
        fams = {_COL_OF_ZONE.get(z) for z in room.ideal_zones}
        fams.discard(None)
        if room.type.value not in self._SIDE_ONLY:
            fams.add(1)  # service rooms may use the compass-neutral centre
        return fams  # type: ignore[return-value]

    def _column_floor(self, members: list[ProgramRoom]) -> float:
        """Minimum width a column needs: the widest member's own minimum width,
        AND — for columns carrying bulky bedroom+bath blocks — enough width that
        the column's blocks fit the envelope depth when stacked (width >= total
        block area / env_d). Without the area-driven floor the width distributor
        can starve a bedroom column so thin that its blocks grow taller than the
        plot and get dropped. Capped so a single column can't demand the whole
        plot width (leaves room for the other bands)."""
        if not members:
            return 0.0
        widest = max(self._min_width_for(r.type.value) for r in members)
        # area-driven floor only for columns that carry attached-bath bedrooms
        # (the blocks that actually need it); other columns keep the simple floor.
        block_members = [r for r in members if r.attach_bath]
        if block_members and self.env_d > 1e-6:
            # Each block's run holds the bedroom (>= its min) PLUS a bath strip of
            # >= 1.5 m; the strip's area floor is 1.5 * column_width, which exceeds
            # bath_min on wider columns. Solve the column width w that fits all
            # blocks' runs in env_d, including that strip floor, by a short fixed-
            # point iteration (converges in a couple of steps).
            other = sum(self._min_run_for(r.type.value) for r in members if not r.attach_bath)
            avail = max(1e-6, self.env_d - min(other, 0.5 * self.env_d))
            w = max(widest, sum(self._room_min_area(r) for r in block_members) / avail)
            for _ in range(4):
                need_run = 0.0
                for r in block_members:
                    bath_run = max(_BATH_STRIP_MIN_W, max(r.bath_min_sqm, _BATH_AREA_MIN) / w)
                    dress_run = (_COMFORT["dressing"] / w) if r.dressing else 0.0
                    need_run += r.bedroom_min_sqm / w + bath_run + dress_run
                if need_run <= avail + 1e-9:
                    break
                w = max(widest, w * need_run / avail)
            return min(max(widest, w), 0.66 * self.env_w)
        return widest

    def _column_hab_floor(self, members: list[ProgramRoom]) -> float:
        """The width a column MUST keep so every *code-habitable* room it carries
        (living / bedroom / study — the rooms code checks for ``min_dim`` on their
        narrowest side) clears that minimum. A column with no code-habitable room
        (a pure service spine, or a dining/kitchen-only band) returns 0 here, so the
        forced-shrink path may squeeze it instead of pushing a habitable band's
        living below ``min_dim`` and tripping a code fail."""
        if any(r.type.value in _HABITABLE_TYPES for r in members):
            return self.min_dim
        return 0.0

    def _column_widths(self, cols: dict[int, list[ProgramRoom]]) -> list[float]:
        """Column widths: each populated column is given AT LEAST its widest
        member's minimum width, and the remaining envelope width is shared in
        proportion to assigned area (blended with the band-fraction prior).

        Empty columns get zero width. If the floors alone exceed ``env_w`` (an
        over-columned narrow plot — the centre-fold normally prevents this) we
        still PROTECT every column carrying a code-habitable room at ``min_dim``
        (so its living/bedroom never lands under the code-min narrowest side) and
        take the shrink out of the non-habitable spine; only if even the protected
        floors don't fit do we fall back to a proportional squeeze."""
        f = self.band_fracs
        floor = [self._column_floor(cols[ci]) for ci in (0, 1, 2)]
        total_floor = sum(floor)

        if total_floor > self.env_w + 1e-9:
            # Protect code-habitable bands at min_dim; shrink the rest to fit.
            hab = [self._column_hab_floor(cols[ci]) for ci in (0, 1, 2)]
            protected = sum(hab)
            if protected <= self.env_w + 1e-9 and protected > 1e-9:
                slack = self.env_w - protected
                # bands above their habitable floor share the leftover by their own
                # floor weight; a pure-service band (hab=0) can shrink to its widest
                # member's bare minimum width but never below.
                excess = [max(0.0, floor[ci] - hab[ci]) for ci in (0, 1, 2)]
                bare = [self._column_bare_floor(cols[ci]) for ci in (0, 1, 2)]
                # first satisfy every band's bare minimum width out of the slack
                bare_extra = [max(0.0, bare[ci] - hab[ci]) for ci in (0, 1, 2)]
                if sum(bare_extra) <= slack + 1e-9:
                    rem = slack - sum(bare_extra)
                    base = [hab[ci] + bare_extra[ci] for ci in (0, 1, 2)]
                    esum = sum(excess) or 1.0
                    return [base[ci] + rem * excess[ci] / esum for ci in (0, 1, 2)]
            # genuinely can't protect — proportional squeeze (legacy best-effort).
            s = total_floor or 1.0
            return [self.env_w * fl / s for fl in floor]

        slack = self.env_w - total_floor
        weight: list[float] = []
        for ci in (0, 1, 2):
            if not cols[ci]:
                weight.append(0.0)
            else:
                area = sum(max(r.target_sqm, self._room_min_area(r)) for r in cols[ci])
                weight.append(0.65 * area + 0.35 * f[ci] * self.env_w * 3.0)
        wsum = sum(weight) or 1.0
        return [floor[ci] + slack * weight[ci] / wsum for ci in (0, 1, 2)]

    def _column_bare_floor(self, members: list[ProgramRoom]) -> float:
        """The widest member's own minimum width (no area-driven inflation) — the
        absolute floor a column can shrink to under width pressure."""
        if not members:
            return 0.0
        return max(self._min_width_for(r.type.value) for r in members)

    # -- packing ----------------------------------------------------------- #
    def pack(self, program: list[ProgramRoom]) -> PackResult:
        cols: dict[int, list[ProgramRoom]] = {0: [], 1: [], 2: []}
        for r in program:
            cols[self._assign_column(r)].append(r)

        cols = self._rebalance_columns(cols)
        widths = self._column_widths(cols)

        x_at = [self.minx]
        for w in widths:
            x_at.append(x_at[-1] + w)
        col_x = [(x_at[i], x_at[i + 1]) for i in range(3)]

        placed: list[PlacedRoom] = []
        dropped: list[str] = []
        for ci in (0, 2, 1):  # fill side bands first, centre last (stays light)
            x0, x1 = col_x[ci]
            col_w = x1 - x0
            members = sorted(cols[ci], key=lambda r: (self._row_rank(r), -r.priority))
            if ci == 1 and not self.fill_center:
                p, d = self._stack_center(members, x0, x1, col_w)
            else:
                p, d = self._stack_column(members, x0, x1, col_w)
                self._fill_one_band(p)
            placed.extend(p)
            dropped.extend(d)

        return PackResult(placed=placed, dropped=dropped)

    def _rebalance_columns(self, cols: dict[int, list[ProgramRoom]]) -> dict[int, list[ProgramRoom]]:
        """Balance the three bands so each can actually hold its rooms.

        Side bands (W/E) carry the habitable rooms; the centre carries a light
        service spine (stair / WC / utility) that is split around an open
        Brahmasthan gap. We (1) seed the spine from overloaded side bands using
        compass-compatible service rooms, then (2) shed any residual overflow
        lowest-priority-first to the emptiest compatible band, then (3) fold a
        near-empty centre back into a side band so it never becomes a lone sliver
        that would block the Brahmasthan."""
        # Rough per-side column width from the band-fraction prior, used to make
        # the load estimate (which drives moves) agree with the real stacker.
        f = self.band_fracs
        side_w = {
            0: max(self.min_dim, self.env_w * f[0] / sum(f)),
            1: max(0.9, self.env_w * f[1] / sum(f)),
            2: max(self.min_dim, self.env_w * f[2] / sum(f)),
        }

        def load(ci: int) -> float:
            return sum(self._effective_min_run(r, side_w[ci]) for r in cols[ci])

        # Vastu cost of exiling a service room to the (compass-neutral) centre:
        # the stair (SW/S/W ideal, S available in the centre-south) and the
        # utility (NW/N/W, N available) lose little; a toilet (NW/W ideal) loses
        # more, so move it only as a last resort.
        _SPINE_EXIT_COST = {"staircase": 0, "store": 1, "utility": 1, "bathroom": 3, "toilet": 3}

        # (1) Relieve an over-subscribed side band by exiling its cheapest service
        #     rooms to the centre — only as far as needed to make the band fit.
        for ci in (0, 2):
            while load(ci) > self.env_d + 1e-9:
                movable = [r for r in cols[ci] if r.type.value in self._SPINE_TYPES]
                if not movable:
                    break
                # cheapest to move first; ties broken by lowest priority
                victim = min(movable, key=lambda r: (_SPINE_EXIT_COST.get(r.type.value, 2), r.priority))
                if self.force_two_band or load(1) + self._effective_min_run(victim, side_w[1]) > self.env_d + 1e-9:
                    break  # centre disabled / full; leave for the generic overflow pass
                cols[ci].remove(victim)
                cols[1].append(victim)

        # (2) Residual overflow on any band -> emptiest compatible band, else drop
        #     is deferred to the stacker (it records drops).
        for ci in (0, 1, 2):
            while load(ci) > self.env_d + 1e-9:
                victim = min(cols[ci], key=lambda r: r.priority)
                targets = sorted(
                    (c for c in (0, 1, 2) if c != ci and c in self._family_columns(victim)),
                    key=load,
                )
                moved = False
                for t in targets:
                    if load(t) + self._effective_min_run(victim, side_w[t]) <= self.env_d + 1e-9:
                        cols[ci].remove(victim)
                        cols[t].append(victim)
                        moved = True
                        break
                if not moved:
                    break  # stacker will drop it

        # (3) Fold the centre into the side bands when it is thin OR when the
        #     envelope is simply too narrow to carry three columns (a 3-band split
        #     would starve the habitable side bands below min width). On narrow
        #     plots two wider bands give every room a workable width.
        too_narrow = self.env_w < 2.0 * self.min_dim + 1.0
        if cols[1] and (self.force_two_band or too_narrow or len(cols[1]) < 2 or load(1) < 0.30 * self.env_d):
            for r in list(cols[1]):
                side = 0
                for z in r.ideal_zones:
                    c = _COL_OF_ZONE.get(z)
                    if c in (0, 2) and load(c) + self._effective_min_run(r, side_w[c]) <= self.env_d:
                        side = c
                        break
                else:
                    side = 0 if load(0) <= load(2) else 2
                cols[1].remove(r)
                cols[side].append(r)

        return cols

    def _stack_column(
        self, members: list[ProgramRoom], x0: float, x1: float, col_w: float
    ) -> tuple[list[PlacedRoom], list[str]]:
        """Stack ``members`` vertically in [miny, maxy] within column [x0, x1].

        Heights are proportional to target area but each room is held at >= its
        per-type minimum run; if the column is over-subscribed the lowest
        priority rooms are dropped until the rest fit."""
        placed: list[PlacedRoom] = []
        dropped: list[str] = []
        if not members:
            return placed, dropped

        avail = self.env_d
        members = list(members)
        while members and sum(self._effective_min_run(r, col_w) for r in members) > avail + 1e-9:
            victim = min(members, key=lambda r: r.priority)
            members.remove(victim)
            dropped.append(victim.id)
        if not members:
            return placed, dropped

        mins = [self._effective_min_run(r, col_w) for r in members]
        maxes = [max(mn, self._max_run_for(r, col_w)) for r, mn in zip(members, mins)]
        desired = []
        for r, mn in zip(members, mins):
            need_area = max(r.target_sqm, self._room_min_area(r))
            h = need_area / col_w if col_w > 0 else mn
            desired.append(max(h, mn))
        desired = self._normalise_runs(desired, mins, avail, maxes)
        # Hand any slack from capped rooms to the band's uncapped (habitable) room;
        # a lone capped bedroom block with no habitable band-mate is left short so
        # its surplus depth becomes open plot at the North edge, not a ribbon.
        self._stretch_to_fill(desired, maxes, avail, members)

        y = self.miny
        for r, h in zip(members, desired):
            placed.append(PlacedRoom(r.id, r.type, x0, y, x1, y + h, r.ceiling_height_m))
            y += h
        return placed, dropped

    def _normalise_runs(
        self,
        runs: list[float],
        mins: list[float],
        avail: float,
        maxes: Optional[list[float]] = None,
    ) -> list[float]:
        """Scale ``runs`` to sum to ``avail`` while keeping each entry within its
        ``[mins, maxes]`` band (water-filling: clamp the smalls/bigs, share the
        rest). ``maxes`` defaults to +inf per entry; capping a service room hands
        its surplus to the uncapped (habitable) rooms."""
        runs = list(runs)
        n = len(runs)
        if maxes is None:
            maxes = [float("inf")] * n
        # start within band
        runs = [min(max(runs[i], mins[i]), maxes[i]) for i in range(n)]
        for _ in range(2 * n + 3):
            total = sum(runs)
            if abs(total - avail) < 1e-9:
                break
            if total > avail:
                free_idx = [i for i in range(n) if runs[i] > mins[i] + 1e-9]
                excess = total - avail
                shrinkable = sum(runs[i] - mins[i] for i in free_idx)
                if shrinkable <= 1e-9:
                    scale = avail / total if total > 1e-9 else 1.0
                    runs = [h * scale for h in runs]
                    break
                for i in free_idx:
                    runs[i] = max(mins[i], runs[i] - excess * (runs[i] - mins[i]) / shrinkable)
            else:
                # grow only entries below their max; distribute by current size
                grow_idx = [i for i in range(n) if runs[i] < maxes[i] - 1e-9]
                if not grow_idx:
                    break  # everything capped — leave a gap (caller welds to edges)
                deficit = avail - total
                base = sum(runs[i] for i in grow_idx) or float(len(grow_idx))
                headroom = sum(maxes[i] - runs[i] for i in grow_idx)
                step = min(deficit, headroom)
                for i in grow_idx:
                    share = (runs[i] / base) if base > 0 else (1.0 / len(grow_idx))
                    runs[i] = min(maxes[i], runs[i] + step * share)
                if headroom <= deficit + 1e-9:
                    break  # filled all headroom; remaining gap welded by _fill_one_band
        return runs

    def _stretch_to_fill(
        self, runs: list[float], maxes: list[float], avail: float,
        members: Optional[list[ProgramRoom]] = None,
    ) -> None:
        """If capping rooms left the column short of ``avail``, hand the slack to the
        uncapped (habitable) rooms so the band tiles its full depth without
        re-inflating a capped room. Mutates ``runs`` in place.

        With no uncapped room to absorb the slack, a PURE SERVICE column (only
        WC/store/stair) is still filled evenly (a deep lone WC is harmless). But a
        capped BEDROOM block with no habitable band-mate is left short: the slack
        becomes open plot at the band's North edge (``_fill_one_band`` keeps it)
        rather than stretching the bedroom into a ribbon. ``members`` (aligned with
        ``runs``) lets us tell those two cases apart."""
        gap = avail - sum(runs)
        if gap <= 1e-9:
            return
        uncapped = [i for i in range(len(runs)) if maxes[i] == float("inf")]
        if uncapped:
            base = sum(runs[i] for i in uncapped) or float(len(uncapped))
            for i in uncapped:
                runs[i] += gap * (runs[i] / base if base > 0 else 1.0 / len(uncapped))
            return
        # no uncapped room. Only fill evenly if the whole column is service rooms
        # (no bedroom block); otherwise leave the gap as open plot.
        has_block = bool(members) and any(m.attach_bath for m in members)
        if not has_block:
            for i in range(len(runs)):
                runs[i] += gap / len(runs)

    # A gap larger than this (m) at a band's North edge is an INTENTIONAL open-plot
    # strip left by ``_stretch_to_fill`` (a lone capped bedroom that would otherwise
    # ribbon); smaller gaps are numerical drift to be welded out.
    _BAND_GAP_TOL = 0.25

    def _fill_one_band(self, band: list[PlacedRoom]) -> None:
        """Snap a fully-stacked band to [miny, maxy] and weld neighbours so there are
        no slivers from numerical drift. A genuine gap at the North edge (left
        deliberately for a lone capped bedroom, see ``_stretch_to_fill``) is kept as
        open plot rather than re-inflating the last room into a ribbon."""
        band = sorted(band, key=lambda p: p.y0)
        if not band:
            return
        band[0].y0 = self.miny
        if self.maxy - band[-1].y1 <= self._BAND_GAP_TOL:
            band[-1].y1 = self.maxy  # drift only — weld to the edge
        for a, b in zip(band, band[1:]):
            mid = 0.5 * (a.y1 + b.y0)
            a.y1 = mid
            b.y0 = mid

    def _stack_center(
        self, members: list[ProgramRoom], x0: float, x1: float, col_w: float
    ) -> tuple[list[PlacedRoom], list[str]]:
        """Stack the centre service spine around an OPEN Brahmasthan gap.

        South-leaning rooms grow up from ``miny`` but stop at ``keep_lo``;
        north-leaning rooms grow down from ``maxy`` but stop at ``keep_hi``. The
        [keep_lo, keep_hi] middle stays empty so nothing occupies the centre. Each
        half water-fills its own slot; rooms that don't fit a half are dropped."""
        placed: list[PlacedRoom] = []
        dropped: list[str] = []
        if not members:
            return placed, dropped

        south_lo, south_hi = self.miny, max(self.miny, min(self.keep_lo, self.maxy))
        north_lo, north_hi = max(self.miny, min(self.keep_hi, self.maxy)), self.maxy
        south_avail = max(0.0, south_hi - south_lo)
        north_avail = max(0.0, north_hi - north_lo)

        south = [r for r in members if self._row_rank(r) == 0]
        north = [r for r in members if self._row_rank(r) == 2]
        middle = [r for r in members if self._row_rank(r) == 1]
        # middle-leaning service rooms go to whichever half has more spare room.
        for r in middle:
            (south if south_avail >= north_avail else north).append(r)

        def fill_half(group, lo, hi, grow_up) -> None:
            avail = hi - lo
            group = sorted(group, key=lambda r: -r.priority)
            while group and sum(self._effective_min_run(r, col_w) for r in group) > avail + 1e-9:
                victim = min(group, key=lambda r: r.priority)
                group.remove(victim)
                dropped.append(victim.id)
            if not group:
                return
            # order within the half: south half goes S->N, north half N->S inward
            group = sorted(group, key=lambda r: (self._row_rank(r), -r.priority), reverse=not grow_up)
            mins = [self._effective_min_run(r, col_w) for r in group]
            maxes = [max(mn, self._max_run_for(r, col_w)) for r, mn in zip(group, mins)]
            desired = []
            for r, mn in zip(group, mins):
                need = max(r.target_sqm, self._room_min_area(r))
                desired.append(max(need / col_w if col_w > 0 else mn, mn))
            # cap service rooms in the spine too; any slack simply widens the
            # open Brahmasthan gap (no _stretch_to_fill here) which Vastu rewards.
            desired = self._normalise_runs(desired, mins, avail, maxes)
            if grow_up:
                y = lo
                for r, h in zip(group, desired):
                    placed.append(PlacedRoom(r.id, r.type, x0, y, x1, y + h, r.ceiling_height_m))
                    y += h
            else:
                y = hi
                for r, h in zip(group, desired):
                    placed.append(PlacedRoom(r.id, r.type, x0, y - h, x1, y, r.ceiling_height_m))
                    y -= h

        fill_half(south, south_lo, south_hi, grow_up=True)
        fill_half(north, north_lo, north_hi, grow_up=False)
        return placed, dropped


# --------------------------------------------------------------------------- #
# Openings — one door per room (toward centre) + windows on exterior walls
# --------------------------------------------------------------------------- #
_DOOR_SIZE = {
    "default": (0.9, 2.1),
    "main": (1.2, 2.1),
    "living": (1.5, 2.1),
    "toilet": (0.75, 2.0),
    "bathroom": (0.75, 2.0),
    "utility": (0.8, 2.0),
    "pooja": (0.8, 2.0),
    "store": (0.8, 2.0),
}
_WINDOW_SIZE = {
    "default": (1.2, 1.2),
    "living": (1.8, 1.2),
    "master_bedroom": (1.5, 1.2),
    "bedroom": (1.5, 1.2),
    "childrens_bedroom": (1.5, 1.2),
    "kitchen": (1.2, 1.2),
    "toilet": (0.6, 0.75),
    "bathroom": (0.6, 0.75),
    "utility": (0.6, 0.9),
    "pooja": (0.6, 0.9),
    "staircase": (0.6, 1.2),
    "store": (0.6, 0.9),
}


# Rooms that NBC treats as habitable for natural light + ventilation: each MUST
# reach an exterior window (or a ventilation shaft) and the kitchen with it.
_HABITABLE_VENT = {
    "living", "master_bedroom", "bedroom", "childrens_bedroom", "study", "kitchen", "dining",
}


def _make_openings(
    placed: list[PlacedRoom],
    env: tuple[float, float, float, float],
    edits: Optional["EditOverrides"] = None,
) -> tuple[list[Opening], list[Opening]]:
    """One door per room + NBC-compliant ventilation windows.

    Every habitable room and the kitchen gets a window sized to at least 1/10 of
    its floor area (the kitchen +25%, minimum 1 m^2). Corner rooms (touching two
    exterior walls) get a SECOND window on the perpendicular wall for genuine
    cross-ventilation. An interior habitable room — one the packer couldn't put on
    the perimeter — gets a light/ventilation-shaft window on its longest wall so no
    living space is left unventilated. Service rooms (toilet/store/pooja/stair)
    keep a small ventilator only where they already reach an exterior wall. Windows
    prefer a North then East exposure (Vastu light)."""
    minx, miny, maxx, maxy = env
    boost = bool(edits and edits.ventilation_boost)
    doors: list[Opening] = []
    windows: list[Opening] = []
    for p in placed:
        rt = p.type.value
        # Open / virtual rooms (courtyard, sit-out, balcony, parking, shafts) are
        # open-to-sky or non-enclosed — they get no conventional door/window.
        if p.type in _SITE_ROOM_TYPES:
            continue
        # -- door (main door for the entrance) --
        if rt == "entrance":
            dw, dh = _DOOR_SIZE["main"]
        else:
            dw, dh = _DOOR_SIZE.get(rt, _DOOR_SIZE["default"])
        dw = min(dw, max(0.6, p.width - 0.2), max(0.6, p.depth - 0.2))
        doors.append(
            Opening(id=f"d-{p.id}", room_id=p.id, kind="door", width_m=round(dw, 3), height_m=dh, count=1)
        )

        # -- exterior walls this room reaches --
        ext = {
            "N": abs(p.y1 - maxy) < 1e-6,
            "S": abs(p.y0 - miny) < 1e-6,
            "E": abs(p.x1 - maxx) < 1e-6,
            "W": abs(p.x0 - minx) < 1e-6,
        }
        sides = [s for s in ("N", "E", "S", "W") if ext[s]]  # Vastu-preferred order
        habitable = rt in _HABITABLE_VENT
        _, wh = _WINDOW_SIZE.get(rt, _WINDOW_SIZE["default"])
        base_w = _WINDOW_SIZE.get(rt, _WINDOW_SIZE["default"])[0]

        # NBC glazing area to aim for (only enforced on habitable rooms/kitchen).
        req_area = 0.0
        if habitable:
            req_area = max(1.0, p.area / 10.0) * (1.25 if rt == "kitchen" else 1.0)

        def _win(side: str, idx: int, area_aim: float, min_w: float) -> Optional[Opening]:
            wall_len = p.width if side in ("N", "S") else p.depth
            if wall_len <= 0.8:
                return None
            need_w = max(min_w, area_aim / max(wh, 0.9)) if area_aim else min_w
            ww = min(need_w, max(0.6, wall_len - 0.3))
            if boost and habitable:
                ww = min(ww * 1.15, max(0.6, wall_len - 0.3))
            wid = f"w-{p.id}" if idx == 0 else f"w{idx + 1}-{p.id}"
            return Opening(id=wid, room_id=p.id, kind="window",
                           width_m=round(ww, 3), height_m=wh, count=1)

        if sides:
            primary = sides[0]
            w0 = _win(primary, 0, req_area, base_w)
            if w0:
                windows.append(w0)
            # cross-ventilation: a second window on a perpendicular exterior wall.
            if habitable and len(sides) >= 2:
                perp = ("E", "W") if primary in ("N", "S") else ("N", "S")
                cross = next((s for s in sides[1:] if s in perp), sides[1])
                w1 = _win(cross, 1, max(1.0, req_area * 0.5), max(1.0, base_w * 0.8))
                if w1:
                    windows.append(w1)
        elif habitable:
            # interior habitable room: a light / ventilation-shaft window so the
            # space still meets the "every habitable room is ventilated" rule.
            side = "N" if p.width >= p.depth else "E"
            w0 = _win(side, 0, req_area, base_w)
            if w0:
                windows.append(w0)
    return doors, windows


# --------------------------------------------------------------------------- #
# Assembly + checks
# --------------------------------------------------------------------------- #
def _assert_no_overlap(placed: list[PlacedRoom]) -> None:
    """Axis-aligned rectangle overlap check (area-positive intersection)."""
    for i in range(len(placed)):
        a = placed[i]
        for j in range(i + 1, len(placed)):
            b = placed[j]
            ox = min(a.x1, b.x1) - max(a.x0, b.x0)
            oy = min(a.y1, b.y1) - max(a.y0, b.y0)
            if ox > 1e-6 and oy > 1e-6:
                raise AssertionError(
                    f"rooms '{a.id}' and '{b.id}' overlap by {round(ox * oy, 4)} m2"
                )


def _assert_inside(placed: list[PlacedRoom], env: tuple[float, float, float, float]) -> None:
    minx, miny, maxx, maxy = env
    for p in placed:
        if (
            p.x0 < minx - 1e-6 or p.y0 < miny - 1e-6
            or p.x1 > maxx + 1e-6 or p.y1 > maxy + 1e-6
        ):
            raise AssertionError(f"room '{p.id}' falls outside the buildable envelope")


# --------------------------------------------------------------------------- #
# Studio — bespoke layout (the 3-band packer is wrong for a single-room dwelling)
# --------------------------------------------------------------------------- #
def _studio_layouts(
    env: tuple[float, float, float, float], min_dim: float, min_kitchen: float, bath_min: float
) -> list[list[PlacedRoom]]:
    """Produce a handful of bespoke studio layouts (the 3-band packer slices a
    single-room dwelling too thin). Each is a large living-cum-bedroom plus a
    kitchenette and a bath, all axis-aligned rectangles meeting their code minima.
    ``generate_plan`` scores them and keeps the most Vastu-sound for the facing —
    cheaper and more reliable than trying to reason about the setback-offset centre
    analytically. The living always spans a full edge so its narrowest side equals
    the envelope width/height and clears the habitable minimum dimension."""
    minx, miny, maxx, maxy = env
    w = maxx - minx
    d = maxy - miny
    layouts: list[list[PlacedRoom]] = []

    def add(rooms: list[PlacedRoom]) -> None:
        # keep only geometrically sane layouts (all rooms positive, inside env)
        if all(r.width > 0.5 and r.depth > 0.5 for r in rooms):
            layouts.append(rooms)

    # bath width sized to clear bath_min within a reasonable strip depth.
    bw = min(max(1.5, min_dim * 0.6), 0.45 * w)
    bh = min(max(1.5, min_dim * 0.6), 0.45 * d)

    # (1) South strip: bath SW, kitchen SE; living spans the north (full width).
    kit_w = w - bw
    strip = min(max(min_kitchen / max(0.8, kit_w), bath_min / max(0.8, bw), 1.8), d - min_dim)
    if strip >= 1.5 and kit_w >= 1.2 and d - strip >= min_dim:
        add([
            PlacedRoom("living", RoomType.living, minx, miny + strip, maxx, maxy),
            PlacedRoom("toilet1", RoomType.toilet, minx, miny, minx + bw, miny + strip),
            PlacedRoom("kitchen", RoomType.kitchen, minx + bw, miny, maxx, miny + strip),
        ])

    # (2) East strip (full height): kitchen SE, bath NE-avoided -> bath at SE-south,
    #     kitchen above; living spans the west (full height). Good when E-facing
    #     pushes the envelope west so the right edge reads E/SE.
    col_w = min(max(min_kitchen / max(0.8, (d * 0.5)), bath_min / max(0.8, (d * 0.5)), 1.8), w - min_dim)
    if col_w >= 1.5 and w - col_w >= min_dim:
        x_split = maxx - col_w
        midy = miny + 0.5 * d
        add([
            PlacedRoom("living", RoomType.living, minx, miny, x_split, maxy),
            PlacedRoom("toilet1", RoomType.toilet, x_split, miny, maxx, midy),     # SE-south
            PlacedRoom("kitchen", RoomType.kitchen, x_split, midy, maxx, maxy),    # E/SE-north
        ])
        # (2b) swap so kitchen sits to the south (SE) and bath to the north-east-
        #      avoided side -> bath in the W column instead (NW). Mirror on x.
        add([
            PlacedRoom("living", RoomType.living, minx + col_w, miny, maxx, maxy),
            PlacedRoom("toilet1", RoomType.toilet, minx, miny + 0.5 * d, minx + col_w, maxy),  # NW
            PlacedRoom("kitchen", RoomType.kitchen, minx, miny, minx + col_w, miny + 0.5 * d),  # SW/S
        ])

    # (3) Corner kitchen SE + corner bath NW, living the big L-free remainder is not
    #     rectangular, so instead: bath NW strip (north), kitchen SE strip (south),
    #     living the middle full-width band. Three stacked full-width rows.
    bath_row = min(max(bath_min / w, 1.5), 0.3 * d)
    kit_row = min(max(min_kitchen / w, 1.6), 0.35 * d)
    if d - bath_row - kit_row >= min_dim:
        add([
            PlacedRoom("kitchen", RoomType.kitchen, minx, miny, maxx, miny + kit_row),       # south
            PlacedRoom("living", RoomType.living, minx, miny + kit_row, maxx, maxy - bath_row),
            PlacedRoom("toilet1", RoomType.toilet, minx, maxy - bath_row, maxx, maxy),        # north (NW-ish)
        ])

    # Fallback: a single living-cum-bed + a corner bath (envelope too tiny to split)
    if not layouts:
        bd = min(d, max(1.8, bath_min / max(1.0, bw)))
        add([
            PlacedRoom("toilet1", RoomType.toilet, minx, miny, minx + bw, miny + bd),
            PlacedRoom("living", RoomType.living, minx + bw, miny, maxx, maxy),
        ])
    if not layouts:  # last resort: whole envelope is the living-cum-bed
        layouts.append([PlacedRoom("living", RoomType.living, minx, miny, maxx, maxy)])
    return layouts


# --------------------------------------------------------------------------- #
# Attached-bath carve — guillotine-split a bedroom block into bedroom + toilet
# --------------------------------------------------------------------------- #
def _zone_of_rect(p: PlacedRoom, plot: Plot) -> str:
    """Compass zone of a placed rectangle's centroid (plot-relative)."""
    cx = 0.5 * (p.x0 + p.x1)
    cy = 0.5 * (p.y0 + p.y1)
    return zone_of(cx, cy, plot.width_m, plot.depth_m).value


def _carve_attached_baths(
    placed: list[PlacedRoom],
    program_by_id: dict[str, ProgramRoom],
    plot: Plot,
    min_dim: float,
) -> list[PlacedRoom]:
    """For every placed bedroom flagged ``attach_bath``, slice a bath STRIP off
    its West (preferred, external wall) or North edge with a single straight
    guillotine cut, keeping BOTH the bath and the bedroom axis-aligned rectangles.

    The bath strip is 1.5-1.8 m wide and >= its required area; the remaining
    bedroom must still meet its comfortable minimum area and ``min_dim`` width. The
    bath is never left in the NE; W/NW/S are preferred. A bedroom that cannot be
    split without starving either piece is left whole (no attached bath) — the
    common toilet then serves it; this is recorded by the caller via the missing
    bath id, but in practice the program sizes blocks so the cut always succeeds.
    """
    out: list[PlacedRoom] = []
    for p in placed:
        spec = program_by_id.get(p.id)
        if spec is None or not spec.attach_bath:
            out.append(p)
            continue
        bath_min = max(spec.bath_min_sqm, _BATH_AREA_MIN)
        bed_min = spec.bedroom_min_sqm
        bath, bedroom = _split_block(p, spec, plot, min_dim, bath_min, bed_min)
        if bath is None:
            out.append(p)  # could not carve — leave whole
            continue
        # 4BHK master: also slice a slim dressing/wardrobe strip if room remains.
        if spec.dressing:
            dress, bedroom2 = _split_dressing(bedroom, plot, min_dim)
            if dress is not None:
                out.extend([bath, dress, bedroom2])
                continue
        out.extend([bath, bedroom])
    return out


def _split_block(
    p: PlacedRoom,
    spec: ProgramRoom,
    plot: Plot,
    min_dim: float,
    bath_min: float,
    bed_min: float,
) -> tuple[Optional[PlacedRoom], Optional[PlacedRoom]]:
    """Try a West (vertical) cut first, then a North (horizontal) cut. Return
    ``(bath, bedroom)`` rectangles or ``(None, None)`` if neither fits."""
    w, d = p.width, p.depth

    def bath_ok(rect: PlacedRoom) -> bool:
        # bath must not be NE; W/NW/S/SW/SE/E all acceptable (NE is the hard no).
        return _zone_of_rect(rect, plot) != "NE" and rect.area >= bath_min - 1e-6

    def bed_ok(rect: PlacedRoom) -> bool:
        return (
            rect.area >= bed_min - 1e-6
            and rect.min_side >= min_dim - 1e-6
        )

    candidates: list[tuple[PlacedRoom, PlacedRoom]] = []

    # --- Vertical cut: bath strip on the WEST (low-x) edge ---
    # strip width in [min, max], >= area need, and bedroom remainder >= min_dim.
    if w - min_dim >= _BATH_STRIP_MIN_W - 1e-6:
        sw = max(_BATH_STRIP_MIN_W, bath_min / d if d > 1e-6 else _BATH_STRIP_MIN_W)
        sw = min(sw, _BATH_STRIP_MAX_W, w - min_dim)
        if sw >= _BATH_STRIP_MIN_W - 1e-6:
            bath = PlacedRoom(spec.bath_id, RoomType.toilet, p.x0, p.y0, p.x0 + sw, p.y1, p.ceiling_height_m)
            bedroom = PlacedRoom(p.id, p.type, p.x0 + sw, p.y0, p.x1, p.y1, p.ceiling_height_m)
            if bath_ok(bath) and bed_ok(bedroom):
                candidates.append((bath, bedroom))

    # --- Horizontal cut: bath strip on the NORTH (high-y) edge ---
    if d - min_dim >= _BATH_STRIP_MIN_W - 1e-6:
        sh = max(_BATH_STRIP_MIN_W, bath_min / w if w > 1e-6 else _BATH_STRIP_MIN_W)
        sh = min(sh, _BATH_STRIP_MAX_W, d - min_dim)
        if sh >= _BATH_STRIP_MIN_W - 1e-6:
            bath = PlacedRoom(spec.bath_id, RoomType.toilet, p.x0, p.y1 - sh, p.x1, p.y1, p.ceiling_height_m)
            bedroom = PlacedRoom(p.id, p.type, p.x0, p.y0, p.x1, p.y1 - sh, p.ceiling_height_m)
            if bath_ok(bath) and bed_ok(bedroom):
                candidates.append((bath, bedroom))
        # --- Horizontal cut: bath strip on the SOUTH (low-y) edge ---
        # Lets an East-band bedroom keep its bath out of the NE (a north strip
        # there would land NE, which is forbidden); a south strip sits S/SE/E.
        if sh >= _BATH_STRIP_MIN_W - 1e-6:
            bath_s = PlacedRoom(spec.bath_id, RoomType.toilet, p.x0, p.y0, p.x1, p.y0 + sh, p.ceiling_height_m)
            bedroom_s = PlacedRoom(p.id, p.type, p.x0, p.y0 + sh, p.x1, p.y1, p.ceiling_height_m)
            if bath_ok(bath_s) and bed_ok(bedroom_s):
                candidates.append((bath_s, bedroom_s))

    if not candidates:
        # Relaxed fallback: allow a wider strip (up to 2.2 m) if the strict strip
        # could not reach the bath area on a deep/narrow block; West edge first.
        for vertical in (True, False):
            if vertical and w - min_dim >= _BATH_STRIP_MIN_W:
                sw = min(max(_BATH_STRIP_MIN_W, bath_min / d), 2.2, w - min_dim)
                bath = PlacedRoom(spec.bath_id, RoomType.toilet, p.x0, p.y0, p.x0 + sw, p.y1, p.ceiling_height_m)
                bedroom = PlacedRoom(p.id, p.type, p.x0 + sw, p.y0, p.x1, p.y1, p.ceiling_height_m)
                if bath_ok(bath) and bed_ok(bedroom):
                    candidates.append((bath, bedroom))
            elif not vertical and d - min_dim >= _BATH_STRIP_MIN_W:
                sh = min(max(_BATH_STRIP_MIN_W, bath_min / w), 2.2, d - min_dim)
                bath = PlacedRoom(spec.bath_id, RoomType.toilet, p.x0, p.y1 - sh, p.x1, p.y1, p.ceiling_height_m)
                bedroom = PlacedRoom(p.id, p.type, p.x0, p.y0, p.x1, p.y1 - sh, p.ceiling_height_m)
                if bath_ok(bath) and bed_ok(bedroom):
                    candidates.append((bath, bedroom))

    if not candidates:
        return None, None

    # Prefer the cut whose bath lands in the most auspicious zone (W/NW/S best),
    # then the one that leaves the larger bedroom.
    _BATH_ZONE_RANK = {"W": 0, "NW": 0, "S": 1, "SW": 2, "SE": 2, "E": 2, "N": 2}

    def rank(cand: tuple[PlacedRoom, PlacedRoom]) -> tuple[int, float]:
        bath, bedroom = cand
        return (_BATH_ZONE_RANK.get(_zone_of_rect(bath, plot), 3), -bedroom.area)

    return min(candidates, key=rank)


def _split_dressing(
    bedroom: PlacedRoom, plot: Plot, min_dim: float
) -> tuple[Optional[PlacedRoom], Optional[PlacedRoom]]:
    """Carve a slim wardrobe/dressing strip (store) off the bedroom's North edge
    for a 4BHK master, only if the bedroom stays >= min_dim deep and >= 12 m^2."""
    strip = 1.5
    if bedroom.depth - strip < min_dim or (bedroom.width * (bedroom.depth - strip)) < 12.0:
        return None, None
    dress = PlacedRoom(
        f"dressing_{bedroom.id}", RoomType.store,
        bedroom.x0, bedroom.y1 - strip, bedroom.x1, bedroom.y1, bedroom.ceiling_height_m,
    )
    remaining = PlacedRoom(
        bedroom.id, bedroom.type, bedroom.x0, bedroom.y0, bedroom.x1, bedroom.y1 - strip,
        bedroom.ceiling_height_m,
    )
    return dress, remaining


def _build_plan(
    placed: list[PlacedRoom],
    plot: Plot,
    env: tuple[float, float, float, float],
    project_name: str,
    edits: Optional["EditOverrides"] = None,
) -> Plan:
    rooms = [
        Room(
            id=p.id, type=p.type, polygon=p.polygon(),
            ceiling_height_m=p.ceiling_height_m, floor=p.floor,
        )
        for p in placed
    ]
    doors, windows = _make_openings(placed, env, edits)
    return Plan(
        project=Project(id="gen", name=project_name, created_at=None),
        plot=plot,
        rooms=rooms,
        doors=doors,
        windows=windows,
    )


_SITE_ROOM_TYPES = {
    RoomType.parking,
    RoomType.sitout,
    RoomType.courtyard,
    RoomType.garden,
    RoomType.service_shaft,
    RoomType.future_expansion,
    RoomType.balcony,  # semi-open: projects into a setback, not counted as FAR built-up
}


def _rect_room(
    room_id: str,
    room_type: RoomType,
    x0: float,
    y0: float,
    x1: float,
    y1: float,
    floor: int = 0,
) -> Optional[Room]:
    """Create a rectangular site/open-space room when it has meaningful area."""
    x0, x1 = sorted((max(0.0, x0), max(0.0, x1)))
    y0, y1 = sorted((max(0.0, y0), max(0.0, y1)))
    if x1 - x0 < 0.45 or y1 - y0 < 0.45 or (x1 - x0) * (y1 - y0) < 1.2:
        return None
    return Room(
        id=room_id,
        type=room_type,
        polygon=[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]],
        ceiling_height_m=3.0,
        floor=floor,
    )


def _add_site_utilization(
    plan: Plan, env: tuple[float, float, float, float], cars: Optional[int] = None
) -> dict:
    """Use the open plot margins as intentional Indian-house site zones.

    These zones are modelled as plan rooms so CAD/3D/MEP can show them, while the
    code and BOQ rules classify them as virtual/open-site spaces. This turns what
    used to look like wasted white space into car porch, sit-out, garden, service
    shaft, and future-expansion intelligence. The front setback carries a covered
    car porch sized to ~2.7 m per car bay (one or two cars by frontage, or an
    explicit ``cars`` override) placed at the non-NE corner, with the rest of the
    frontage as a sit-out.
    """
    W, D = plan.plot.width_m, plan.plot.depth_m
    minx, miny, maxx, maxy = env
    facing = plan.plot.facing.value
    rooms: list[Room] = []

    def add(room: Optional[Room]) -> None:
        if room is not None:
            rooms.append(room)

    # Covered car porch: ~2.7 m per bay across the frontage x full setback depth.
    _CAR_BAY = 2.7
    front_axis_y = facing in ("E", "NE", "SE", "W", "NW", "SW")  # frontage runs N-S
    frontage = max(0.0, (D - 0.9) if front_axis_y else (W - 0.9))
    n_cars = cars if cars else (2 if frontage >= 6.0 else 1)
    n_cars = max(1, min(3, int(n_cars)))
    span = min(frontage, n_cars * _CAR_BAY + 0.3) if frontage > 0 else 0.0

    # Front setback: porch at the non-NE end of the frontage, sit-out fills the rest.
    # `rear` is the opposite (back) setback strip + the axis its length runs along.
    if facing in ("E", "NE", "SE"):
        add(_rect_room("parking_front", RoomType.parking, maxx, 0.45, W, 0.45 + span))
        if 0.45 + span + 0.6 < D - 0.45:
            add(_rect_room("sitout_front", RoomType.sitout, maxx, 0.45 + span + 0.3, W, D - 0.45))
        rear, rear_axis = (0.0, 0.45, minx, D - 0.45), "y"
    elif facing in ("W", "NW", "SW"):
        add(_rect_room("parking_front", RoomType.parking, 0.0, 0.45, minx, 0.45 + span))
        if 0.45 + span + 0.6 < D - 0.45:
            add(_rect_room("sitout_front", RoomType.sitout, 0.0, 0.45 + span + 0.3, minx, D - 0.45))
        rear, rear_axis = (maxx, 0.45, W, D - 0.45), "y"
    elif facing == "N":
        add(_rect_room("parking_front", RoomType.parking, 0.45, maxy, 0.45 + span, D))
        if 0.45 + span + 0.6 < W - 0.45:
            add(_rect_room("sitout_front", RoomType.sitout, 0.45 + span + 0.3, maxy, W - 0.45, D))
        rear, rear_axis = (0.45, 0.0, W - 0.45, miny), "x"
    else:  # S
        add(_rect_room("parking_front", RoomType.parking, 0.45, 0.0, 0.45 + span, miny))
        if 0.45 + span + 0.6 < W - 0.45:
            add(_rect_room("sitout_front", RoomType.sitout, 0.45 + span + 0.3, 0.0, W - 0.45, miny))
        rear, rear_axis = (0.45, maxy, W - 0.45, D), "x"

    # Rear setback: a covered UTILITY / WASH balcony (washing machine + wash sink +
    # drying) at one end and a garden in the rest — the standard Indian back service
    # yard. The washing machine + floor drain + a tap are plumbed here (see MEP).
    rx0, ry0, rx1, ry1 = rear
    avail = (ry1 - ry0) if rear_axis == "y" else (rx1 - rx0)
    wspan = min(3.0, max(1.8, avail * 0.5))
    if rear_axis == "y":
        add(_rect_room("utility_balcony", RoomType.balcony, rx0, ry0, rx1, ry0 + wspan))
        if ry0 + wspan + 0.6 < ry1:
            add(_rect_room("garden_rear", RoomType.garden, rx0, ry0 + wspan + 0.3, rx1, ry1))
    else:
        add(_rect_room("utility_balcony", RoomType.balcony, rx0, ry0, rx0 + wspan, ry1))
        if rx0 + wspan + 0.6 < rx1:
            add(_rect_room("garden_rear", RoomType.garden, rx0 + wspan + 0.3, ry0, rx1, ry1))

    # Side strips: utility/service shaft and future expansion / rainwater buffer.
    add(_rect_room("service_shaft_side", RoomType.service_shaft, minx, 0.0, maxx, miny))
    add(_rect_room("future_expansion_side", RoomType.future_expansion, minx, maxy, maxx, D))

    # Upper-floor balconies (G+1+): a FRONT balcony (over the porch, off the front
    # bedroom) and a REAR balcony (off a back bedroom) — usable open balconies that
    # get a railing in 3D. Upper-floor setbacks are otherwise free.
    if plan.plot.floors >= 2:
        if facing in ("E", "NE", "SE"):
            front_b = (maxx, D * 0.30, W, D * 0.70)
        elif facing in ("W", "NW", "SW"):
            front_b = (0.0, D * 0.30, minx, D * 0.70)
        elif facing == "N":
            front_b = (W * 0.30, maxy, W * 0.70, D)
        else:
            front_b = (W * 0.30, 0.0, W * 0.70, miny)
        add(_rect_room("u_balcony_front", RoomType.balcony, *front_b, floor=1))
        half = min(2.2, avail * 0.3)
        if rear_axis == "y":
            mid = (ry0 + ry1) / 2
            rear_b = (rx0, mid - half, rx1, mid + half)
        else:
            mid = (rx0 + rx1) / 2
            rear_b = (mid - half, ry0, mid + half, ry1)
        add(_rect_room("u_balcony_rear", RoomType.balcony, *rear_b, floor=1))

    existing = {r.id for r in plan.rooms}
    plan.rooms.extend([r for r in rooms if r.id not in existing])
    site_area = sum(_poly_area(r.polygon) for r in rooms if r.id not in existing)
    plot_area = W * D
    return {
        "siteZoneCount": len([r for r in rooms if r.id not in existing]),
        "siteZoneTypes": sorted({r.type.value for r in rooms if r.id not in existing}),
        "siteOpenAreaSqm": round(site_area, 2),
        "parkingCars": n_cars,
        "parkingType": "stilt (under the building)" if plan.plot.floors >= 2 else "covered front porch",
        "plotUsePct": round(min(100.0, 100.0 * (site_area + sum(_poly_area(r.polygon) for r in plan.rooms if r.type not in _SITE_ROOM_TYPES)) / plot_area), 1) if plot_area else 0.0,
    }


def _poly_area(poly: list[tuple[float, float]] | list[list[float]]) -> float:
    area = 0.0
    pts = list(poly)
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        area += x1 * y2 - x2 * y1
    return abs(area) * 0.5


def _envelope_and_keepout(
    plot: Plot, code_rules: CodeRules
) -> tuple[tuple[float, float, float, float], tuple[float, float]]:
    """Buildable envelope (via code_service, no magic numbers) plus the plot's
    Brahmasthan keep-open y-band (central third) clamped to the envelope."""
    plot_area = plot.width_m * plot.depth_m
    band = code_rules.setback_for(plot.state.value, plot_area)
    env = buildable_envelope(
        plot.width_m,
        plot.depth_m,
        plot.facing.value,
        float(band.get("frontM", 0)),
        float(band.get("rearM", 0)),
        float(band.get("sideM", 0)),
    )
    # central third of the PLOT in y (matches zones.grid_3x3 CENTER detection)
    keep_lo = plot.depth_m / 3.0
    keep_hi = 2.0 * plot.depth_m / 3.0
    return env, (keep_lo, keep_hi)


def _enforce_coverage(
    placed: list[PlacedRoom],
    env: tuple[float, float, float, float],
    plot_area: float,
    max_cov_pct: float,
    priority_of: dict[str, int],
    essential_priority: int,
    min_dim: float = 0.0,
) -> list[str]:
    """Bring the footprint under the ground-coverage limit (1% margin) and return
    the ids dropped to do so.

    Footprint is reduced by removing the lowest-priority OPTIONAL rooms first
    (utility/entrance/dining/pooja) — never undersizing a habitable room. Only if
    nothing optional remains and the layout is still marginally over (dense, all-
    essential programs) do we apply a shrink toward the SW origin.

    On a tight ground-coverage cap (e.g. Telangana's 55 %) that residual shrink is
    the one place a habitable room can be pushed below the code-min narrowest side
    (``min_dim``). To keep code fails at zero we shrink ANISOTROPICALLY: bands run
    full-height as vertical strips, so a y-only scale leaves every band's WIDTH (and
    thus the living/bedroom min-dim side) untouched while still reducing the
    footprint. We put as much of the reduction as possible on the axis that has
    slack and clamp so no code-habitable room's narrowest side drops under
    ``min_dim``; if a single global (sx, sy) can't keep every habitable room legal
    we shed one more optional room and retry, falling back to the legacy uniform
    squeeze only when nothing optional is left (large, well-above-minimum rooms)."""
    dropped: list[str] = []
    if not placed:
        return dropped
    cap = (max_cov_pct - 1.0) / 100.0 * plot_area
    minx, miny, _, _ = env

    def footprint() -> float:
        return sum(p.area for p in placed)

    def _shrink(sx: float, sy: float) -> None:
        for p in placed:
            p.x0 = minx + (p.x0 - minx) * sx
            p.x1 = minx + (p.x1 - minx) * sx
            p.y0 = miny + (p.y0 - miny) * sy
            p.y1 = miny + (p.y1 - miny) * sy

    def _hab(p: PlacedRoom) -> bool:
        return p.type.value in _HABITABLE_TYPES

    def _aniso_factors(fac: float) -> Optional[tuple[float, float]]:
        """Pick (sx, sy) with sx*sy == fac that keeps every code-habitable room's
        narrowest side >= ``min_dim``. Prefer keeping the smaller axis (so we don't
        eat into a width that is already at the min) by loading the shrink onto the
        axis with the most habitable slack. Returns None if no global pair works."""
        if min_dim <= 0.0:
            return None
        hab = [p for p in placed if _hab(p)]
        if not hab:
            return (fac ** 0.5, fac ** 0.5)
        # smallest legal per-axis scale: any less and some habitable room's width
        # (sx) or depth (sy) drops under min_dim.
        sx_floor = max(min_dim / p.width for p in hab)
        sy_floor = max(min_dim / p.depth for p in hab)
        # Candidate (sx, sy) pairs with sx*sy == fac, in preference order: shrink
        # depth only (bands are vertical strips, so widths — the usual min-dim side —
        # stay put), then width only, then the least width-shrink that still clears
        # sx_floor with the remainder on depth.
        for sx, sy in (
            (1.0, fac),
            (fac, 1.0),
            (max(sx_floor, fac), fac / max(sx_floor, fac)),
        ):
            if (
                sx + 1e-9 >= sx_floor and sy + 1e-9 >= sy_floor
                and sx <= 1.0 + 1e-9 and sy <= 1.0 + 1e-9
            ):
                return (sx, sy)
        return None

    # 1) shed optional rooms, lowest priority first
    while footprint() > cap:
        optional = [p for p in placed if priority_of.get(p.id, 0) < essential_priority]
        if not optional:
            break
        victim = min(optional, key=lambda p: priority_of.get(p.id, 0))
        placed.remove(victim)
        dropped.append(victim.id)

    # 2) residual shrink — anisotropic + min-dim-safe; shed one more optional and
    #    retry if a legal global scale doesn't exist, else legacy uniform squeeze.
    while footprint() > cap > 0:
        fac = cap / footprint()
        factors = _aniso_factors(fac)
        if factors is not None:
            _shrink(*factors)
            break
        optional = [p for p in placed if priority_of.get(p.id, 0) < essential_priority]
        if optional:
            victim = min(optional, key=lambda p: priority_of.get(p.id, 0))
            placed.remove(victim)
            dropped.append(victim.id)
            continue
        s = fac ** 0.5  # nothing optional left: uniform squeeze (rooms well over min)
        _shrink(s, s)
        break
    return dropped


# Any leftover rectangle inside the building footprint bigger than this (m^2) is
# real floor a 10-yr architect would never ship blank: it is welded into a
# neighbour (thin drift strip) or made a labelled COURTYARD (open-to-sky
# light/ventilation court — a premium Indian feature, Vastu-positive in the
# N/NE/centre). Below it the rectangle is wall-thickness / rounding noise, ignored.
_VOID_NOISE_SQM = 0.3
# Don't weld two void slabs into one courtyard across a tiny edge mismatch.
_VOID_X_TOL = 0.05


def _footprint_voids(
    placed: list[PlacedRoom], env: tuple[float, float, float, float]
) -> list[tuple[float, float, float, float]]:
    """Rectangles INSIDE the buildable envelope that no built-up room covers.

    Rooms tile the envelope in axis-aligned bands; a tight bedroom-block band can
    stop short of the North edge (see ``VastuGridPacker._stretch_to_fill``) leaving
    an unassigned gap that renders as blank floor. We find every such gap exactly:
    split the envelope into vertical slabs at each room x-edge, find the uncovered
    y-intervals in each slab, then merge horizontally-adjacent slabs that share the
    same uncovered interval into the widest possible rectangle. Site/open rooms
    (sit-out, parking, balcony, an existing courtyard) are NOT counted as cover —
    they live in the setback margins, not the footprint — and any room already
    outside the envelope is clipped to it."""
    minx, miny, maxx, maxy = env
    builtup = [p for p in placed if p.type not in _SITE_ROOM_TYPES]
    # candidate x-edges inside the envelope (clamped + de-duplicated)
    xs = {minx, maxx}
    for p in builtup:
        for x in (p.x0, p.x1):
            if minx - 1e-9 <= x <= maxx + 1e-9:
                xs.add(min(max(x, minx), maxx))
    xe = sorted(xs)

    # per-slab uncovered y-intervals
    slabs: list[tuple[float, float, list[tuple[float, float]]]] = []
    for xa, xb in zip(xe, xe[1:]):
        if xb - xa <= _VOID_X_TOL:
            continue
        xm = 0.5 * (xa + xb)
        covered = sorted(
            (max(miny, p.y0), min(maxy, p.y1))
            for p in builtup
            if p.x0 - 1e-9 <= xm <= p.x1 + 1e-9 and p.y1 > p.y0
        )
        gaps: list[tuple[float, float]] = []
        cursor = miny
        for c0, c1 in covered:
            if c0 > cursor + 1e-6:
                gaps.append((cursor, c0))
            cursor = max(cursor, c1)
        if maxy > cursor + 1e-6:
            gaps.append((cursor, maxy))
        slabs.append((xa, xb, gaps))

    # merge horizontally-adjacent slabs sharing an (approximately) identical gap
    rects: list[tuple[float, float, float, float]] = []
    used = [set() for _ in slabs]
    for i, (xa, xb, gaps) in enumerate(slabs):
        for gi, (ga, gb) in enumerate(gaps):
            if gi in used[i]:
                continue
            x_end = xb
            j = i + 1
            while j < len(slabs) and abs(slabs[j][0] - x_end) <= _VOID_X_TOL:
                match = None
                for gj, (ha, hb) in enumerate(slabs[j][2]):
                    if gj not in used[j] and abs(ha - ga) <= 0.06 and abs(hb - gb) <= 0.06:
                        match = gj
                        break
                if match is None:
                    break
                used[j].add(match)
                x_end = slabs[j][1]
                j += 1
            rects.append((xa, ga, x_end, gb))
    # Return every gap above a small noise floor (wall thickness / rounding). The
    # caller welds thin drift strips into a neighbour and courtyards genuine voids,
    # so a thin strip need NOT clear the courtyard area threshold to be removed.
    return [r for r in rects if (r[2] - r[0]) * (r[3] - r[1]) >= _VOID_NOISE_SQM]


# A leftover rectangle this thin (m) on its short side is not a usable room — it
# is the drift strip between a band's last room and the setback line (often opened
# up by the coverage shrink). It is WELDED into the abutting room rather than made
# a courtyard, so the band simply reaches the envelope edge.
_VOID_WELD_MAX_THIN = 1.2


def _fill_footprint_voids(
    placed: list[PlacedRoom],
    env: tuple[float, float, float, float],
    floor: int = 0,
    cov_cap: float = float("inf"),
    plot_area: float = 0.0,
) -> list[PlacedRoom]:
    """Leave NO unassigned blank floor inside the envelope.

    Every leftover rectangle is handled one of two ways:
      * a THIN drift strip (short side < ``_VOID_WELD_MAX_THIN`` — e.g. the 0.3-0.7 m
        gap between a band's top room and the rear setback) is WELDED into the
        built-up room it abuts, so the band reaches the edge — but only when that
        extra built-up area stays under the ground-coverage cap (``cov_cap``);
      * otherwise (a genuine room-sized void — the interior-gap defect — or a thin
        strip the cap won't allow welding) it becomes a labelled COURTYARD: a
        virtual/open room type (not code-habitable, not FAR built-up, see
        ``classification.virtualRoomTypes``) so it never trips a min-area/dim code
        fail or the coverage cap, rendering + labelling as a Vastu-positive
        open-to-sky court.
    Mutates ``placed`` (welds existing rooms / appends courtyards) and returns the
    courtyards added."""
    added: list[PlacedRoom] = []
    suffix = "" if floor == 0 else f"_f{floor}"
    builtup = [p for p in placed if p.type not in _SITE_ROOM_TYPES]
    k = 0
    # Largest first: handle big interior gaps before the thin edge strips.
    for (x0, y0, x1, y1) in sorted(
        _footprint_voids(placed, env), key=lambda r: -(r[2] - r[0]) * (r[3] - r[1])
    ):
        short = min(x1 - x0, y1 - y0)
        # A thin drift strip is preferentially WELDED into the room it abuts — BUT
        # welding adds built-up area, so it is only safe when it won't push the
        # footprint over the ground-coverage cap. We try the weld and roll it back if
        # it would violate coverage; otherwise (and for every gap a single room can't
        # span) we drop in a COURTYARD, which is virtual and never counts toward
        # coverage. Either way no blank floor is left inside the envelope.
        if short < _VOID_WELD_MAX_THIN and _weld_strip(
            builtup, x0, y0, x1, y1, cov_cap=cov_cap, plot_area=plot_area
        ):
            continue
        rid = f"courtyard{suffix}" if k == 0 else f"courtyard{k + 1}{suffix}"
        court = PlacedRoom(rid, RoomType.courtyard, x0, y0, x1, y1, 3.0, floor)
        placed.append(court)
        added.append(court)
        k += 1
    return added


def _weld_strip(
    builtup: list[PlacedRoom],
    x0: float, y0: float, x1: float, y1: float,
    cov_cap: float = float("inf"),
    plot_area: float = 0.0,
) -> bool:
    """Grow a built-up room to swallow a thin leftover strip [x0,y0,x1,y1].

    To stay overlap-free the welded room must span the strip's WHOLE long edge
    (then extending that one wall to the strip's far edge fills the strip exactly and
    abuts no other room across it). The weld is REJECTED if the strip's area would
    push the total built-up footprint over the ground-coverage cap (``cov_cap``) —
    on a coverage-bound plot the gap is the cap eating into the footprint, so it must
    become a (virtual) courtyard, not extra built-up area. A strip narrower than the
    room it abuts is left for the courtyard path. Returns True if a room absorbed
    it."""
    strip_area = (x1 - x0) * (y1 - y0)
    builtup_now = sum(p.area for p in builtup)
    if builtup_now + strip_area > cov_cap + 1e-6:
        return False  # welding would breach ground coverage — courtyard it instead
    horizontal = (x1 - x0) >= (y1 - y0)  # strip runs E-W -> weld a N/S neighbour
    for p in builtup:
        if horizontal:
            spans = p.x0 <= x0 + 0.06 and p.x1 >= x1 - 0.06
            if not spans:
                continue
            if abs(p.y1 - y0) < 0.06:      # room sits directly BELOW the strip
                p.y1 = max(p.y1, y1)
                return True
            if abs(p.y0 - y1) < 0.06:      # room sits directly ABOVE the strip
                p.y0 = min(p.y0, y0)
                return True
        else:
            spans = p.y0 <= y0 + 0.06 and p.y1 >= y1 - 0.06
            if not spans:
                continue
            if abs(p.x1 - x0) < 0.06:      # room sits directly to the WEST
                p.x1 = max(p.x1, x1)
                return True
            if abs(p.x0 - x1) < 0.06:      # room sits directly to the EAST
                p.x0 = min(p.x0, x0)
                return True
    return False


@dataclass
class _Candidate:
    plan: Plan
    vastu: object
    code: object
    dropped: list[str]
    score_key: tuple


def _score_candidate(plan: Plan) -> tuple[Plan, object, object]:
    plan, _ = normalize(plan)
    vastu = check_vastu(plan, get_vastu_rules())
    code = check_code(plan, get_code_rules())
    return plan, vastu, code


def _rects_share_edge(
    a: PlacedRoom, b: PlacedRoom, tol: float = 0.12, min_run: float = 0.5
) -> bool:
    """True if rectangles a and b abut along a shared wall (with real overlap)."""
    y_ov = min(a.y1, b.y1) - max(a.y0, b.y0)
    x_ov = min(a.x1, b.x1) - max(a.x0, b.x0)
    if y_ov > min_run and (abs(a.x1 - b.x0) < tol or abs(b.x1 - a.x0) < tol):
        return True
    if x_ov > min_run and (abs(a.y1 - b.y0) < tol or abs(b.y1 - a.y0) < tol):
        return True
    return False


def _kitchen_dining_adjacent(placed: list[PlacedRoom]) -> bool:
    """A 10-yr architect always abuts the dining to the kitchen (you serve from one
    to the other). True if every dining shares a wall with a kitchen on its floor —
    or the plan has no dining/kitchen to relate."""
    by_floor: dict[int, list[PlacedRoom]] = {}
    for p in placed:
        by_floor.setdefault(p.floor, []).append(p)
    for rooms in by_floor.values():
        kitchens = [p for p in rooms if p.type.value == "kitchen"]
        dinings = [p for p in rooms if p.type.value == "dining"]
        if not dinings or not kitchens:
            continue
        if not all(any(_rects_share_edge(d, k) for k in kitchens) for d in dinings):
            return False
    return True


_HABITABLE_TYPES = {"living", "master_bedroom", "bedroom", "childrens_bedroom", "study"}

# Above this bounding-box aspect a habitable room reads as a RIBBON (a 2.6 m-wide
# corridor that can't take a bed + wardrobe + circulation, or a bowling-alley
# "big living"). A practising architect keeps living/bedroom proportions roughly
# in [1 : 1.9]; past that the room is unusable however large its area.
_ASPECT_MAX = 1.9


def _room_aspect(p: PlacedRoom) -> float:
    w, h = p.width, p.depth
    if min(w, h) <= 1e-6:
        return 1.0
    return max(w, h) / min(w, h)


def _aspect_bad(placed: list[PlacedRoom]) -> int:
    """Count of HABITABLE rooms (living + every bedroom + study) whose bounding-box
    aspect — max(w, h) / min(w, h) — exceeds ``_ASPECT_MAX``. A ranking term: a
    layout that gives the family rooms workable proportions beats one that packs
    the same area into ribbons. Ranks above Vastu / living-centre but below the
    hard code + kitchen-dining invariants."""
    return sum(
        1 for p in placed
        if p.type.value in _HABITABLE_TYPES and _room_aspect(p) > _ASPECT_MAX
    )


def _worst_aspect(placed: list[PlacedRoom]) -> float:
    """Worst habitable-room aspect on a layout (rounded), used as a FINER ranking
    term right after ``_aspect_bad``: when two layouts tie on the ribbon COUNT,
    prefer the one whose worst room is less elongated (a 2.2 master beats a 3.0
    bowling-alley living). Keeps the optimiser pushing toward squarer rooms even
    when it can't get every room under the threshold on a tight plot."""
    return round(
        max((_room_aspect(p) for p in placed if p.type.value in _HABITABLE_TYPES), default=1.0),
        2,
    )


def _living_in_center(plan: Plan) -> int:
    """Count of HABITABLE rooms (living + every bedroom) whose centroid lands in the
    Brahmasthan (CENTER). A hall — or a bedroom — in the dead-centre is a Vastu
    defect (and reads as a room with no exterior wall), so the ranker prefers an
    otherwise-equal layout that keeps the living on a compass edge (the big hall to
    the front, E/NE) and the master/bedrooms on their sectors (SW/W/...), leaving the
    Brahmasthan open for circulation. The living is weighted double so the front-hall
    intent still dominates when a layout must choose which room sits centre-most."""
    n = 0
    for r in plan.rooms:
        if r.zone is None or r.zone.value != "CENTER":
            continue
        if r.type.value == "living":
            n += 2
        elif r.type.value in _HABITABLE_TYPES:
            n += 1
    return n


def _living_not_largest(placed: list[PlacedRoom]) -> int:
    """Soft score: count of floors whose largest habitable room is NOT the living.
    0 when every floor that has a living makes it the biggest habitable room. Floors
    without a living don't count. This is only a LAST-RESORT tiebreaker — the living
    is sized large by its target and kept off the centre/front by `_living_in_center`,
    but it must NOT be forced to be the single largest room when that would shove it
    into the Brahmasthan on a narrow plot. So it sits at the very end of the key."""
    by_floor: dict[int, list[PlacedRoom]] = {}
    for p in placed:
        if p.type.value in _HABITABLE_TYPES:
            by_floor.setdefault(p.floor, []).append(p)
    bad = 0
    for rooms in by_floor.values():
        if not any(p.type.value == "living" for p in rooms):
            continue
        biggest = max(rooms, key=lambda p: p.area)
        if biggest.type.value != "living":
            bad += 1
    return bad


# Band-proportion variants the optimiser sweeps (West, Centre, East fractions).
# Spread from balanced to West-heavy: a wider West band lets a tight 3BHK fit all
# three bedrooms; a narrower East band pushes the SE/NE corner rooms (kitchen,
# pooja) firmly into their ideal sectors on deep, narrow plots.
_BAND_VARIANTS = [
    (0.40, 0.20, 0.40),
    (0.42, 0.18, 0.40),
    (0.44, 0.16, 0.40),
    (0.46, 0.16, 0.38),
    (0.46, 0.21, 0.33),
    (0.48, 0.19, 0.33),
    (0.48, 0.22, 0.30),
    (0.50, 0.14, 0.36),
    (0.52, 0.14, 0.34),
    (0.54, 0.12, 0.34),
    (0.38, 0.16, 0.46),
]

# Two-band (force_two_band) fraction variants for NARROW plots. The centre is set
# to ~0 (the service spine folds into the sides), giving two WIDE bands (~3.5-4.8 m)
# instead of three thin ones. A full-depth room in a ~3.8 m band is ~3.8 x 5
# (aspect ~1.3) rather than a 2.6 m ribbon. The WEST-heavy entries (0.60+) make the
# West band hold the guest + dining comfortably and push the East band's living far
# enough East that its centroid clears the centre third (so the hall reads E/NE, not
# a CENTER Brahmasthan). Balanced entries help the upper floor (master + bedroom
# West, living + stair East). Sorted West-heavy first so a good-proportioned,
# front-living candidate is found early.
_TWO_BAND_VARIANTS = [
    (0.62, 0.0, 0.38),
    (0.60, 0.0, 0.40),
    (0.58, 0.0, 0.42),
    (0.56, 0.0, 0.44),
    (0.54, 0.0, 0.46),
    (0.50, 0.0, 0.50),
    (0.46, 0.0, 0.54),
    (0.40, 0.0, 0.60),
]


# --------------------------------------------------------------------------- #
# Multi-floor (G+1 / G+2): ground = social core, upper = family living + bedrooms
# --------------------------------------------------------------------------- #
def _build_swap_sets(program: list[ProgramRoom]) -> list[Optional[dict[str, int]]]:
    """Column-override variants the optimiser sweeps for a program: push the
    common toilet to the centre spine and spread secondary bedrooms across the
    side bands so the bedroom+bath blocks fit."""
    have = {r.id for r in program}
    swaps: list[Optional[dict[str, int]]] = [None]
    toilets = [t for t in ("toilet_common", "toilet1", "u_toilet_common") if t in have]
    base = {t: 1 for t in toilets}
    if base:
        swaps.append(dict(base))
    sec = [b for b in ("u_kids", "u_bedroom2", "u_bedroom3", "kids", "bedroom2", "bedroom3") if b in have]
    if sec:
        swaps.append({**base, sec[0]: 2})
        if len(sec) >= 2:
            swaps.append({**base, sec[0]: 2, sec[1]: 2})
    # Dining belongs against the kitchen on the East working side; optionally push
    # the pooja West so the East band fits kitchen + dining + living together.
    if "dining" in have:
        swaps.append({**base, "dining": 2})
        if "pooja" in have:
            swaps.append({**base, "dining": 2, "pooja": 0})
    return swaps


def _ground_program(
    env_w, env_d, min_habitable, min_kitchen, min_toilet, vastu, variant=None, guest_bedrooms=0,
) -> list[ProgramRoom]:
    """Ground floor of a G+1/G+2: the social + service core PLUS (from 3BHK) one
    ensuite GUEST / PARENTS bedroom — the Indian convention so elders/guests avoid
    the stairs. Keeping a bedroom down also absorbs the ground-floor slack so the
    living stays the largest room instead of the dining ballooning. ``variant``
    shifts the social core (open vs. formal dining, pooja room vs. none, sit-out)."""
    env_area = env_w * env_d

    def z(rt: str) -> list[str]:
        return ideal_zone_for(rt, vastu)

    merge_dining = bool(variant and variant.merge_dining)
    living_target = max(_COMFORT["living"], min_habitable * 1.7)
    if variant and (merge_dining or variant.big_social):
        living_target += _COMFORT["dining"] * (1.0 if merge_dining else 0.5)
        if variant.big_social:
            living_target += 4.0
    pooja_mode = variant.pooja_mode if variant else "auto"
    bath_min = max(_BATH_AREA_MIN, min_toilet * 1.6)

    prog: list[ProgramRoom] = [
        # The ground hall is the home's centrepiece and the architect anchors it at
        # the FRONT (E/NE for an East plot). Its area floor is kept modest here on
        # purpose: on the narrow 30x40 G+1 the front living and the pooja both want
        # the NE/N corner, so pushing the living past ~13.5 m² exiles the pooja out
        # of its NE/N/E sector (a Vastu defect the tests lock). The hall still reads
        # large via the UPPER family living (~20-24 m²); the ground hall stays front
        # and lets the pooja keep its corner. (Owner R3: large + front beats largest.)
        ProgramRoom("living", RoomType.living, living_target,
                    z("living"), 9, min_area_floor=max(12.0, min_habitable + 2.0)),
        ProgramRoom("kitchen", RoomType.kitchen, max(_COMFORT["kitchen"], min_kitchen * 1.5),
                    z("kitchen"), 9, min_area_floor=max(7.0, min_kitchen + 1.5)),
    ]
    # Guest / parents bedroom on the ground floor (ensuite), 3BHK+ only.
    sec_bed_min = max(11.0, min_habitable)
    for gi in range(max(0, int(guest_bedrooms))):
        rid = "guest" if gi == 0 else f"guest{gi + 1}"
        prog.append(
            ProgramRoom(rid, RoomType.bedroom, sec_bed_min + bath_min,
                        z("bedroom"), 9, attach_bath=True, bath_min_sqm=bath_min,
                        bedroom_min_sqm=sec_bed_min, bath_id=f"toilet_{rid}")
        )
    if not merge_dining:
        prog.append(ProgramRoom("dining", RoomType.dining, max(_COMFORT["dining"], min_habitable * 0.9),
                                z("dining"), 7, min_area_floor=9.0))
    if pooja_mode != "none":
        prog.append(ProgramRoom("pooja", RoomType.pooja, max(_COMFORT["pooja_room"], 1.8), z("pooja"), 5))
    # Owner brief: NO standalone common WC — every toilet is an attached bath on a
    # bedroom. The ensuite guest/parents bedroom (3BHK+) sits by the entry and
    # serves ground-floor guests. Only fall back to a common WC when this floor has
    # no bedroom at all (e.g. a manually forced 2BHK G+1).
    if int(guest_bedrooms) <= 0:
        prog.append(ProgramRoom("toilet_common", RoomType.toilet, max(_COMFORT["common_toilet"], min_toilet * 1.6),
                                z("toilet"), 7))
    prog.append(ProgramRoom("stair", RoomType.staircase, max(0.05 * env_area, 3.4), z("staircase"), 6))
    prog.append(ProgramRoom("entrance", RoomType.entrance, max(_COMFORT["entrance"], 2.2), z("entrance"), 4))
    if variant and variant.sitout:
        prog.append(ProgramRoom("sitout", RoomType.sitout, max(_COMFORT.get("sitout", 6.0), 5.0),
                                ["N", "E", "NE"], priority=3))
    return prog


def _upper_program(tier, env_w, env_d, min_habitable, min_toilet, vastu, variant=None, ground_bedrooms=0) -> list[ProgramRoom]:
    """Upper floor: a family LIVING area + the master and remaining bedrooms (each
    its own attached bath) + a common toilet + the stair. No kitchen/dining/pooja
    upstairs. ``ground_bedrooms`` are the bedrooms already placed downstairs, so
    the upper floor holds the master + (bedrooms - 1 - ground_bedrooms) others."""
    env_area = env_w * env_d

    def z(rt: str) -> list[str]:
        return ideal_zone_for(rt, vastu)

    bedrooms = _TIER_BEDROOMS[tier]
    upper_bedrooms = max(1, bedrooms - max(0, int(ground_bedrooms)))  # master always upstairs
    bath_min = max(_BATH_AREA_MIN, min_toilet * 1.6)
    master_bath_min = max(4.5, bath_min)
    tight = bedrooms >= 3
    master_bed_min = max(13.0 if tight else 14.0, min_habitable * 1.25)
    sec_bed_min = max(11.0, min_habitable)
    u_living_target = max(_COMFORT["living"] * 0.8, min_habitable * 1.4)
    if variant and variant.big_social:
        u_living_target += 4.0

    # Target the bedrooms a step above their minimum so they read as proper rooms
    # (master 16-18, others 12-14) and claim band width rather than ceding it all to
    # the upper living — the bedrooms are what the user asked to be large.
    prog: list[ProgramRoom] = [
        ProgramRoom("u_living", RoomType.living, u_living_target,
                    z("living"), 8, min_area_floor=max(11.0, min_habitable)),
        ProgramRoom("u_master", RoomType.master_bedroom, master_bed_min * 1.25 + master_bath_min,
                    z("master_bedroom"), 10, attach_bath=True, bath_min_sqm=master_bath_min,
                    bedroom_min_sqm=master_bed_min, bath_id="toilet_u_master"),
    ]
    sec_specs = [("u_kids", RoomType.childrens_bedroom, "childrens_bedroom")]
    for i in range(2, upper_bedrooms):
        sec_specs.append((f"u_bedroom{i}", RoomType.bedroom, "bedroom"))
    for rid, rtype, zkey in sec_specs[: upper_bedrooms - 1]:
        prog.append(
            ProgramRoom(rid, rtype, sec_bed_min * 1.2 + bath_min, z(zkey), 7,
                        attach_bath=True, bath_min_sqm=bath_min,
                        bedroom_min_sqm=sec_bed_min, bath_id=f"toilet_{rid}")
        )
    # Owner brief: no common WC upstairs either — the master and every bedroom are
    # ensuite, and the upper family living uses the nearest bedroom's attached bath.
    prog.append(
        ProgramRoom("u_stair", RoomType.staircase, max(0.05 * env_area, 3.4), z("staircase"), 6)
    )
    return prog


def _layout_floor(
    program, program_by_id, env, keepout, plot, min_dim, min_habitable,
    min_area_by_type, plot_area, max_cov, stair_col=0,
) -> tuple[list[PlacedRoom], list[str]]:
    """Optimise ONE floor's program (band sweep + swaps) and return the best placed
    rooms + dropped ids. The stair is pinned to ``stair_col`` so it sits in the
    same band on every floor (approximate vertical stacking)."""
    ESS = 5
    prio = {r.id: r.priority for r in program}
    for r in program:
        if r.attach_bath and r.bath_id:
            prio[r.bath_id] = max(ESS, r.priority)
    # Pin the stair AND the common toilet to the same band on every floor so the
    # centre spine survives (≥2 rooms) and the staircase stays narrow + roughly
    # vertically aligned across floors.
    # Pin the stair + common toilet to the central service band on every floor so
    # the stair stays narrow and roughly stacked; fill_center then packs that band
    # solid (no open-Brahmasthan corridor / void).
    pins = {
        r.id: stair_col
        for r in program
        if r.type.value == "staircase" or r.id in ("toilet_common", "u_toilet_common")
    }
    # Sweep the 3-band layouts, and ALSO a 2-band (force_two_band) collapse — but
    # only on the private UPPER floor (no kitchen). On a narrow plot the 3-band split
    # makes side bands ~2.6 m wide, so a full-depth room becomes a 3:1 ribbon; folding
    # the centre spine into two ~3.8 m side bands lets the master + a bedroom share
    # one band and the living + stair the other, each ~3.8 x 5 (aspect ~1.3).
    #
    # The social GROUND / single floor keeps the 3-band sweep so the kitchen stays
    # SE, the pooja NE/N and the stair on the central service spine (a 2-band collapse
    # there shoves the pooja to NW and the dining to CENTER — Vastu losses the ruleset
    # and tests forbid). Its lone guest/parents bedroom is squared instead by the
    # bedroom-block area cap PLUS leaving the freed band depth as front circulation
    # rather than re-inflating the bedroom to a ribbon (see ``_stack_column``).
    env_w = env[2] - env[0]
    has_kitchen = any(r.type.value == "kitchen" for r in program)
    two_band_first = env_w < 9.0 and not has_kitchen
    best: Optional[tuple] = None
    for two_band in ((False, True) if two_band_first else (False,)):
        band_set = _TWO_BAND_VARIANTS if two_band else _BAND_VARIANTS
        for bands in band_set:
            for base in _build_swap_sets(program):
                overrides = dict(pins, **(base or {}))
                packer = VastuGridPacker(
                    env, min_dim, min_habitable, min_area_by_type, keepout,
                    band_fracs=bands, col_overrides=overrides, fill_center=True,
                    force_two_band=two_band,
                )
                result = packer.pack(program)
                if not result.placed:
                    continue
                result.placed[:] = _carve_attached_baths(result.placed, program_by_id, plot, min_dim)
                cov_dropped = _enforce_coverage(result.placed, env, plot_area, max_cov, prio, ESS, min_dim)
                # Any leftover band space inside the footprint becomes a labelled
                # courtyard (or is welded into a neighbour where coverage allows) so
                # the floor never renders a blank gap; the courtyard is virtual, so it
                # never affects code/coverage.
                _fill_footprint_voids(
                    result.placed, env, cov_cap=(max_cov - 1.0) / 100.0 * plot_area,
                    plot_area=plot_area,
                )
                try:
                    _assert_no_overlap(result.placed)
                    _assert_inside(result.placed, env)
                except AssertionError:
                    continue
                all_dropped = result.dropped + cov_dropped
                ess_drop = sum(1 for d in all_dropped if prio.get(d, 0) >= ESS)
                plan, vastu, code = _score_candidate(_build_plan(list(result.placed), plot, env, "floor"))
                kd_bad = 0 if _kitchen_dining_adjacent(result.placed) else 1
                aspect_bad = _aspect_bad(result.placed)
                worst_asp = _worst_aspect(result.placed)
                liv_center = _living_in_center(plan)
                liv_not_largest = _living_not_largest(result.placed)
                # Ladder (best = smallest): no essential drop, then no code fail, then
                # kitchen-dining adjacent, then good room PROPORTIONS (ribbon COUNT),
                # then keep the hall OFF the Brahmasthan centre (front hall, E/NE),
                # then highest Vastu, then the worst single aspect as a FINE squareness
                # tie-break (placed below Vastu so a marginally squarer layout never
                # displaces the pooja/stair from their sectors), then fewest drops;
                # "living is largest" is only a last-resort tiebreaker.
                key = (ess_drop, code.summary.fail_count, kd_bad, aspect_bad, liv_center,
                       -round(vastu.score), worst_asp, len(all_dropped), liv_not_largest)
                if best is None or key < best[0]:
                    best = (key, list(result.placed), all_dropped)
    if best is None:
        return [], [r.id for r in program]
    return best[1], best[2]


def _generate_multifloor(
    bhk, plot, floors, tier, footprint, env, keepout, plot_area, max_cov,
    min_dim, min_habitable, min_kitchen, min_toilet, min_area_by_type,
    vastu_rules, project_name, variant=None, edits=None,
) -> tuple[Plan, object, object, dict]:
    """G+1 / G+2: a social ground floor + an upper floor of family living and
    ensuite bedrooms, each room tagged with its ``floor``. The bhk is honoured
    even on plots a single floor would right-size down (bedrooms move upstairs).
    ``edits`` (single-prompt refinements) fold in per floor: resize/move/remove
    hit whichever floor owns the room, while ADDED rooms route to the social floor
    (dining/pooja/sit-out/store) or the private floor (study/dressing/balcony)."""
    env_w, env_d = env[2] - env[0], env[3] - env[1]
    # 3BHK keeps one ensuite bedroom downstairs (parents/guest); 2BHK puts both up.
    # A 4BHK keeps TWO downstairs: on a narrow plot, cramming master + 3 bedrooms +
    # a hall onto one upper floor forces tiny, elongated rooms off their Vastu zones
    # (the old E-facing 4BHK G+1 scored ~65 with a 3.7 aspect ratio). Splitting the
    # bedrooms 2-and-2 across the floors gives each room its proper size and sector —
    # the call a practising architect makes — and lifts the 4BHK Vastu to ~94.
    ground_bedrooms = 2 if _TIER_BEDROOMS[tier] >= 4 else (1 if _TIER_BEDROOMS[tier] >= 3 else 0)
    ground = _ground_program(env_w, env_d, min_habitable, min_kitchen, min_toilet, vastu_rules, variant, guest_bedrooms=ground_bedrooms)
    upper = _upper_program(tier, env_w, env_d, min_habitable, min_toilet, vastu_rules, variant, ground_bedrooms=ground_bedrooms)

    # Fold single-prompt edits into both floors (matching by id/type means a resize
    # or move only touches the floor that owns the room); split ADDs by social vs.
    # private so a "add a study" lands upstairs and "add a dining" lands downstairs.
    if edits is not None and not edits.is_empty():
        zfn = lambda rt: ideal_zone_for(rt, vastu_rules)  # noqa: E731
        g_edits = EditOverrides(
            area_scale=edits.area_scale, zones=edits.zones, remove=edits.remove,
            ventilation_boost=edits.ventilation_boost,
            add={k for k in edits.add if k in _GROUND_ADD},
        )
        u_edits = EditOverrides(
            area_scale=edits.area_scale, zones=edits.zones, remove=edits.remove,
            ventilation_boost=edits.ventilation_boost,
            add={k for k in edits.add if k not in _GROUND_ADD},
        )
        ground = _apply_edits(ground, g_edits, zfn)
        upper = _apply_edits(upper, u_edits, zfn)

    g_placed, g_drop = _layout_floor(
        ground, {r.id: r for r in ground}, env, keepout, plot, min_dim,
        min_habitable, min_area_by_type, plot_area, max_cov, stair_col=1,
    )
    u_placed, u_drop = _layout_floor(
        upper, {r.id: r for r in upper}, env, keepout, plot, min_dim,
        min_habitable, min_area_by_type, plot_area, max_cov, stair_col=1,
    )
    if not g_placed or not u_placed:
        raise ValueError("could not lay out a multi-floor plan for the given brief")

    for p in g_placed:
        p.floor = 0
    for p in u_placed:
        p.floor = 1
        # courtyard ids are minted per-floor as "courtyard"; suffix the upper one so
        # ground + upper voids never collide on room / opening ids.
        if p.type == RoomType.courtyard and not p.id.endswith("_f1"):
            p.id = f"{p.id}_f1"
    placed = list(g_placed) + list(u_placed)
    for extra in range(2, floors):  # G+2+: repeat the upper layout one level up
        for p in u_placed:
            placed.append(PlacedRoom(f"{p.id}_f{extra}", p.type, p.x0, p.y0, p.x1, p.y1, p.ceiling_height_m, extra))

    def _is_bed_drop(d: str) -> bool:
        return ("toilet" not in d and "stair" not in d and "living" not in d
                and (d.startswith("u_") or d.startswith("guest")))

    bedroom_drops = [d for d in (u_drop + g_drop) if _is_bed_drop(d)]
    mf_downscaled = bool(bedroom_drops)
    bedrooms = _TIER_BEDROOMS[tier]
    ground_bed_txt = (
        " with one ensuite bedroom (parents/guest) kept downstairs so elders avoid "
        "the stairs" if ground_bedrooms else ""
    )
    note = (
        f"Generated G+{floors - 1}: ground floor is the social core "
        f"(living / kitchen / dining / pooja){ground_bed_txt}; upper floor"
        f"{'s' if floors > 2 else ''} hold the master + remaining bedrooms, each with "
        f"an attached bath ({bedrooms - len(bedroom_drops)} of {bedrooms} bedrooms placed)."
    )
    if mf_downscaled:
        note += f" Could not fit {len(bedroom_drops)} of the requested bedrooms."

    name = project_name or (
        f"Generated {tier} G+{floors - 1} — {plot.facing.value}-facing ({plot.state.value})"
    )
    plan = _build_plan(placed, plot, env, name, edits)
    site_meta = _add_site_utilization(plan, env, cars=(edits.parking_cars if edits else None))
    plan, vastu, code = _score_candidate(plan)
    cov_ratio = round(min(1.0, sum(p.area for p in g_placed) / footprint), 2) if footprint else 0.0
    meta = {
        "vastuScore": vastu.score, "vastuGrade": vastu.grade,
        "codeFails": code.summary.fail_count, "droppedRooms": g_drop + u_drop,
        "attempts": 0, "tier": tier, "requestedBhk": max(1, min(4, int(bhk))),
        "downscaled": mf_downscaled, "note": note,
        "footprintSqm": round(footprint, 1), "floorsGenerated": floors,
        "coverageRatio": cov_ratio,
        **site_meta,
    }
    return plan, vastu, code, meta


def generate_plan(
    bhk: int,
    plot: Plot,
    floors: int = 1,
    vastu_priority: bool = True,
    project_name: Optional[str] = None,
    code_rules: Optional[CodeRules] = None,
    vastu_rules: Optional[VastuRules] = None,
    variant: Optional["VariantProfile"] = None,
    edits: Optional["EditOverrides"] = None,
) -> tuple[Plan, object, object, dict]:
    """Deterministically generate a Vastu-aware plan for the brief.

    Returns ``(plan, vastu_report, code_report, meta)`` where ``meta`` carries
    ``{vastuScore, vastuGrade, codeFails, droppedRooms, attempts, tier,
    requestedBhk, downscaled, note}``. The plan is already normalised. ``edits``
    (from a single-prompt refinement) folds add/remove/resize/move deltas into the
    program before the optimiser runs, so a refined plan is always valid. Raises
    ``ValueError`` for genuinely infeasible input (handled as HTTP 422 by the
    router)."""
    code_rules = code_rules or get_code_rules()
    vastu_rules = vastu_rules or get_vastu_rules()

    if bhk < 1 or bhk > 4:
        raise ValueError("bhk must be between 1 and 4")

    env, keepout = _envelope_and_keepout(plot, code_rules)
    minx, miny, maxx, maxy = env
    env_w, env_d = maxx - minx, maxy - miny
    if env_w < 2.0 or env_d < 2.0:
        raise ValueError(
            f"buildable envelope {round(env_w,2)}x{round(env_d,2)} m is too small after setbacks"
        )

    st = code_rules.state(plot.state.value)
    cls = code_rules.classification()
    min_habitable = float(st["minHabitableRoomSqm"])
    min_dim = float(st["minRoomDimM"])
    min_kitchen = float(st.get("minKitchenSqm", 5.0))
    min_toilet = float(st.get("minWCSqm", 1.1))
    min_area_by_type = dict(cls.get("minAreaByRoomType", {}))
    plot_area = plot.width_m * plot.depth_m
    max_cov = float(st.get("maxGroundCoveragePct", 65.0))

    # --- RIGHT-SIZING: map the buildable footprint to the largest sensible tier,
    # then reconcile with the requested bhk (downscale if it doesn't fit). ---
    footprint = buildable_footprint_sqm(plot, code_rules)
    effective_tier, requested_tier, downscaled, tier_note = resolve_tier(bhk, footprint)
    effective_bhk = _TIER_BEDROOMS[effective_tier]

    # --- AUTO-STOREY: a practising architect builds UP rather than dropping a
    # bedroom. When the brief didn't ask for G+1 but a single floor right-sizes the
    # requested bhk DOWN (footprint too small), and the envelope can stack, promote
    # to G+1 so all bedrooms are kept (social core down, bedrooms up). Falls back to
    # the single floor if a multi-floor layout genuinely can't be placed. ---
    # Promote 3BHK+ that won't fit one floor (a 2BHK comfortably fits a single
    # storey on a typical plot, so it is never auto-promoted — ask for floors=2).
    can_stack = env_w >= 2.0 * min_dim and env_d >= 2.0 * min_dim
    auto_storey = floors < 2 and downscaled and bhk >= 3 and can_stack
    if auto_storey:
        floors = 2
        plot = plot.model_copy(update={"floors": 2})
    auto_note = (
        f"Promoted to G+1: a single floor right-sizes the requested {requested_tier} "
        f"down to {effective_tier} on this {round(footprint, 1)} m² footprint, so "
        f"the design goes up a storey to keep all {bhk} bedrooms — the call a "
        f"practising architect would make."
    ) if auto_storey else None

    program = build_program(
        effective_bhk, floors, env_w, env_d, min_habitable, min_kitchen, min_toilet,
        vastu_rules, tier=effective_tier, footprint=footprint, variant=variant, edits=edits,
    )
    program_by_id = {r.id: r for r in program}

    name = project_name or (
        f"Generated {effective_tier} — {plot.facing.value}-facing ({plot.state.value})"
    )

    # --- MULTI-FLOOR (G+1/G+2): a social ground floor + upper floor(s) of family
    # living and ensuite bedrooms. Bedrooms move upstairs, so the requested bhk is
    # honoured even on plots a single floor would right-size down.
    if floors >= 2 and can_stack:
        try:
            plan, vastu, code, meta = _generate_multifloor(
                bhk, plot, floors, requested_tier, footprint, env, keepout, plot_area,
                max_cov, min_dim, min_habitable, min_kitchen, min_toilet,
                min_area_by_type, vastu_rules, project_name, variant, edits,
            )
        except ValueError:
            if not auto_storey:
                raise  # an explicit G+1 brief that genuinely can't be laid out
            floors = 1  # auto-promotion didn't pan out: stay on a single floor
            plot = plot.model_copy(update={"floors": 1})
        else:
            if auto_note:
                meta["note"] = f"{auto_note} {meta.get('note', '')}".strip()
                meta["autoStorey"] = True
            return plan, vastu, code, meta

    # --- STUDIO: bespoke single-room layout (band packer would slice it too thin).
    if effective_tier == "STUDIO":
        bath_min = max(_BATH_AREA_MIN, min_toilet * 1.6)
        best_studio: Optional[_Candidate] = None
        s_attempts = 0
        for placed in _studio_layouts(env, min_dim, min_kitchen, bath_min):
            s_attempts += 1
            _enforce_coverage(placed, env, plot_area, max_cov, {p.id: 10 for p in placed}, 5)
            _assert_no_overlap(placed)
            _assert_inside(placed, env)
            plan = _build_plan(placed, plot, env, name, edits)
            plan, vastu, code = _score_candidate(plan)
            key = (code.summary.fail_count, -round(vastu.score))
            if best_studio is None or key < best_studio.score_key:
                best_studio = _Candidate(plan=plan, vastu=vastu, code=code, dropped=[], score_key=key)
        assert best_studio is not None
        site_meta = _add_site_utilization(best_studio.plan, env, cars=(edits.parking_cars if edits else None))
        plan, vastu, code = _score_candidate(best_studio.plan)
        meta = {
            "vastuScore": vastu.score, "vastuGrade": vastu.grade,
            "codeFails": code.summary.fail_count, "droppedRooms": [],
            "attempts": s_attempts, "tier": effective_tier,
            "requestedBhk": max(1, min(4, int(bhk))), "downscaled": downscaled,
            "note": tier_note, "footprintSqm": round(footprint, 1),
            **site_meta,
        }
        return plan, vastu, code, meta

    # Optimisation: sweep band proportions (+ a couple of zone swaps) and keep the
    # plan with the fewest dropped rooms, then code fails, then highest Vastu.
    candidates: list[_Candidate] = []
    attempts = 0

    have = {r.id for r in program}
    bhk_attaches = any(r.attach_bath for r in program)  # 2BHK+ ensuite carve in play
    swap_sets: list[Optional[dict[str, int]]] = [None]
    # swap: dining joins the East working side (kitchen/living) to free a West
    # slot for the bedrooms — helps 3BHK meet habitable minimums.
    if "dining" in have:
        swap_sets.append({"dining": 2})
        if "pooja" in have:
            swap_sets.append({"dining": 2, "pooja": 0})
    # swap: utility into the centre service spine (frees a West slot).
    if "utility" in have:
        swap_sets.append({"utility": 1})
    # swap: both, for the tightest programs.
    if "dining" in have and "utility" in have:
        swap_sets.append({"dining": 2, "utility": 1})
    # swap: send the COMMON/powder toilet to the centre spine so the West band is
    # left entirely for sleeping rooms — the key to fitting all bedroom+bath blocks
    # in a 3/4BHK. (The per-bedroom baths are carved from the bedrooms themselves,
    # not packed separately, so only the standalone toilets are reassignable.)
    standalone_toilets = [tid for tid in ("toilet_common", "toilet1") if tid in have]
    base_to: dict[str, int] = {}
    if standalone_toilets:
        base_to = {tid: 1 for tid in standalone_toilets}
        swap_sets.append(dict(base_to))
        if "dining" in have:
            swap_sets.append({**base_to, "dining": 2})
            if "utility" in have:
                swap_sets.append({**base_to, "dining": 2, "utility": 1})

    # Bedroom DISTRIBUTION variants — bedroom+bath blocks are bulky, so on a 3/4BHK
    # a single narrow West band can't stack them all. Spread the secondary bedrooms
    # across the West and East side bands (E is an acceptable Vastu zone for a
    # bedroom / children's room) while the master holds the SW. The optimiser keeps
    # whichever distribution scores best and drops no essential room.
    sec_beds = [bid for bid in ("kids", "bedroom2", "bedroom3") if bid in have]
    if len(sec_beds) >= 1 and bhk_attaches:
        # push one secondary bedroom East (frees the West band for master + another)
        swap_sets.append({sec_beds[0]: 2})
        swap_sets.append({**base_to, sec_beds[0]: 2})
        if "dining" in have:
            swap_sets.append({**base_to, sec_beds[0]: 2, "dining": 1})
        if len(sec_beds) >= 2:
            # master+one West, two secondaries East (4BHK / tight 3BHK)
            swap_sets.append({sec_beds[0]: 2, sec_beds[1]: 2})
            swap_sets.append({**base_to, sec_beds[0]: 2, sec_beds[1]: 2})
            if "dining" in have:
                swap_sets.append({**base_to, sec_beds[0]: 2, sec_beds[1]: 2, "dining": 1})

    # Rooms below this priority may be dropped freely when space is genuinely
    # tight (utility, dining, entrance, pooja); anything at/above it is essential
    # (every bedroom, kitchen, living, stair, toilet) and dropping one is a far
    # worse outcome than dropping several optional rooms.
    _ESSENTIAL_PRIORITY = 5
    prio = {r.id: r.priority for r in program}
    # An attached bath inherits its bedroom's priority (it is carved from the
    # bedroom block, so it is just as essential and must never be coverage-dropped);
    # a carved dressing strip is optional. Registering these keeps _enforce_coverage
    # from treating the post-carve ids as droppable priority-0 rooms.
    for r in program:
        if r.attach_bath and r.bath_id:
            prio[r.bath_id] = max(_ESSENTIAL_PRIORITY, r.priority)
            if r.dressing:
                prio[f"dressing_{r.id}"] = 2

    def essential_dropped(dropped: list[str]) -> int:
        return sum(1 for d in dropped if prio.get(d, 0) >= _ESSENTIAL_PRIORITY)

    # Sweep the 3-band layouts. The bedroom-block area cap (see
    # ``VastuGridPacker._max_run_for``) already squares bedrooms on a narrow plot, so
    # the single-floor social plan keeps the Vastu-friendly 3-band sweep (kitchen SE,
    # pooja NE, stair on the central spine) rather than a 2-band collapse that would
    # displace them.
    band_plan = [(False, b) for b in _BAND_VARIANTS]

    for force_two_band, bands in band_plan:
        for overrides in swap_sets:
            attempts += 1
            packer = VastuGridPacker(
                env, min_dim, min_habitable, min_area_by_type, keepout,
                band_fracs=bands, col_overrides=overrides,
                fill_center=bool(variant and variant.fill_center),
                force_two_band=force_two_band,
            )
            result = packer.pack(program)
            if not result.placed:
                continue
            # Carve each bedroom block into bedroom + attached toilet (guillotine
            # cut) BEFORE coverage trimming, so the bath counts toward footprint.
            result.placed[:] = _carve_attached_baths(
                result.placed, program_by_id, plot, min_dim
            )
            # trim the footprint under the coverage limit (drops optional rooms,
            # never undersizes a habitable one).
            cov_dropped = _enforce_coverage(
                result.placed, env, plot_area, max_cov, prio, _ESSENTIAL_PRIORITY, min_dim
            )
            # Fill any leftover footprint band space with a labelled courtyard (or
            # weld a thin strip into a neighbour where coverage allows) so the floor
            # never ships an unassigned blank gap; the courtyard is virtual — it
            # neither counts toward coverage nor triggers a min-area/dim code fail.
            _fill_footprint_voids(
                result.placed, env, cov_cap=(max_cov - 1.0) / 100.0 * plot_area,
                plot_area=plot_area,
            )
            all_dropped = result.dropped + cov_dropped
            _assert_no_overlap(result.placed)
            _assert_inside(result.placed, env)
            plan = _build_plan(result.placed, plot, env, name, edits)
            plan, vastu, code = _score_candidate(plan)
            # Ranking (best = smallest): correctness first — never sacrifice an
            # essential room, then minimise code fails — then quality per the
            # brief (higher Vastu), and finally prefer fewer optional drops. Vastu
            # is rounded so a marginal score gain never justifies dropping a room,
            # but a real gain (e.g. kitchen reaching its ideal SE) does.
            cov = getattr(code.metrics, "ground_coverage_pct", 0.0) or 0.0
            # dining must abut the kitchen (functional must, just under code safety).
            kd_bad = 0 if _kitchen_dining_adjacent(result.placed) else 1
            # good room proportions (ribbon COUNT) rank just below the hard code +
            # kitchen-dining invariants and above Vastu; the worst single aspect is a
            # finer squareness tie-break placed just below the front-living term so a
            # marginally squarer layout can never shove the hall into the centre.
            aspect_bad = _aspect_bad(result.placed)
            worst_asp = _worst_aspect(result.placed)
            # keep the big hall off the dead-centre Brahmasthan (front living), and
            # only use "hall is largest" as a last-resort tiebreaker so it never
            # forces the hall central on a narrow plot.
            liv_center = _living_in_center(plan)
            liv_not_largest = _living_not_largest(result.placed)
            if variant is not None and variant.prefer_area:
                # value plan: prefer denser / fewer-drops, then Vastu
                key = (
                    essential_dropped(all_dropped),
                    code.summary.fail_count,
                    kd_bad,
                    aspect_bad,
                    liv_center,
                    len(all_dropped),
                    -round(cov),
                    -round(vastu.score),
                    worst_asp,
                    liv_not_largest,
                )
            else:
                key = (
                    essential_dropped(all_dropped),
                    code.summary.fail_count,
                    kd_bad,
                    aspect_bad,
                    liv_center,
                    -round(vastu.score),
                    worst_asp,
                    len(all_dropped),
                    liv_not_largest,
                )
            candidates.append(
                _Candidate(plan=plan, vastu=vastu, code=code, dropped=all_dropped, score_key=key)
            )

    if not candidates:
        raise ValueError("could not generate a feasible plan for the given brief")

    best = min(candidates, key=lambda c: c.score_key)
    site_meta = _add_site_utilization(best.plan, env, cars=(edits.parking_cars if edits else None))
    plan, vastu, code = _score_candidate(best.plan)
    meta = {
        "vastuScore": vastu.score,
        "vastuGrade": vastu.grade,
        "codeFails": code.summary.fail_count,
        "droppedRooms": best.dropped,
        "attempts": attempts,
        # right-sizing surface (camelCase, passes through the router's meta dict)
        "tier": effective_tier,
        "requestedBhk": max(1, min(4, int(bhk))),
        "downscaled": downscaled,
        "note": tier_note,
        "footprintSqm": round(footprint, 1),
        **site_meta,
    }
    return plan, vastu, code, meta


# --------------------------------------------------------------------------- #
# generate_options — one brief, five distinct design schemes
# --------------------------------------------------------------------------- #
def _plan_signature(plan: Plan) -> dict[tuple, int]:
    """A coarse fingerprint of a plan: the multiset of (room_type, zone, floor).
    Captures the compass DISTRIBUTION of rooms, so two schemes that put the same
    rooms on the same zones read as 'the same design' for de-duplication, while a
    different zoning (Vastu-pure vs. dense vs. open) reads as distinct."""
    sig: dict[tuple, int] = {}
    for r in plan.rooms:
        t = r.type.value if hasattr(r.type, "value") else str(r.type)
        zone = r.zone.value if (r.zone is not None and hasattr(r.zone, "value")) else str(r.zone or "?")
        # bucket the area (~3 m^2) so a room that grows/shrinks materially between
        # schemes (e.g. an open-plan living that absorbs the dining) reads distinct.
        area_bucket = int(round((r.area_sqm or 0.0) / 3.0))
        key = (t, zone, int(getattr(r, "floor", 0) or 0), area_bucket)
        sig[key] = sig.get(key, 0) + 1
    return sig


def _signature_similarity(a: dict, b: dict) -> float:
    """Jaccard overlap of two plan signatures in [0, 1] (1.0 == identical)."""
    keys = set(a) | set(b)
    if not keys:
        return 1.0
    inter = sum(min(a.get(k, 0), b.get(k, 0)) for k in keys)
    union = sum(max(a.get(k, 0), b.get(k, 0)) for k in keys)
    return inter / union if union else 1.0


def generate_options(
    bhk: int,
    plot: Plot,
    floors: int = 1,
    vastu_priority: bool = True,
    project_name: Optional[str] = None,
    code_rules: Optional[CodeRules] = None,
    vastu_rules: Optional[VastuRules] = None,
    max_options: int = 5,
    similarity_threshold: float = 0.90,
) -> list[dict]:
    """Run the brief through every :data:`VARIANT_PROFILES` strategy and return up
    to ``max_options`` genuinely-distinct options, each a dict ``{variantId,
    variantName, variantTagline, plan, vastu, code, meta}``. Near-identical results
    (a brief so tight only one good layout exists) are de-duplicated, keeping the
    higher-scoring one, so the gallery never shows the same plan twice. The list is
    ordered best-first (fewest code fails, then highest Vastu)."""
    code_rules = code_rules or get_code_rules()
    vastu_rules = vastu_rules or get_vastu_rules()
    foot = buildable_footprint_sqm(plot, code_rules)

    raw: list[dict] = []
    for vp in VARIANT_PROFILES:
        if vp.min_footprint_sqm and foot < vp.min_footprint_sqm:
            continue  # e.g. a courtyard isn't worth its floor area on a small plot
        try:
            plan, vastu, code, meta = generate_plan(
                bhk=bhk, plot=plot, floors=floors, vastu_priority=vastu_priority,
                project_name=project_name, code_rules=code_rules,
                vastu_rules=vastu_rules, variant=vp,
            )
        except ValueError:
            continue
        meta = {
            **meta,
            "variantId": vp.id,
            "variantName": vp.name,
            "variantTagline": vp.tagline,
            "courtyard": vp.courtyard,
            "openKitchen": vp.open_kitchen,
        }
        raw.append({
            "variantId": vp.id, "variantName": vp.name, "variantTagline": vp.tagline,
            "plan": plan, "vastu": vastu, "code": code, "meta": meta,
            "_sig": _plan_signature(plan),
            "_quality": (code.summary.fail_count, -round(vastu.score)),
        })

    if not raw:
        # every variant was infeasible — fall back to the default plan (this raises
        # ValueError for a genuinely impossible brief, handled as HTTP 422 upstream).
        plan, vastu, code, meta = generate_plan(
            bhk=bhk, plot=plot, floors=floors, vastu_priority=vastu_priority,
            project_name=project_name, code_rules=code_rules, vastu_rules=vastu_rules,
        )
        return [{
            "variantId": "default", "variantName": "Recommended Plan",
            "variantTagline": "A balanced, code- and Vastu-aware layout.",
            "plan": plan, "vastu": vastu, "code": code, "meta": meta,
        }]

    # Best-first, then greedily keep only options far enough from the kept set.
    raw.sort(key=lambda o: o["_quality"])
    kept: list[dict] = []
    for opt in raw:
        if any(_signature_similarity(opt["_sig"], k["_sig"]) >= similarity_threshold for k in kept):
            continue
        kept.append(opt)
        if len(kept) >= max_options:
            break

    return [
        {
            "variantId": o["variantId"], "variantName": o["variantName"],
            "variantTagline": o["variantTagline"], "plan": o["plan"],
            "vastu": o["vastu"], "code": o["code"], "meta": o["meta"],
        }
        for o in kept
    ]
