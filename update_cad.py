import os
with open(r"c:\archiproj\web\components\cad\floor-plan-cad.tsx", "r", encoding="utf-8") as f:
    code = f.read()

code = code.replace("showLabels?: boolean;", "showLabels?: boolean;\n  showVastuGrid?: boolean;")
code = code.replace("showLabels = true,", "showLabels = true,\n  showVastuGrid = false,")

defs_pattern = """<pattern id="cad-grid" width="1" height="1" patternUnits="userSpaceOnUse">"""
new_defs_pattern = """<pattern id="cad-wall-hatch" width="0.12" height="0.12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.12" stroke="#94a3b8" strokeWidth="0.03" />
          </pattern>
          <pattern id="cad-grid" width="1" height="1" patternUnits="userSpaceOnUse">"""
code = code.replace(defs_pattern, new_defs_pattern)

room_rect = """style={{ cursor: onSelect ? "pointer" : "default" }}
              />"""
new_room_rect = """style={{ cursor: onSelect ? "pointer" : "default" }}
              />
              {!isSite && !selected && (
                <rect
                  x={r.x}
                  y={sy(r.y + r.h)}
                  width={r.w}
                  height={r.h}
                  fill="none"
                  stroke="url(#cad-wall-hatch)"
                  strokeWidth={W_INT - 0.5}
                  pointerEvents="none"
                  vectorEffect="non-scaling-stroke"
                />
              )}"""
code = code.replace(room_rect, new_room_rect)

ext_rect = """<rect
          x={0}
          y={0}
          width={W}
          height={D}
          fill="none"
          stroke="#0f172a"
          strokeWidth={W_EXT}
          vectorEffect="non-scaling-stroke"
        />"""
new_ext_rect = """<rect
          x={0}
          y={0}
          width={W}
          height={D}
          fill="none"
          stroke="#0f172a"
          strokeWidth={W_EXT}
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={0}
          y={0}
          width={W}
          height={D}
          fill="none"
          stroke="url(#cad-wall-hatch)"
          strokeWidth={W_EXT - 0.5}
          pointerEvents="none"
          vectorEffect="non-scaling-stroke"
        />"""
code = code.replace(ext_rect, new_ext_rect)

labels_old = """{room.areaSqm.toFixed(1)} m² · {zone}
                  </text>
                )}"""
labels_new = """{room.areaSqm.toFixed(1)} m² · {zone} {floor === 0 ? "· GF" : ""}
                  </text>
                )}"""
code = code.replace(labels_old, labels_new)

dims_old = """{/* DIMENSION STRINGS */}
        {showDimensions && (
          <g pointerEvents="none">
            {/* overall width (south side) */}
            <DimLine x1={0} y1={sy(0) + 0.85} x2={W} y2={sy(0) + 0.85} label={fmtDim(W)} />
            {/* overall depth (west side) */}
            <DimLine x1={-0.85} y1={sy(0)} x2={-0.85} y2={sy(D)} label={fmtDim(D)} vertical />
          </g>
        )}"""
dims_new = """{/* VASTU GRID */}
        {showVastuGrid && (
          <g pointerEvents="none">
            {[1, 2].map((i) => (
              <line key={`v-${i}`} x1={0} y1={sy((D / 3) * i)} x2={W} y2={sy((D / 3) * i)} stroke="#6366f1" strokeWidth={0.8} strokeDasharray="4 4" opacity={0.4} />
            ))}
            {[1, 2].map((i) => (
              <line key={`h-${i}`} x1={(W / 3) * i} y1={0} x2={(W / 3) * i} y2={D} stroke="#6366f1" strokeWidth={0.8} strokeDasharray="4 4" opacity={0.4} />
            ))}
            {[
              {x:1,y:1,l:'SW'},{x:2,y:1,l:'S'},{x:3,y:1,l:'SE'},
              {x:1,y:2,l:'W'},{x:2,y:2,l:'C'},{x:3,y:2,l:'E'},
              {x:1,y:3,l:'NW'},{x:2,y:3,l:'N'},{x:3,y:3,l:'NE'},
            ].map((p, i) => (
              <text key={`vl-${i}`} x={W/6 + (p.x-1)*W/3} y={sy(D/6 + (p.y-1)*D/3)} textAnchor="middle" dominantBaseline="middle" fontSize={0.6} fontWeight="800" fill="#4f46e5" opacity={0.25}>
                {p.l}
              </text>
            ))}
          </g>
        )}

        {/* DIMENSION STRINGS */}
        {showDimensions && (
          <g pointerEvents="none">
            {/* overall dimensions */}
            <DimLine x1={0} y1={sy(0) + 0.85} x2={W} y2={sy(0) + 0.85} label={fmtDim(W)} />
            <DimLine x1={-0.85} y1={sy(0)} x2={-0.85} y2={sy(D)} label={fmtDim(D)} vertical />
            
            {/* major room widths along bottom */}
            {shownRooms.map((room, i) => {
              if (VIRTUAL.has(room.type)) return null;
              const r = bounds(room.polygon);
              if (r.y < 0.5 && r.w > 1.5) {
                return <DimLine key={`dw-${i}`} x1={r.x} y1={sy(0) + 0.45} x2={r.x + r.w} y2={sy(0) + 0.45} label={fmtDim(r.w)} />;
              }
              return null;
            })}
            
            {/* major room depths along left */}
            {shownRooms.map((room, i) => {
              if (VIRTUAL.has(room.type)) return null;
              const r = bounds(room.polygon);
              if (r.x < 0.5 && r.h > 1.5) {
                return <DimLine key={`dh-${i}`} x1={-0.45} y1={sy(r.y)} x2={-0.45} y2={sy(r.y + r.h)} label={fmtDim(r.h)} vertical />;
              }
              return null;
            })}
          </g>
        )}
        
        {/* TITLE BLOCK */}
        <g transform={`translate(0, ${sy(0) + 1.4})`} fontSize={0.22} fill="#334155" fontFamily="var(--font-mono), monospace">
          <rect x={0} y={0} width={W} height={0.5} fill="none" stroke="#0f172a" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <line x1={W * 0.3} y1={0} x2={W * 0.3} y2={0.5} stroke="#0f172a" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <line x1={W * 0.55} y1={0} x2={W * 0.55} y2={0.5} stroke="#0f172a" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <line x1={W * 0.75} y1={0} x2={W * 0.75} y2={0.5} stroke="#0f172a" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <text x={0.1} y={0.3}>Project: GHARPLAN CAD</text>
          <text x={W * 0.3 + 0.1} y={0.3}>Client: Professional</text>
          <text x={W * 0.55 + 0.1} y={0.3}>Scale: 1:100</text>
          <text x={W * 0.75 + 0.1} y={0.3}>Floor: {floor === 0 ? "GROUND" : "UPPER"}</text>
        </g>
        
        {/* NORTH ARROW (Architectural) */}
        <g transform={`translate(${W + 0.4}, ${sy(D) + 0.4})`}>
          <circle cx={0} cy={0} r={0.3} fill="none" stroke="#0f172a" strokeWidth={0.04} />
          <path d="M -0.3 0 A 0.3 0.3 0 0 1 0.3 0 Z" fill="#0f172a" />
          <polygon points="-0.1,0.1 0,-0.4 0.1,0.1" fill="#0f172a" />
          <text x={0} y={0.5} textAnchor="middle" fontSize={0.2} fontWeight="800" fill="#0f172a" fontFamily="var(--font-sora), sans-serif">N</text>
        </g>
"""
code = code.replace(dims_old, dims_new)

north_old = """{/* ---- screen-space overlay chrome ---- */}
      <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-center gap-1 rounded-lg bg-white/85 px-2 py-1.5 text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        <svg width="22" height="30" viewBox="-11 -2 22 30">
          <line x1="0" y1="26" x2="0" y2="2" stroke="#0f172a" strokeWidth="1.5" />
          <path d="M -4 8 L 0 0 L 4 8 Z" fill="#4f46e5" />
          <text x="0" y="-4" textAnchor="middle" fontSize="9" fontWeight="800" fill="#0f172a">
            N
          </text>
        </svg>
      </div>"""
code = code.replace(north_old, "{/* ---- screen-space overlay chrome ---- */}")

margin_old = """const mL = 1.6;
    const mR = 0.8;
    const mT = 0.8;
    const mB = 1.6;"""
margin_new = """const mL = 1.6;
    const mR = 1.2;
    const mT = 0.8;
    const mB = 2.4;"""
code = code.replace(margin_old, margin_new)

with open(r"c:\archiproj\web\components\cad\floor-plan-cad.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("Updated floor-plan-cad.tsx")
