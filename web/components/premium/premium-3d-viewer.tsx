'use client';
import { FloorPlan3D } from '@/components/cad/floor-plan-3d';
import { Plan, Room } from '@gharplan/shared';

// Create a dummy luxury plan for the showcase
const createDemoPlan = (): Plan => {
  const plot = {
    widthM: 12,
    depthM: 18,
    facing: 'E' as const,
    areaSqm: 216,
    state: 'KA' as const,
    city: 'Bengaluru' as const,
    floors: 2,
  };
  
  // A simple dummy room to establish the footprint
  const rooms: Room[] = [
    {
      id: 'r1',
      type: 'living',
      floor: 0,
      polygon: [[2, 2], [10, 2], [10, 14], [2, 14]],
      areaSqm: 96,
      perimeterM: 32,
      ceilingHeightM: 2.75,
    },
    {
      id: 'r2',
      type: 'living',
      floor: 1,
      polygon: [[2, 2], [10, 2], [10, 14], [2, 14]],
      areaSqm: 96,
      perimeterM: 32,
      ceilingHeightM: 2.75,
    }
  ];

  return {
    schemaVersion: "1.0",
    project: {
      id: 'p1',
      name: 'Premium Demo Project',
      clientName: 'Luxury Client',
    },
    plot,
    rooms,
    doors: [],
    windows: [],
    // Add extended fields as any for the 3D viewer
    id: 'premium-demo',
    variant: 'MODERN_OPEN',
    stats: {
      totalAreaSqm: 192,
      totalAreaSqft: 2066,
      builtUpAreaSqm: 192,
      groundCoveragePct: 44,
      far: 0.88,
      bhk: 4
    },
    scores: {
      vastu: 95,
      code: 100,
      climate: 90
    },
    costEstLakhs: {
      economy: 50,
      standard: 80,
      premium: 200
    }
  } as any;
};

export default function Premium3DViewer() {
  const plan = createDemoPlan();
  
  return (
    <div className="w-full h-full">
      <FloorPlan3D 
        plan={plan} 
        finishTier="premium" 
        className="w-full h-full min-h-[500px]" 
      />
    </div>
  );
}
