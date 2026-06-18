def get_design_narrative(variant_name: str, plot_data: dict, climate_zone: str, bhk: int, family_persona: str = None) -> dict:
    """
    Returns professional architectural design narrative for a given variant.
    Mimics how a qualified architect writes a design concept statement.
    
    Returns:
    {
      'concept_title': str,
      'concept_statement': str (3-4 sentences, architectural language),
      'design_principles': list[str] (5 principles applied),
      'spatial_organization': str (how spaces are organized),
      'material_palette': str (recommended material language),
      'precedent': str (architect/building reference),
      'sustainability_measures': list[str],
      'vastu_approach': str,
    }
    """
    variant_lower = variant_name.lower()
    
    # Defaults
    title = f"The {bhk}-Bed Residence"
    statement = f"A carefully crafted {bhk}-bedroom residence designed for the {climate_zone} climate. The layout balances spatial efficiency with natural light, offering a seamless flow between living and private spaces. The design embodies contemporary Indian architectural principles while ensuring practical everyday living."
    principles = [
        "Optimization of natural light and cross ventilation",
        "Clear demarcation of public and private zones",
        "Efficient circulation to minimize passage area",
        "Integration of indoor and outdoor spaces",
        "Climate-responsive fenestration design"
    ]
    spatial_org = "The ground floor hosts the primary public functions, with living and dining areas flowing into each other. Private bedrooms are pushed to the quieter corners, buffered by wet areas."
    material_palette = "Exposed brick or local stone accents, paired with smooth plaster, warm timber fenestration, and natural stone flooring."
    precedent = "Inspired by contemporary Indian modernist approaches (e.g., Charles Correa, BV Doshi)."
    sustainability = [
        "Rainwater harvesting integration",
        "Passive cooling through strategic shading",
        "Locally sourced building materials"
    ]
    vastu_approach = "Adheres to basic macro-Vastu principles ensuring favorable entry and functional placements."

    if variant_lower in ["courtyard", "courtyard_house"]:
        title = "The Verandah House"
        statement = f"Organized around a central open court that acts as the climate engine of the house. Hot air rises from the court and exhausts through high-level openings, creating a continuous updraft. The family rooms wrap the court, borrowing light and cross-ventilation from two sides. This is the traditional courtyard house, adapted for a contemporary {bhk}-bedroom family with the privacy of modern planning."
        principles = [
            "Central void as a climatic and social anchor",
            "Inward-looking privacy with outward-facing porosity",
            "Thermal mass buffering against external extremes",
            "Diffused natural lighting throughout the day",
            "Visual connectivity across levels and spaces"
        ]
        spatial_org = "All major habitable rooms are arranged peripherally around the central courtyard, ensuring every room receives dual-aspect ventilation and views into the private internal garden."
        material_palette = "Terracotta tiles, exposed laterite or brick, polished concrete floors, and rich timber columns."
        precedent = "Inspired by the classical Kerala Nalukettu and Charles Correa's Tube House."
        sustainability = [
            "Microclimate generation via the courtyard",
            "Induced stack effect for passive cooling",
            "Shaded internal facades reducing solar gain"
        ]
        vastu_approach = "The central courtyard forms the sacred Brahmasthan, kept free of heavy columns or walls, acting as the spiritual and luminous core of the home."
    elif variant_lower in ["vastu", "vastu_first", "vastu_classic"]:
        title = "The Manasara Residence"
        statement = f"A deeply traditional plan rooted in the classical Vastu texts (Manasara and Mayamata), meticulously adapted for a modern {bhk}-BHK program. Every spatial allocation, from the NE pooja to the SW master suite, is mathematically governed by the Vastu Purusha Mandala. The architecture achieves spiritual resonance without compromising on contemporary functional needs."
        principles = [
            "Strict adherence to the 9x9 Vastu Purusha Mandala",
            "Weight and height increasing towards the South-West",
            "Water and light focused in the North-East",
            "Unobstructed energy flow through the central axis",
            "Zonal alignment of elemental forces (Agni, Jal, Vayu)"
        ]
        spatial_org = "Organized strictly by the cardinal directions: Master bedroom in the SW (Earth), Kitchen in the SE (Fire), Water/Pooja in the NE (Water), and central living spaces aligning with the Brahmasthan."
        material_palette = "Sattvic materials: natural marble or granite, lime plaster, copper accents, and native hardwoods like Teak or Jackfruit."
        precedent = "Based on classical Indian treatises on architecture (Manasara, Vishwakarma Prakash)."
        sustainability = [
            "Deep verandas on South and West for solar protection",
            "Alignment with predominant wind directions",
            "Use of breathable, natural wall finishes"
        ]
        vastu_approach = "100% compliance with canonical Vastu zoning. The Brahmasthan is void, entry is in exalted padas, and exact elemental zones are respected."
    elif variant_lower in ["climate", "climate_first", "eco"]:
        title = "The Bioclimatic House"
        statement = f"An aggressively climate-responsive design tuned specifically for the {climate_zone} zone. The massing and fenestration are shaped by solar geometry and prevailing wind patterns. By employing passive design strategies—such as deep overhangs, thermal mass, and stack ventilation—this {bhk}-bedroom home drastically reduces reliance on mechanical cooling and lighting."
        principles = [
            "Solar geometry-driven facade articulation",
            "Optimized surface-to-volume ratio",
            "Strategic thermal mass placement",
            "Cross and stack ventilation pathways",
            "Glare-free daylight harvesting"
        ]
        spatial_org = "Living areas are oriented to capture diffused daylight, while utility and circulation cores are placed on the harshest solar facades (West/South) to act as thermal buffers for the habitable rooms."
        material_palette = "Rammed earth or fly-ash bricks, insulated roofing, low-E glass, and sustainably harvested bamboo or engineered wood."
        precedent = "Inspired by Laurie Baker's cost-effective, climate-sensitive approach and the passive logic of traditional vernacular structures."
        sustainability = [
            "ECBC-compliant building envelope",
            "Maximized natural ventilation hours",
            "Integrated shading devices (chajjas/jaalis)"
        ]
        vastu_approach = "Balances elemental Vastu with scientific climatic logic; prioritizing SW wind capture and shading on the South facade."
    elif variant_lower in ["modern", "modern_open"]:
        title = "The Open Plan Pavilion"
        statement = f"A minimalist, structural-frame approach that liberates the interior from heavy load-bearing walls. The {bhk}-BHK layout is treated as a fluid, continuous space where living, dining, and kitchen areas blur together. Large expanses of glazing connect the interior directly to the outdoors, embodying a sleek, international architectural vocabulary."
        principles = [
            "Fluid, boundary-less spatial transitions",
            "Maximized visual transparency",
            "Minimalist detailing and clean lines",
            "Structural clarity and honesty",
            "Integration of smart home technologies"
        ]
        spatial_org = "The ground floor operates as a single, expansive volume containing all public functions, visually separated only by furniture or subtle level changes, while bedrooms remain enclosed retreats."
        material_palette = "Exposed concrete (form-finish), structural steel, large-format glass panels, and seamless resin or large-tile flooring."
        precedent = "Inspired by Le Corbusier's Domino House and contemporary minimalist pavilions."
        sustainability = [
            "High-performance glazing to manage solar gain",
            "Efficient HVAC zoning",
            "Reflective or green roofing systems"
        ]
        vastu_approach = "Follows broad Vastu guidelines for entry and kitchen placement, but prioritizes spatial fluidity over rigid compartmentalization."
    elif variant_lower in ["multi_gen", "multigenerational"]:
        title = "The Family Compound"
        statement = f"Designed for the complexities of the modern Indian joint family, this {bhk}-bedroom residence balances collective gathering spaces with absolute acoustic and visual privacy for individual family units. The plan allows for aging-in-place with an accessible ground-floor suite, while upper levels cater to younger generations with their own breakout spaces."
        principles = [
            "Gradient of privacy from public to deeply private",
            "Universal design and accessibility on the ground floor",
            "Multiple decentralized living/gathering areas",
            "Acoustic separation between sleeping zones",
            "Adaptability for future expansion"
        ]
        spatial_org = "Features a grand communal living and dining area at the heart, with a dedicated ground-floor master suite for elders. Upper floors contain separate family lounges acting as vestibules to the younger generation's bedrooms."
        material_palette = "Durable, low-maintenance finishes: granite flooring in high-traffic areas, warm wood in private quarters, and robust masonry."
        precedent = "A modern reinterpretation of the traditional Haveli, designed to foster multi-generational cohesion."
        sustainability = [
            "Zoned lighting and cooling for independent usage",
            "Shared centralized utility cores for efficiency",
            "Robust, long-lasting construction detailing"
        ]
        vastu_approach = "Adheres strictly to Vastu for the main entrance, pooja, and kitchen, while providing secondary Vastu-compliant sleeping orientations for multiple family heads."

    if family_persona:
        persona_intro = f"In the spirit of B.V. Doshi's humanist architecture, this home is deeply personalized for its inhabitants: {family_persona}. The design responds directly to these unique familial rhythms."
        persona_lower = family_persona.lower()
        if any(word in persona_lower for word in ["music", "drum", "guitar", "piano", "band", "sound"]):
            persona_intro += " To accommodate musical aspirations without disrupting the household's peace, acoustic zones are carefully segregated."
        if any(word in persona_lower for word in ["dog", "cat", "pet"]):
            persona_intro += " Recognizing pets as integral family members, dedicated utility and wash areas are carefully planned to weave their care seamlessly into daily life."
        if any(word in persona_lower for word in ["grandparent", "elder", "senior"]):
            persona_intro += " Honoring the elders, the ground floor is gently sculpted for accessibility, ensuring their comfort and dignity remain at the very heart of the home."
        statement = persona_intro + "\n\n" + statement

    return {
        "concept_title": title,
        "concept_statement": statement,
        "design_principles": principles,
        "spatial_organization": spatial_org,
        "material_palette": material_palette,
        "precedent": precedent,
        "sustainability_measures": sustainability,
        "vastu_approach": vastu_approach,
    }

