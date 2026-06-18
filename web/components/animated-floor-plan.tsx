"use client";

import { useEffect, useRef } from "react";

/** Architectural floor plan SVG that animates its lines drawing themselves in,
 *  then slowly pans left-to-right. Opacity is very low — purely textural. */
export function AnimatedFloorPlan({ className = "" }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const paths = svgRef.current?.querySelectorAll<SVGPathElement | SVGCircleElement | SVGLineElement>("path, line, circle, rect");
    if (!paths) return;
    paths.forEach((el, i) => {
      try {
        const len = (el as SVGGeometryElement).getTotalLength?.() ?? 200;
        el.style.strokeDasharray = String(len);
        el.style.strokeDashoffset = String(len);
        el.style.animation = `draw-path ${1.8 + i * 0.18}s ${0.1 + i * 0.12}s cubic-bezier(0.4,0,0.2,1) forwards`;
      } catch {
        el.style.strokeDasharray = "600";
        el.style.strokeDashoffset = "600";
        el.style.animation = `draw-path ${2 + i * 0.2}s ${0.1 + i * 0.12}s ease forwards`;
      }
    });
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      style={{ opacity: 0.07 }}
    >
      {/* Outer plot boundary */}
      <rect x="60" y="60" width="520" height="580" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="3" />

      {/* Master bedroom */}
      <rect x="60" y="60" width="200" height="180" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" />
      <line x1="160" y1="100" x2="160" y2="110" stroke="hsl(243 75% 59%)" strokeWidth="1" />

      {/* Attached toilet */}
      <rect x="60" y="240" width="110" height="100" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" />

      {/* Kids bedroom */}
      <rect x="60" y="340" width="200" height="160" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" />

      {/* Utility / store */}
      <rect x="60" y="500" width="200" height="140" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" />

      {/* Living room */}
      <rect x="260" y="200" width="320" height="220" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" />

      {/* Kitchen */}
      <rect x="400" y="60" width="180" height="140" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" />

      {/* Dining */}
      <rect x="260" y="60" width="140" height="140" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" />

      {/* Pooja room */}
      <rect x="260" y="420" width="100" height="100" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />

      {/* Toilet 2 */}
      <rect x="360" y="420" width="100" height="100" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />

      {/* Sit-out */}
      <rect x="460" y="420" width="120" height="220" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />

      {/* Staircase block */}
      <rect x="170" y="240" width="90" height="100" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />
      <line x1="170" y1="258" x2="260" y2="258" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="170" y1="276" x2="260" y2="276" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="170" y1="294" x2="260" y2="294" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="170" y1="312" x2="260" y2="312" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="170" y1="330" x2="260" y2="330" stroke="hsl(243 75% 59%)" strokeWidth="1" />

      {/* Corridor */}
      <rect x="260" y="340" width="140" height="80" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1" strokeDasharray="6 3" />

      {/* Door swings */}
      <path d="M 160 60 A 60 60 0 0 1 260 120" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="160" y1="60" x2="260" y2="60" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <path d="M 260 340 A 60 60 0 0 0 320 280" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="260" y1="340" x2="260" y2="280" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <path d="M 400 200 A 40 40 0 0 1 440 160" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="400" y1="200" x2="440" y2="200" stroke="hsl(243 75% 59%)" strokeWidth="1" />

      {/* Window marks */}
      <line x1="80" y1="60" x2="140" y2="60" stroke="hsl(38 96% 52%)" strokeWidth="3" />
      <line x1="80" y1="56" x2="80" y2="64" stroke="hsl(38 96% 52%)" strokeWidth="2" />
      <line x1="140" y1="56" x2="140" y2="64" stroke="hsl(38 96% 52%)" strokeWidth="2" />
      <line x1="580" y1="270" x2="580" y2="350" stroke="hsl(38 96% 52%)" strokeWidth="3" />
      <line x1="576" y1="270" x2="584" y2="270" stroke="hsl(38 96% 52%)" strokeWidth="2" />
      <line x1="576" y1="350" x2="584" y2="350" stroke="hsl(38 96% 52%)" strokeWidth="2" />
      <line x1="60" y1="360" x2="60" y2="440" stroke="hsl(38 96% 52%)" strokeWidth="3" />
      <line x1="56" y1="360" x2="64" y2="360" stroke="hsl(38 96% 52%)" strokeWidth="2" />
      <line x1="56" y1="440" x2="64" y2="440" stroke="hsl(38 96% 52%)" strokeWidth="2" />
      <line x1="420" y1="200" x2="500" y2="200" stroke="hsl(38 96% 52%)" strokeWidth="3" />
      <line x1="420" y1="196" x2="420" y2="204" stroke="hsl(38 96% 52%)" strokeWidth="2" />
      <line x1="500" y1="196" x2="500" y2="204" stroke="hsl(38 96% 52%)" strokeWidth="2" />

      {/* Dimension lines */}
      <line x1="60" y1="656" x2="580" y2="656" stroke="hsl(243 75% 59%)" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="60" y1="648" x2="60" y2="664" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="580" y1="648" x2="580" y2="664" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="640" y1="60" x2="640" y2="640" stroke="hsl(243 75% 59%)" strokeWidth="1" strokeDasharray="4 4" />
      <line x1="632" y1="60" x2="648" y2="60" stroke="hsl(243 75% 59%)" strokeWidth="1" />
      <line x1="632" y1="640" x2="648" y2="640" stroke="hsl(243 75% 59%)" strokeWidth="1" />

      {/* North arrow */}
      <circle cx="700" cy="100" r="36" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />
      <path d="M 700 74 L 714 118 L 700 110 L 686 118 Z" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />
      <line x1="700" y1="74" x2="700" y2="110" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />

      {/* Second plan ghost (right side decorative) */}
      <rect x="780" y="120" width="360" height="420" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" />
      <rect x="780" y="120" width="180" height="140" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />
      <rect x="960" y="120" width="180" height="140" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />
      <rect x="780" y="260" width="360" height="160" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />
      <rect x="780" y="420" width="180" height="120" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />
      <rect x="960" y="420" width="180" height="120" fill="none" stroke="hsl(243 75% 59%)" strokeWidth="1.5" />

      {/* Courtyard inside second plan */}
      <rect x="840" y="290" width="240" height="100" fill="none" stroke="hsl(38 96% 52%)" strokeWidth="1" strokeDasharray="5 3" />

      {/* Vastu grid axis lines */}
      <line x1="840" y1="120" x2="840" y2="540" stroke="hsl(243 75% 59%)" strokeWidth="0.5" strokeDasharray="2 8" />
      <line x1="900" y1="120" x2="900" y2="540" stroke="hsl(243 75% 59%)" strokeWidth="0.5" strokeDasharray="2 8" />
      <line x1="960" y1="120" x2="960" y2="540" stroke="hsl(243 75% 59%)" strokeWidth="0.5" strokeDasharray="2 8" />
      <line x1="780" y1="200" x2="1140" y2="200" stroke="hsl(243 75% 59%)" strokeWidth="0.5" strokeDasharray="2 8" />
      <line x1="780" y1="320" x2="1140" y2="320" stroke="hsl(243 75% 59%)" strokeWidth="0.5" strokeDasharray="2 8" />
      <line x1="780" y1="440" x2="1140" y2="440" stroke="hsl(243 75% 59%)" strokeWidth="0.5" strokeDasharray="2 8" />
    </svg>
  );
}
