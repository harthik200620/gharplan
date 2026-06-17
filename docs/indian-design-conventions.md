# Indian Residential Design Conventions — Reference for the Floor-Plan Generator

Scope: realistic, Indian-taste home layouts for **Bengaluru (KA)**, **Hyderabad (TG)**, **Tirupati (AP)**.
All areas are **built-up / floor footprint** unless stated "carpet". Conversions: 1 m² = 10.764 ft²; 1 sq yard (gaj) = 9 ft² = 0.836 m². Sites in S. India are quoted in **feet** (e.g. 30×40); plots in Hyderabad/AP often in **square yards**.

> Vastu note: Vastu is a strong client-preference signal in all three cities (very strong in Tirupati). The generator should treat Vastu zones as **soft constraints / scoring weights**, not hard rules — orientation of the plot's main road often forces compromises.

---

## 1. Attached bathrooms — the central Indian preference

**Confirmed pattern in modern Indian homes (2BHK and up):**

- **Every bedroom gets its own attached toilet/bath.** In 2BHK+ designs the default is one attached bath per bedroom; designers and listing portals describe an attached/ensuite master bath as "no longer a luxury — a necessity." Below 2BHK this relaxes (see tier table).
- **Master bedroom = attached bath + dressing/wardrobe.** The premium master suite adds a walk-in/dressing strip (often an L-shaped suite or a walk-through dressing leading to the bath), plus a full wardrobe wall. Walk-in dressing appears from ~3BHK upward; smaller homes use a wardrobe wall instead.
- **Separate COMMON / POWDER toilet near living–dining** for guests, so visitors never enter bedrooms. This is standard from 2BHK upward (a compact WC/half-bath, sometimes only a WC + washbasin).
- **Number of toilets by tier:** 1RK/1BHK → 1 bath; 2BHK → 2 attached + (often) 1 common/powder = 2–3; 3BHK → 3 attached + 1 common ≈ 3–4; 4BHK → 4 attached + 1 common ≈ 4–5.

**Typical attached-bath size:**

| Bath type | Feet | ft² | m² | Notes |
|---|---|---|---|---|
| Minimum combined bath+WC | 4×7 | ~28 | ~2.6 | Code-min, feels tight |
| Comfortable attached bath | 5×8 | 40 | ~3.7 | Most common secondary/ensuite |
| Generous family bath | 6×8 to 6×10 | 48–60 | 4.5–5.6 | Comfortable daily use |
| Master bath | 7×8 to 8×10 | 56–80 | 5.2–7.4 | Larger; room for vanity/long counter |
| Common / powder (WC+basin) | 3×6 to 4×5 | 18–24 | ~2.0 | Guest half-bath near living/dining |

**Vastu placement of the attached bath within a bedroom:**

- **Best corners: West (W) or North-West (NW)** of the bedroom; South (S) is acceptable.
- **NEVER** put the toilet/bath in the **North-East (NE)** of the bedroom or house (most important rule), and avoid the NE/E *of the bed*. Avoid SW (zone of stability) and SE (bedroom) where possible.
- **WC seat orientation:** user faces **North or South** (avoid facing East/West).
- **Door rule:** the bath door must **not directly face the bed**, and ideally not face the bedroom entry door, kitchen, or pooja. Keep the door closed; use a sliding door in compact ensuites to save swing space.
- Practical: place the attached bath on the **outer wall** (plumbing + ventilation), tucked into the bedroom's W/NW/S corner, door set into a side wall so it opens away from the bed's head.

Sources:
- HomeLane — Attached Bathroom Designs: https://www.homelane.com/design-ideas/bathroom-design/attach-bathroom-designs/
- DesignCafe — Attached bathroom design ideas: https://www.designcafe.com/blog/bathroom-interiors/attached-bathroom-design-ideas/
- Coohom — Bedroom designs with attached bath & dressing: https://www.coohom.com/in/article/10-bedroom-designs-with-attached-bathroom-dressing-plans
- Asian Paints Beautiful Homes — Bathroom Vastu: https://www.beautifulhomes.asianpaints.com/blogs/bathroom-vastu.html
- Orientbell — Best toilet direction as per Vastu: https://www.orientbell.com/blog/best-toilet-direction-as-per-vastu-design-tips-orientbell-tiles/
- JK Cement — Vastu for bathrooms & toilets: https://www.jkcement.com/blog/vastu/vastu-for-bathrooms-and-toilets/
- Badeloft — Common bathroom sizes & dimensions: https://www.badeloftusa.com/buying-guides/the-most-common-bathroom-sizes-and-dimensions/

---

## 2. Right-sizing by space — built-up area → largest sensible program

Thresholds are **minimum comfortable built-up area per floor** for a real (not code-floor) layout. Below a tier's threshold, drop to the tier below.

| Built-up / floor (m²) | Built-up (ft²) | Largest sensible program | Bedrooms | Baths (attached + common) | Adds |
|---|---|---|---|---|---|
| ≤ ~35 | ≤ ~375 | **Studio / 1RK** | 0 (living-cum-bed) | 1 bath, no common | kitchenette only |
| ~35–50 | ~375–540 | **1RK+ / compact 1BHK** | 0–1 | 1 | small kitchen |
| ~50–70 | ~540–750 | **1BHK** | 1 (attached bath) | 1 attached | kitchen + small living |
| ~70–105 | ~750–1,130 | **2BHK** | 2 (each attached) | 2 attached + 1 common/powder | dining + utility; pooja niche if space |
| ~105–150 | ~1,130–1,615 | **3BHK** | 3 (each attached) | 3 attached + 1 common | pooja, utility, store, sit-out, dining |
| ≥ ~150 | ≥ ~1,615 | **4BHK** | 4 (each attached) | 4 attached + 1 common | pooja, utility, store, dressing/walk-in, sit-out, balconies |

Cross-check against market carpet-area norms (carpet ≈ 0.80 × built-up):

| Tier | Carpet ft² | Carpet m² | Typical built-up ft² | Built-up m² |
|---|---|---|---|---|
| 1RK / Studio | 250–400 | 23–37 | 300–450 | 28–42 |
| 1BHK | 450–600 | 40–55 | 550–750 | 50–70 |
| 2BHK | 650–800 | 60–75 | 800–1,000 | 75–93 |
| 3BHK | 900–1,100 | 85–100 | 1,100–1,400 | 105–130 |
| 4BHK | 1,300–1,700 | 120–160 | 1,500–2,000 | 140–186 |

Rules of thumb the generator can apply:
- **No separate bedroom below ~35 m²** — force studio/1RK (one living-cum-bedroom + kitchenette + 1 bath).
- **Attached bath per bedroom only from 2BHK up.** In 1BHK the single bath serves the whole flat (common, accessed from passage, not strictly ensuite).
- **Common/powder toilet appears at 2BHK** and stays for all larger tiers.
- **Pooja room as a dedicated room from ~3BHK**; below that a pooja **niche/shelf** in living or kitchen.
- **Walk-in/dressing from 4BHK** (or generous 3BHK); else a wardrobe wall in the master.

Sources:
- Civil Sir — Standard size of 1/2/3/4 BHK flat in India: https://civilsir.com/standard-size-of-1bhk-2bhk-3bhk-4bhk-flat-in-india/
- NoBroker Forum — 1 BHK carpet area in sq ft: https://www.nobroker.in/forum/how-much-square-feet-required-for-1-bhk/
- NearMeInteriors — sq ft in 1/2/3 BHK: https://nearmeinteriors.com/how-many-square-feet-are-in-1bhk-2bhk-and-3bhk/
- Rishita — 2 BHK flat area in sq ft: https://www.rishita.in/blog/2-bhk-flat-area-in-square-feet/

---

## 3. Comfortable room sizes (not code minimums)

| Room | Comfortable feet | ft² | m² | Notes |
|---|---|---|---|---|
| Living / hall | 12×16 to 15×20 (up to 18×24 large) | 192–300 | 18–28 | Biggest room; receives guests |
| Master bedroom | 12×14 to 14×16 | 168–224 | 15.5–21 | + attached bath + wardrobe wall |
| Other bedroom | 10×12 to 12×12 | 120–144 | 11–13 | Each with attached bath (2BHK+) |
| Kitchen | 8×10 to 10×12 | 80–120 | 7.5–11 | Platform min 600 mm deep |
| Dining | 10×10 to 12×12 (≈4.0×3.0 m) | 100–144 | 9–13 | Often open to living/kitchen |
| Attached bath | 5×8 to 6×8 | 40–48 | 3.7–4.5 | Master bath up to 8×10 / 80 ft² |
| Common / powder bath | 3×6 to 4×5 | 18–24 | ~2.0 | WC + basin near living/dining |
| Pooja room | 3×3 to 4×6 (niche 2×2) | 9–24 | 0.8–2.2 | NE/E; idol faces N or E |
| Utility / wash | 4×6 to 5×7 | 24–35 | 2.2–3.3 | Off kitchen; washing machine, sink, dry area |
| Foyer / entrance | 4×5 to 5×6 | 20–30 | 1.9–2.8 | Transition + shoe storage |
| Staircase | 3×10 to 3.5×12 (≈0.9–1.0 m wide) | 30–42 | 2.8–3.9 | Central or side; tread ~250 mm, riser ~165 mm |
| Car parking / porch | 10×18 (1 car) / 16–18×18 (2 car) | 180 / ~320 | 16.7 / ~30 | At front; covered porch |
| Sit-out / veranda | 5×8 to 6×10 | 40–60 | 3.7–5.6 | Front; semi-open |
| Balcony (dry/wet) | 4×6 to 4×8 | 24–32 | 2.2–3.0 | Off living or bedroom; utility balcony off kitchen |

Sources:
- Happho — Standard sizes of rooms in an Indian house: https://happho.com/standard-sizes-rooms-indian-house/
- Coohom — Standard room size in India (guide): https://www.coohom.com/in/article/standard-room-size-in-india-a-comprehensive-guide
- Civil Site — Standard room sizes and area: https://civilsite.in/standard-room-sizes-and-area/
- HouseYog — Minimum room size standards in India (NBC): https://www.houseyog.com/blog/minimum-room-size-standards-india/

---

## 4. Adjacency & flow rules a good plan follows

Do's:
1. **Kitchen ↔ dining ↔ living** form one connected social core; kitchen opens to (or is adjacent to) dining, dining flows to living.
2. **Kitchen ↔ utility/wash at the back** (rear or side), with utility on an external wall for drainage/ventilation; washing machine + sink + dry-balcony adjacent.
3. **Living ↔ foyer/entrance**: enter into a foyer that leads to the living/hall; guests are received here, not routed through private areas.
4. **Bedrooms in a private cluster** set away from the entry, reached via a passage; the public zone (living/dining) buffers them from the door.
5. **Master bedroom = attached bath + wardrobe wall** (and dressing/walk-in in larger homes); bath tucked to W/NW/S corner, door not facing the bed.
6. **Pooja near NE/E**, away from and never sharing a wall with toilets; idol faces N or E; not under a stair or toilet.
7. **Parking + sit-out at the front**; covered porch leads to the entrance/foyer.
8. **Stair central or along a side wall**, reachable from the common area; in G+1/G+2 it lands near the entry so upper floors don't cross private rooms.

Vastu zoning overlay (apply as scoring weights):
- Kitchen → **SE** (cook facing E); Master bedroom → **SW**; Pooja/study → **NE/E**; Living → **N/E**; Toilets → **W/NW/S**, never NE; Store → **SW/S**, never NE; Overhead tank → SW/W; underground/sump → NE/N; staircase → S/SW/W (clockwise), avoid NE.

Sources:
- Livspace — North-facing house Vastu plan: https://www.livspace.com/in/magazine/north-facing-house-vastu-plan
- JK Cement — Vastu-compliant home floor plans: https://www.jkcement.com/blog/vastu/indian-vastu-compliant-home-floor-plans/
- SmartScale House Design — Vastu-compliant house plans (room-by-room): https://smartscalehousedesign.com/vastu-compliant-house-plans-india/
- SubhaVaastu — Portico/veranda & store-room Vastu: https://www.subhavaastu.com/vastu-for-portico.html , https://www.subhavaastu.com/store-room.html

---

## 5. Indian-taste essentials (include where space allows) + drop-order

Designers add these wherever the program affords it:
- **Pooja room / niche** — near-universal; dedicated room from 3BHK, niche/shelf below that (NE/E).
- **Utility / wash area** off the kitchen (rear) — washing machine, sink, mops, often a dry-balcony.
- **Dry/wet balcony** — utility (wet) balcony off kitchen; a dry/sit balcony off living or master.
- **Sit-out / veranda** at the front (semi-open, for the morning-coffee / chappal-removal zone).
- **Foyer** — entry transition with shoe storage; keeps the door from opening straight into living.
- **Store room** — near kitchen/under-stair; SW/S preferred.
- **Water: overhead tank (SW/W) + underground sump (NE/N)** + (where municipal) a borewell point.
- **Car parking / porch** at the front — 1 car minimum, 2 in larger homes.

**Droppable-when-tight — priority order (first dropped → last dropped):**
1. Dressing / walk-in (→ wardrobe wall)
2. Store room (→ lofts / under-stair)
3. Dry balcony / extra balcony
4. Dedicated pooja room (→ pooja niche/shelf — keep the niche, it rarely vanishes)
5. Separate dining (→ merge into living or kitchen)
6. Sit-out / veranda
7. Common/powder toilet (→ at 1BHK and below)
8. Per-bedroom attached bath (→ shared bath at 1BHK)
9. Utility/wash area — **kept almost to the end** (very high Indian priority)
10. Foyer — minimal but usually retained as a token entry
**Never dropped:** kitchen, ≥1 bathroom, the single living-cum-bedroom (studio), parking where a plot exists.

Sources:
- BricknBolt — Pooja room dimensions as per Vastu: https://www.bricknbolt.com/blogs-and-articles/home-design-guide/pooja-room-dimensions-as-per-vastu
- HomeLane — Pooja room Vastu: https://www.homelane.com/design-ideas/home-decor/the-best-tips-to-design-your-pooja-room-according-to-vastu/
- NoBroker — Washing machine placement (utility) Vastu: https://www.nobroker.in/forum/where-to-keep-washing-machine-as-per-vastu/

---

## 6. City-specific notes

### Bengaluru (Karnataka)
- **Sites in feet.** Most common: **30×40 (1,200 ft² / 111 m²)** — the dominant size; also **30×50 (1,500 ft²)**, **20×30 (600 ft²)**, **40×60 (2,400 ft²)**, **50×80 (4,000 ft²)**.
- **G+1 / G+2 norm.** A 30×40 G+1 yields ~2,400–2,800 ft² built-up (spacious 3–4BHK); G+2/G+3 common for rental units (separate floor flats). Setbacks per BBMP reduce footprint, so column grids and stair placement are tuned to the setback envelope.
- Strong Vastu demand; east- and north-facing plots preferred. Duplex (internal-stair) plans very popular for owner floors.
- Source: Architects4Design — 30×40 / 40×60 Bangalore plans: https://architects4design.com/30x40-house-plans-bangalore-30x50-20x30-50x80-40x50-30x50-40x40-40x60-house-plans-bangalore/ ; Liza Homes — 30×40 cost 2026: https://lizahomes.in/blog/30x40-house-construction-cost-bengaluru-2026/

### Hyderabad (Telangana)
- **Plots in square yards.** Liquid/common sizes: **200 sq yd (≈1,800 ft² plot, ~2,500 ft² built-up across floors)**, 250, 300, 320, 400, 500 sq yd; 200–405 sq yd is the sweet spot for independent homes.
- **Height/floors:** GHMC self-certification for 75–600 sq yd; ~G+2/G+3 common on 200 sq yd (subject to road width & setbacks). Independent houses and villas dominate suburbs.
- Strong Vastu preference (square/rectangular plots favored; irregular shapes avoided). East/West-facing villas common.
- Source: HomeArchitect — floors & setbacks by plot size (Hyderabad): https://homearchitect.in/how-many-floors-can-be-constructed-on-your-plot-in-hyderabad/ ; Kunal Vastu — Hyderabad house-plan Vastu: https://kunalvastu.com/vastu-for-house-plan-and-design-in-hyderabad-telangana/

### Tirupati (Andhra Pradesh) — temple town
- **TUDA-regulated** (Tirupati Urban Development Authority). Build only in TUDA-approved layouts (legal/loan eligibility); follow TUDA zonal setbacks & LRS. Plots typically in square yards.
- **Heightened Vastu/temple sensitivity.** Pilgrimage-town clientele place strong weight on Vastu and pooja orientation — bias the generator to **prioritize the pooja room (NE/E) and an auspicious, well-defined main entrance** (e.g. main door in the northern half for east-facing plots), strict toilet-NE avoidance, and master in SW.
- Near temple cores (e.g. Tiruchanur/Padmavathi), some nodes are commercial-led with residential capped (~20%); pure residential is in TUDA approved layouts.
- Source: TUDA (AP Govt): https://tirupati.ap.gov.in/tirupati-urban-development-authority-tuda/ ; TUDA Zonal/Land-Use Regulations (PDF): https://www.tudaap.in/Admintuda254tuda124ttda/assets/planning_pdf/Zonal%20RegulationsEnglishf0d48c2c78Land%20Use%20Regulations.pdf ; 1acre.in — TUDA Masterplan 2040: https://1acre.in/map-layers/andhra-pradesh/tirupati-masterplan

---

## Quick generator constants (derived)

- Carpet→built-up factor: built-up ≈ carpet / 0.80 (walls ≈ 20%).
- Studio cap: ≤ 35 m². 1BHK: 50–70 m². 2BHK: 70–105 m². 3BHK: 105–150 m². 4BHK: ≥ 150 m².
- Attached bath per bedroom: ON from 2BHK. Common/powder: ON from 2BHK. Dedicated pooja: ON from 3BHK (niche below). Dressing/walk-in: ON from 4BHK.
- Toilet Vastu mask: allow {W, NW, S}; forbid {NE}; discourage {SW, SE, E}. Door not facing bed.
- Zone defaults: kitchen=SE, master=SW, pooja=NE/E, living=N/E, store=SW, OH-tank=SW/W, sump=NE/N, stair=S/SW.
