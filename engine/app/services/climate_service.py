# c:\archiproj\engine\app\services\climate_service.py

"""
Climate Service for Architectural Analysis.
Provides climate-responsive design logic, conforming to NBC guidelines.
"""

CLIMATE_ZONES = {
    "Bengaluru": "temperate",
    "Hyderabad": "hot_dry",
    "Tirupati": "warm_humid",
    "Pune": "composite"
}

WIND_ROSE = {
    "Bengaluru": {"primary": "W", "secondary": "SW"},
    "Hyderabad": {"primary": "W", "secondary": "NW"},
    "Tirupati": {"primary": "SE", "secondary": "S"},
    "Pune": {"primary": "SW", "secondary": "W"}
}

SOLAR_PATH = {
    "hot_dry": [45, 52, 63, 75, 84, 88, 86, 78, 67, 56, 48, 43],
    "warm_humid": [48, 55, 66, 78, 87, 89, 88, 80, 69, 58, 50, 45],
    "composite": [42, 49, 60, 72, 82, 86, 84, 76, 65, 54, 46, 41],
    "cold": [35, 42, 53, 65, 75, 79, 77, 69, 58, 47, 39, 34],
    "temperate": [46, 53, 64, 76, 85, 89, 87, 79, 68, 57, 49, 44]
}

def get_climate_zone(city: str) -> str:
    """Returns the NBC climate zone for the given city."""
    return CLIMATE_ZONES.get(city, "composite")

def get_passive_strategies(climate_zone: str) -> list[dict]:
    """Returns climate-specific passive design strategies."""
    strategies = {
        "hot_dry": [
            {"strategy": "Thick Walls", "priority": "high", "description": "High thermal mass (e.g. 230mm brick or stone) to delay heat transfer."},
            {"strategy": "Small Openings", "priority": "high", "description": "Minimize window sizes on West and South-East to reduce heat gain."},
            {"strategy": "Courtyard", "priority": "high", "description": "Central courtyard with water feature for evaporative cooling."},
            {"strategy": "Heavy Roof", "priority": "medium", "description": "Heavy roof (>150mm) to reduce downward heat flow."},
            {"strategy": "Verandah", "priority": "medium", "description": "Deep verandah on South/West to shade main walls."},
            {"strategy": "Jaali Screens", "priority": "high", "description": "Perforated screens to allow ventilation while blocking glare."}
        ],
        "warm_humid": [
            {"strategy": "Cross-Ventilation", "priority": "high", "description": "Maximize cross-ventilation, primarily along N-S axis."},
            {"strategy": "Raised Floors", "priority": "medium", "description": "Helps avoid dampness and catches higher wind speeds."},
            {"strategy": "Wide Overhangs", "priority": "high", "description": "Deep projections (>900mm) to protect from heavy rain and sun."},
            {"strategy": "Open Plan", "priority": "high", "description": "Free-flowing interior to prevent trapped humid air."},
            {"strategy": "Raised Ceiling", "priority": "medium", "description": "High ceilings allow hot air to rise and escape via ventilators."},
            {"strategy": "Avoid E/W Walls", "priority": "high", "description": "Minimize exposure to direct solar radiation on East/West."}
        ],
        "composite": [
            {"strategy": "Flexible Openings", "priority": "high", "description": "Operable louvers or shutters to adapt to changing seasons."},
            {"strategy": "Trombe Wall Option", "priority": "medium", "description": "Thermal mass for winter heating, shaded in summer."},
            {"strategy": "Deciduous Shading", "priority": "medium", "description": "Trees that shed leaves in winter (allow sun) and provide shade in summer."},
            {"strategy": "Moderate Overhangs", "priority": "high", "description": "Provide shading for summer sun but allow winter sun penetration."}
        ],
        "cold": [
            {"strategy": "South-Facing Glass", "priority": "high", "description": "Maximize glazing on South for direct solar gain."},
            {"strategy": "Thermal Mass", "priority": "high", "description": "Internal heavy walls/floors to store solar heat."},
            {"strategy": "Compact Plan", "priority": "high", "description": "Minimize surface area to volume ratio to reduce heat loss."},
            {"strategy": "Double Skin Walls", "priority": "medium", "description": "Provide insulation within the wall cavity."},
            {"strategy": "Minimal North Openings", "priority": "high", "description": "Reduce windows on North facade to prevent cold drafts."}
        ],
        "temperate": [
            {"strategy": "Balanced Openings", "priority": "high", "description": "Moderate glazing distributed for daylight without extreme heat gain."},
            {"strategy": "Moderate Overhangs", "priority": "medium", "description": "Standard weather protection and shading."},
            {"strategy": "Courtyard Option", "priority": "medium", "description": "Internal courtyard can help balance temperatures."}
        ]
    }
    return strategies.get(climate_zone, strategies["composite"])

def get_orientation_advice(climate_zone: str, facing: str) -> dict:
    """Returns orientation-specific architectural advice."""
    facing = facing.upper() if facing else 'N'
    if facing == 'N':
        return {
            'score': 85,
            'advice': 'Excellent for diffused daylight. Maximize openings.',
            'solar_gain_risk': 'Low',
            'ventilation_quality': 'Good'
        }
    elif facing == 'E':
        return {
            'score': 75,
            'advice': 'Good morning sun. Needs shading for late morning.',
            'solar_gain_risk': 'Moderate',
            'ventilation_quality': 'Good'
        }
    elif facing == 'S':
        return {
            'score': 65,
            'advice': 'High solar radiation. Requires deep horizontal overhangs.',
            'solar_gain_risk': 'High',
            'ventilation_quality': 'Moderate'
        }
    elif facing == 'W':
        return {
            'score': 50,
            'advice': 'Harsh afternoon sun. Minimize openings, use vertical louvers.',
            'solar_gain_risk': 'Very High',
            'ventilation_quality': 'Moderate'
        }
    return {
        'score': 70,
        'advice': 'General orientation.',
        'solar_gain_risk': 'Moderate',
        'ventilation_quality': 'Moderate'
    }

def get_shading_requirements(climate_zone: str) -> dict:
    """Returns recommended overhang depth (mm) for different orientations."""
    if climate_zone == 'hot_dry':
        return {'N': 300, 'S': 900, 'E': 600, 'W': 900}
    elif climate_zone == 'warm_humid':
        return {'N': 600, 'S': 1200, 'E': 900, 'W': 1200}
    elif climate_zone == 'cold':
        return {'N': 300, 'S': 300, 'E': 300, 'W': 300}
    else: # composite / temperate
        return {'N': 450, 'S': 750, 'E': 600, 'W': 750}
