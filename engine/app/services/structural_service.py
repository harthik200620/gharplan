import math

"""
Structural Service for Architectural Analysis.
Provides structural engineering rules of thumb, column grids, and foundation recommendations.
"""

FOUNDATION_TYPES = {
    "isolated_footing": {
        "description": "Individual pad foundations under each column.",
        "when_to_use": "Standard residential buildings up to 3-4 floors with good soil bearing capacity."
    },
    "raft": {
        "description": "Continuous thick slab covering the entire footprint.",
        "when_to_use": "Poor soil conditions, basements, or when isolated footings would overlap (high loads)."
    },
    "pile": {
        "description": "Deep cylindrical columns driven into the ground to hit bedrock.",
        "when_to_use": "Very poor soil, coastal areas, or high-rise structures."
    },
    "strip": {
        "description": "Continuous linear foundation under load-bearing walls.",
        "when_to_use": "Load-bearing masonry structures without an RCC frame."
    }
}

def get_column_grid(plot_width_m: float, plot_depth_m: float, floors: int) -> dict:
    """Calculates an approximate structural grid for residential plots."""
    # Typical spacing 3m to 4.5m. For larger plots, use 4m. For smaller, maybe 3.5m.
    grid_spacing = 4.0 if plot_width_m * plot_depth_m > 150 else 3.5

    num_x = max(2, int(math.ceil(plot_width_m / grid_spacing)) + 1)
    num_y = max(2, int(math.ceil(plot_depth_m / grid_spacing)) + 1)

    # Distribute evenly (simplification for preliminary design)
    grid_x = [round(i * (plot_width_m / (num_x - 1)), 2) for i in range(num_x)]
    grid_y = [round(i * (plot_depth_m / (num_y - 1)), 2) for i in range(num_y)]

    if floors <= 2:
        col_size = "230x230" if plot_width_m * plot_depth_m < 100 else "230x300"
        beam_depth = 300
        slab_thick = 125
    elif floors <= 4:
        col_size = "230x380"
        beam_depth = 450
        slab_thick = 150
    else:
        col_size = "230x450"
        beam_depth = 450
        slab_thick = 150

    return {
        "grid_x": grid_x,
        "grid_y": grid_y,
        "column_size_mm": col_size,
        "beam_depth_mm": beam_depth,
        "slab_thickness_mm": slab_thick,
        "rationale": f"Using a {num_x-1}x{num_y-1} bay grid system with average spacing of {round(plot_width_m/(num_x-1), 1)}m x {round(plot_depth_m/(num_y-1), 1)}m to optimize structural spans for residential loads."
    }

def get_foundation_type(plot_sqm: float, floors: int, city: str) -> dict:
    """Recommends foundation type based on city, floors, and plot area."""
    coastal_cities = ["Chennai", "Mumbai", "Kolkata", "Kochi", "Visakhapatnam"]
    is_coastal = city in coastal_cities

    if is_coastal and floors > 2:
        return {
            "type": "pile", 
            **FOUNDATION_TYPES["pile"], 
            "reason": f"Coastal city ({city}) with potential weak/sandy soil requires deep foundations."
        }
    elif floors > 4 or (floors > 3 and plot_sqm < 80):
        return {
            "type": "raft", 
            **FOUNDATION_TYPES["raft"], 
            "reason": "High loads on a small footprint lead to overlapping stresses."
        }
    else:
        return {
            "type": "isolated_footing", 
            **FOUNDATION_TYPES["isolated_footing"], 
            "reason": f"Standard {floors}-floor residential structure on typical soil."
        }

def get_structural_narrative(plot_width_m: float, plot_depth_m: float, floors: int, city: str) -> str:
    """Returns a professional structural concept narrative."""
    plot_sqm = plot_width_m * plot_depth_m
    grid = get_column_grid(plot_width_m, plot_depth_m, floors)
    foundation = get_foundation_type(plot_sqm, floors, city)
    
    narrative = f"The proposed {floors}-story residential building in {city} will utilize an RCC framed structure. "
    narrative += f"Based on the site dimensions ({plot_width_m}m x {plot_depth_m}m), "
    narrative += f"the design adopts a {len(grid['grid_x'])-1} by {len(grid['grid_y'])-1} structural grid. "
    narrative += f"Columns are tentatively sized at {grid['column_size_mm']} mm, supporting {grid['beam_depth_mm']} mm deep beams and a {grid['slab_thickness_mm']} mm thick reinforced concrete slab. "
    narrative += f"For the foundation, a {foundation['type'].replace('_', ' ')} system is recommended because {foundation['reason'].lower()} "
    narrative += "Further geotechnical investigation is required to confirm safe bearing capacity (SBC) prior to detailed structural design."
    
    return narrative
