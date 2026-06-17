// Self-contained 3D review route — renders the world-class 3D from a BAKED plan
// (committed sample-plan.json) so the model loads in any real browser with NO
// engine running. Deployed to Vercel for live 3D review.
"use client";

import dynamic from "next/dynamic";
import type { Plan } from "@gharplan/shared";
import samplePlan from "./sample-plan.json";

// FloorPlan3D mounts a WebGL canvas — load it client-only (no SSR/prerender).
const FloorPlan3D = dynamic(
  () => import("@/components/cad/floor-plan-3d").then((m) => m.FloorPlan3D),
  { ssr: false, loading: () => <div style={{ padding: 24 }}>Loading 3D…</div> },
);

const plan = samplePlan as unknown as Plan;

export default function ThreeDPreviewPage() {
  return (
    <main style={{ position: "fixed", inset: 0, background: "#e8edf3" }}>
      {/* Make the FloorPlan3D wrapper + its r3f container + the <canvas> fill the
          viewport (standalone, the canvas otherwise stays at its 300×150 default). */}
      <style>{`
        .r3d-fill, .r3d-fill > div { width: 100%; height: 100%; }
        .r3d-fill canvas { display: block; width: 100% !important; height: 100% !important; }
      `}</style>
      <div
        style={{
          position: "absolute",
          zIndex: 10,
          top: 12,
          left: 12,
          background: "rgba(255,255,255,0.85)",
          padding: "6px 12px",
          borderRadius: 10,
          font: "600 13px var(--font-sora,sans-serif)",
          color: "#0f172a",
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        GharPlan — 3D review (30×40 East, G+1). Drag to orbit · scroll to zoom.
        <span style={{ display: "block", fontWeight: 400, fontSize: 11, color: "#64748b" }}>
          Indicative visualisation — not an approved/stamped drawing.
        </span>
      </div>
      <FloorPlan3D plan={plan} className="r3d-fill" />
    </main>
  );
}
