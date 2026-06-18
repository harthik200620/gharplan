"""
Sustainability Service for Architectural Analysis.
Provides Embodied Carbon, GRIHA scoring, Solar, and RWH estimates.
"""

MATERIAL_CARBON = {
    # kgCO2e per unit
    "concrete_m3": 410.0,
    "steel_kg": 1.85,
    "brick_m2": 35.0, # assuming 230mm brick wall
    "glass_m2": 25.0,
    "timber_m3": 150.0, # varies, sometimes negative but we use standard processing positive
    "aac_block_m2": 22.0,
    "fly_ash_brick_m2": 18.0
}

def calculate_embodied_carbon(boq_items: list[dict]) -> dict:
    """Estimates total embodied carbon from BOQ line items."""
    total_carbon = 0.0
    breakdown = {}
    
    # Simple mapping heuristic
    for item in boq_items:
        desc = item.get("description", "").lower()
        qty = item.get("quantity", 0)
        unit = item.get("unit", "").lower()
        
        carbon_factor = 0
        material_key = "other"
        
        if "concrete" in desc or "rcc" in desc or "pcc" in desc:
            if unit in ["m3", "cum"]:
                carbon_factor = MATERIAL_CARBON["concrete_m3"]
                material_key = "concrete"
        elif "steel" in desc or "rebar" in desc or "reinforcement" in desc:
            if unit == "kg":
                carbon_factor = MATERIAL_CARBON["steel_kg"]
                material_key = "steel"
            elif unit in ["ton", "mt"]:
                carbon_factor = MATERIAL_CARBON["steel_kg"] * 1000
                material_key = "steel"
        elif "brick" in desc and "fly ash" not in desc:
            if unit in ["m2", "sqm"]:
                carbon_factor = MATERIAL_CARBON["brick_m2"]
                material_key = "brick"
        elif "fly ash" in desc:
            if unit in ["m2", "sqm"]:
                carbon_factor = MATERIAL_CARBON["fly_ash_brick_m2"]
                material_key = "fly_ash_brick"
        elif "aac" in desc or "block" in desc:
            if unit in ["m2", "sqm"]:
                carbon_factor = MATERIAL_CARBON["aac_block_m2"]
                material_key = "aac_block"
        elif "glass" in desc or "window" in desc:
            if unit in ["m2", "sqm"]:
                carbon_factor = MATERIAL_CARBON["glass_m2"]
                material_key = "glass"
        elif "timber" in desc or "wood" in desc:
            if unit in ["m3", "cum"]:
                carbon_factor = MATERIAL_CARBON["timber_m3"]
                material_key = "timber"
                
        if carbon_factor > 0:
            carbon = carbon_factor * qty
            total_carbon += carbon
            breakdown[material_key] = breakdown.get(material_key, 0) + carbon
            
    return {
        "total_kg_co2e": round(total_carbon, 2),
        "breakdown": {k: round(v, 2) for k, v in breakdown.items()},
        "note": "Rough estimate based on standard embodied carbon factors."
    }

def get_griha_checklist(plan_data: dict, climate_zone: str) -> list[dict]:
    """Returns a simplified GRIHA v2019 checklist."""
    return [
        {
            "criterion": "Site Selection",
            "points": 1,
            "achieved": True,
            "advice": "Ensure site is not on prime agricultural land or sensitive ecological zones."
        },
        {
            "criterion": "Construction Management",
            "points": 2,
            "achieved": False,
            "advice": "Plan for segregating construction waste and dust mitigation on site."
        },
        {
            "criterion": "Site Planning",
            "points": 2,
            "achieved": False,
            "advice": "Maintain minimum 15% green cover. Preserve existing mature trees."
        },
        {
            "criterion": "Building Envelope",
            "points": 3,
            "achieved": True,
            "advice": f"Design roof and walls to meet ECBC U-value limits for {climate_zone} climate."
        },
        {
            "criterion": "Daylighting",
            "points": 2,
            "achieved": True,
            "advice": "Ensure >2% daylight factor in all habitable rooms via adequate window sizing."
        },
        {
            "criterion": "Ventilation",
            "points": 2,
            "achieved": True,
            "advice": "Achieve 0.5 Air Changes per Hour (ACH) minimum through cross-ventilation."
        },
        {
            "criterion": "Energy Efficiency",
            "points": 5,
            "achieved": False,
            "advice": "Install BEE 5-star rated appliances and high-efficiency HVAC if required."
        },
        {
            "criterion": "Water Efficiency",
            "points": 3,
            "achieved": False,
            "advice": "Implement rainwater harvesting and install low-flow plumbing fixtures."
        },
        {
            "criterion": "Renewable Energy",
            "points": 3,
            "achieved": False,
            "advice": "Assess rooftop solar PV potential to offset grid consumption."
        }
    ]

def estimate_solar_potential(plot_sqm: float, floors: int, city: str) -> dict:
    """Estimates rooftop solar capacity and generation."""
    # Assuming plot coverage around 60% for residential, and 60% of that roof is usable
    roof_available_sqm = plot_sqm * 0.6 * 0.6
    
    # 1 kWp requires approx 10 sqm
    estimated_kwp = round(roof_available_sqm / 10.0, 1)
    
    # Typical yield in India is 1400 - 1600 kWh/kWp/year
    yield_factor = 1500
    if city in ["Chennai", "Hyderabad", "Pune"]:
        yield_factor = 1600 # Higher irradiation
    
    annual_units = int(estimated_kwp * yield_factor)
    
    # India grid emission factor ~ 0.8 kg CO2/kWh
    co2_saved_kg_year = int(annual_units * 0.8)
    
    return {
        "roof_available_sqm": round(roof_available_sqm, 2),
        "estimated_kwp": estimated_kwp,
        "annual_units_kwh": annual_units,
        "co2_saved_kg_year": co2_saved_kg_year
    }

def get_rainwater_harvesting_sizing(plot_sqm: float, city: str) -> dict:
    """Estimates RWH sump size based on plot size and typical rainfall."""
    rainfall_data = {
        "Bengaluru": 900,
        "Hyderabad": 800,
        "Tirupati": 950,
        "Pune": 700,
        "Chennai": 1400,
        "Mumbai": 2200,
        "Kolkata": 1600,
        "Delhi": 700
    }
    
    annual_rainfall_mm = rainfall_data.get(city, 800)
    
    # Runoff coefficient for roof ~ 0.85
    annual_harvestable_liters = plot_sqm * annual_rainfall_mm * 0.85
    
    # Standard practice: Sump should hold ~5% of annual catch
    sump_capacity_liters = int(annual_harvestable_liters * 0.05)
    
    # Round to nearest 1000
    sump_capacity_liters = round(sump_capacity_liters / 1000) * 1000
    if sump_capacity_liters < 2000:
        sump_capacity_liters = 2000
        
    return {
        "annual_harvestable_liters": int(annual_harvestable_liters),
        "recommended_sump_liters": sump_capacity_liters,
        "advice": f"Install a {sump_capacity_liters}L underground sump. Connect roof downpipes via a first-flush filter."
    }
