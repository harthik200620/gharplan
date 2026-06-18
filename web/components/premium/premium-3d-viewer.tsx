'use client';
import { FloorPlan3D } from '@/components/cad/floor-plan-3d';
import { Plan, Room } from '@gharplan/shared';

// Create a dummy luxury plan for the showcase
const createDemoPlan = (): Plan => {
  const plot = { widthM: 12, depthM: 18, facing: 'East', areaSqyd: 260 };
  
  // A simple dummy room to establish the footprint
  const rooms: Room[] = [
    {
      id: 'r1',
      type: 'living',
      floor: 0,
      polygon: [[2, 2], [10, 2], [10, 14], [2, 14]],
      doors: [],
      windows: [],
      area: 96,
      name: 'Living Room'
    },
    {
      id: 'r2',
      type: 'living',
      floor: 1,
      polygon: [[2, 2], [10, 2], [10, 14], [2, 14]],
      doors: [],
      windows: [],
      area: 96,
      name: 'Upper Living'
    }
  ];

  return {
    id: 'premium-demo',
    variant: 'MODERN_OPEN',
    plot,
    rooms,
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
  };
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
