import logging
from typing import Optional, Tuple

from app.models.plan import Plan, Plot
from app.models.reports import CodeReport, VastuReport
from app.generator.designer import generate_plan
from app.services.refine_service import parse_edits
from app.services.rules import get_code_rules, get_vastu_rules
from app.services.climate_service import get_climate_zone, get_orientation_advice

logger = logging.getLogger(__name__)

def optimize_plan(
    bhk: int,
    plot: Plot,
    floors: int,
    vastu_priority: bool = True
) -> Tuple[Plan, VastuReport, CodeReport, dict]:
    """
    Autonomous architectural optimization loop.
    Iteratively generates and refines a plan to maximize Vastu and Code scores.
    Up to 10 iterations.
    """
    best_plan = None
    best_vastu = None
    best_code = None
    best_meta = None
    best_score = -1.0
    
    current_instructions = []
    
    code_rules = get_code_rules()
    vastu_rules = get_vastu_rules()
    
    facing_str = plot.facing.value if hasattr(plot.facing, "value") else str(plot.facing)
    city_str = plot.city.value if hasattr(plot.city, "value") else str(plot.city)
    climate_zone = get_climate_zone(city_str)
    orientation_advice = get_orientation_advice(climate_zone, facing_str)
    climate_score = orientation_advice.get("score", 0)

    for iteration in range(10):
        logger.info(f"Optimization loop iteration {iteration+1}")
        
        # Step 4: Parse instructions into EditOverrides
        if current_instructions:
            result = parse_edits(
                current_instructions,
                base_bhk=bhk,
                base_floors=floors,
                base_variant_id=best_meta.get("variantId") if best_meta else None
            )
            edits = result.edits
        else:
            edits = None

        # Step 1: Generate plan
        try:
            plan, vastu, code, meta = generate_plan(
                bhk=bhk,
                plot=plot,
                floors=floors,
                vastu_priority=vastu_priority,
                code_rules=code_rules,
                vastu_rules=vastu_rules,
                edits=edits
            )
        except Exception as e:
            logger.warning(f"Generation failed in loop iteration {iteration+1}: {e}")
            # If we fail with edits, stop and return the best so far
            break

        # Calculate combined score
        vastu_score = vastu.score
        
        # Keep track of the best plan
        if vastu_score > best_score:
            best_score = vastu_score
            best_plan = plan
            best_vastu = vastu
            best_code = code
            best_meta = meta
            
            # Save applied edits if any
            if current_instructions:
                best_meta["appliedEdits"] = result.applied
                best_meta["unmatchedEdits"] = result.unmatched

        # Step 2 & 3: Evaluate scores and generate synthetic instructions
        # If score is perfectly 100 or >= 95, we can consider it optimized.
        # The instructions say "If scores are below 95%, determine what is wrong".
        if vastu_score >= 95.0:
            break
            
        new_instructions = []
        for room in vastu.rooms:
            if room.status != 'pass' and room.suggested_zones:
                suggested_zone = room.suggested_zones[0]
                new_instructions.append(f"move {room.room_label.lower()} to {suggested_zone.lower()}")
                
        # If we couldn't find any actionable vastu instructions, maybe check fixes
        if not new_instructions and vastu.fixes:
            for fix in vastu.fixes:
                if fix.suggested_zones:
                    suggested_zone = fix.suggested_zones[0]
                    new_instructions.append(f"move {fix.room_label.lower()} to {suggested_zone.lower()}")

        if not new_instructions:
            # We are stuck, can't find any more improvements
            break
            
        # Append new instructions for the next iteration
        # To avoid endless loops with the same instructions, we can just use the new ones
        # However, parse_edits takes "the full edit history (applied in order) so refinement is stateless".
        current_instructions.extend(new_instructions)
        
    return best_plan, best_vastu, best_code, best_meta
