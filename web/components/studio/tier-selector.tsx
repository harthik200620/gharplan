'use client';
import React from 'react';

export type PlanTier = 'economy' | 'standard' | 'premium';

interface TierSelectorProps {
  selected: PlanTier;
  onChange: (tier: PlanTier) => void;
  plotAreaSqyd?: number;
}

const TIERS = [
  {
    id: 'economy' as PlanTier,
    name: 'Basic',
    tagline: 'Comfortable & Code-Compliant',
    price_per_sqft: '₹1,200–1,800/sqft',
    budget_range: '₹25L–60L',
    icon: '🏠',
    color: '#64748b',
    gradient: 'linear-gradient(135deg, #1e293b, #334155)',
    highlights: [
      'AAC block / burnt brick walls',
      'Vitrified tile flooring',
      'OBD paint finish',
      'Flush doors + aluminum windows',
      'Basic modular kitchen',
      'Standard bathroom fittings',
      'RCC G+1 construction',
    ],
    construction_specs: {
      walls: 'AAC blocks / 9" burnt brick',
      flooring: 'Vitrified tiles 600×600mm',
      kitchen: 'Basic modular, granite top',
      bathrooms: 'Parryware/Hindware fittings',
      windows: 'Powder-coated aluminum sliding',
      doors: 'Flush doors, sal wood frame',
      ceiling: 'POP punning',
      exterior: 'Snowcem paint / texture',
      structure: 'RCC frame with M20 concrete',
    },
    vastu_approach: 'Standard Vastu compliance',
    bhk_range: '1-3 BHK',
    visual_style: 'indian_traditional',
    badge: null,
  },
  {
    id: 'standard' as PlanTier,
    name: 'Standard',
    tagline: 'Modern Quality Living',
    price_per_sqft: '₹1,800–2,800/sqft',
    budget_range: '₹60L–1.5Cr',
    icon: '🏡',
    color: '#3b82f6',
    gradient: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)',
    highlights: [
      'Double-glazed UPVC windows',
      'Italian/Spanish vitrified tiles',
      'Textured acrylic exterior paint',
      'Solid wood veneer doors',
      'Modular kitchen with chimney',
      'CP Jaguar/Grohe bathroom fittings',
      'False ceiling with concealed LED',
      'Aluminium railing staircase',
    ],
    construction_specs: {
      walls: '6" AAC block with external insulation',
      flooring: 'Large format 800×800mm glazed vitrified',
      kitchen: 'Full modular with island option, SS sink',
      bathrooms: 'Jaguar/Roca fittings, shower enclosure',
      windows: 'UPVC double-glazed, tilt & turn',
      doors: 'Engineered wood veneer, concealed hinges',
      ceiling: 'Gypsum false ceiling with LED profile',
      exterior: 'ACE/Asian Paints textured finish',
      structure: 'RCC frame with M25 concrete, TMT Fe-500',
    },
    vastu_approach: 'Full Vastu optimization + Ayadi calculation',
    bhk_range: '2-4 BHK',
    visual_style: 'modern_contemporary',
    badge: 'Most Popular',
  },
  {
    id: 'premium' as PlanTier,
    name: 'Premium',
    tagline: 'Ultra-Luxury Glass House',
    price_per_sqft: '₹3,500–6,000+/sqft',
    budget_range: '₹1.5Cr–5Cr+',
    icon: '🏰',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #451a03, #92400e, #d97706)',
    highlights: [
      'Floor-to-ceiling structural glazing',
      'Exposed architectural steel frame',
      'Italian Calacatta marble flooring',
      'Smart home (KNX/Lutron automation)',
      'German kitchen (Hacker/Häcker)',
      'Kohler/Hansgrohe/Villeroy&Boch',
      'Double-height living volume',
      'Infinity pool / rooftop deck',
      'Landscaped gardens with water feature',
      'Home theatre + gym + wine room',
    ],
    construction_specs: {
      walls: 'Structural steel frame + glass curtain wall system',
      flooring: 'Calacatta Oro marble / Belgian engineered wood',
      kitchen: 'Hacker / Häcker German modular + Miele appliances',
      bathrooms: 'Kohler / Hansgrohe / Villeroy&Boch, rain shower + steam',
      windows: 'Schüco aluminum curtain wall system, triple-glazed',
      doors: '3m pivot doors in teak + glass / full-glass',
      ceiling: 'Acoustic gypsum / polished concrete / coffered teak',
      exterior: 'Glass curtain wall + architectural stone cladding',
      structure: 'RCC + structural steel hybrid, M30 concrete',
    },
    vastu_approach: 'Master Vastu + Ayadi + Marma point protection',
    bhk_range: '3-5 BHK + Staff quarters',
    visual_style: 'ultra_luxury_glass',
    badge: '⭐ Ultimate',
  },
];

export function TierSelector({ selected, onChange, plotAreaSqyd }: TierSelectorProps) {
  return (
    <div className="tier-selector">
      <h3 className="tier-title">Choose Your Build Quality</h3>
      <p className="tier-subtitle">The same floor plan — three completely different worlds</p>
      <div className="tier-cards">
        {TIERS.map(tier => (
          <button
            key={tier.id}
            className={`tier-card ${selected === tier.id ? 'selected' : ''} tier-${tier.id}`}
            onClick={() => onChange(tier.id)}
          >
            {tier.badge && <span className="tier-badge">{tier.badge}</span>}
            <div className="tier-icon">{tier.icon}</div>
            <div className="tier-name">{tier.name}</div>
            <div className="tier-tagline">{tier.tagline}</div>
            <div className="tier-price">{tier.price_per_sqft}</div>
            <div className="tier-budget">{tier.budget_range} total est.</div>
            <ul className="tier-highlights">
              {tier.highlights.slice(0, 5).map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
            {selected === tier.id && <div className="tier-selected-indicator">✓ Selected</div>}
          </button>
        ))}
      </div>

      {/* Scoped CSS via dangerouslySetInnerHTML so React doesn't reconcile the
          style text node — avoids the SSR/client apostrophe-encoding mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .tier-selector { margin: 16px 0; }
        .tier-title { font-size: 1rem; font-weight: 700; color: #f1f5f9; margin: 0 0 4px; }
        .tier-subtitle { font-size: 0.78rem; color: #64748b; margin: 0 0 16px; }
        .tier-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        @media (max-width: 900px) { .tier-cards { grid-template-columns: 1fr; } }
        .tier-card {
          position: relative; text-align: left; border-radius: 12px;
          padding: 16px; border: 2px solid #1e293b; cursor: pointer;
          background: #0f1117; transition: all 0.25s; color: #94a3b8;
          width: 100%;
        }
        .tier-card:hover { border-color: #334155; background: #131a24; transform: translateY(-2px); }
        .tier-card.selected { border-color: var(--tier-color, #3b82f6); background: var(--tier-bg, #1e3a5f22); box-shadow: 0 0 0 1px var(--tier-color, #3b82f6), 0 8px 32px rgba(0,0,0,0.2); }
        .tier-economy { --tier-color: #64748b; --tier-bg: #1e29355a; }
        .tier-standard { --tier-color: #3b82f6; --tier-bg: #1e3a5f2a; }
        .tier-premium { --tier-color: #f59e0b; --tier-bg: #451a032a; }
        .tier-badge { position: absolute; top: -8px; right: 12px; background: var(--tier-color); color: #fff; font-size: 0.65rem; font-weight: 700; padding: 3px 8px; border-radius: 20px; }
        .tier-icon { font-size: 1.8rem; margin-bottom: 8px; }
        .tier-name { font-size: 1.1rem; font-weight: 800; color: var(--tier-color, #f1f5f9); margin-bottom: 2px; }
        .tier-tagline { font-size: 0.72rem; color: #64748b; margin-bottom: 8px; }
        .tier-price { font-size: 0.85rem; font-weight: 700; color: #f1f5f9; }
        .tier-budget { font-size: 0.68rem; color: #475569; margin-bottom: 10px; }
        .tier-highlights { list-style: none; padding: 0; margin: 0; }
        .tier-highlights li { font-size: 0.72rem; color: #94a3b8; padding: 2px 0; display: flex; align-items: center; gap: 4px; }
        .tier-highlights li::before { content: '✦'; color: var(--tier-color, #64748b); font-size: 0.5rem; flex-shrink: 0; }
        .tier-selected-indicator { margin-top: 10px; font-size: 0.75rem; font-weight: 700; color: var(--tier-color); }
      `}} />
    </div>
  );
}

export { TIERS };
export default TierSelector;
