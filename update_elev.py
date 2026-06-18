import os
with open(r"c:\archiproj\web\components\cad\elevation-view.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# Add <defs> with material patterns
defs_svg = """<svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", background: "#fff" }} role="img">
      <defs>
        <pattern id="elev-earth" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#a8a29e" strokeWidth="1" />
        </pattern>
        <pattern id="elev-brick" width="16" height="8" patternUnits="userSpaceOnUse">
          <rect x="0" y="0" width="16" height="8" fill="none" />
          <line x1="0" y1="4" x2="16" y2="4" stroke="#d6d3d1" strokeWidth="0.5" />
          <line x1="8" y1="0" x2="8" y2="4" stroke="#d6d3d1" strokeWidth="0.5" />
          <line x1="0" y1="4" x2="0" y2="8" stroke="#d6d3d1" strokeWidth="0.5" />
        </pattern>
        <pattern id="elev-concrete" width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="0.5" fill="#a8a29e" />
          <circle cx="8" cy="6" r="0.8" fill="#a8a29e" />
          <circle cx="4" cy="10" r="0.4" fill="#a8a29e" />
        </pattern>
      </defs>"""
code = code.replace("""<svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", background: "#fff" }} role="img">""", defs_svg)

# Replace ground line with earth pattern
ground_old = """{/* ground line + earth ticks */}
      <line x1={x0 - 24} y1={groundY} x2={x1 + 16} y2={groundY} stroke={INK} strokeWidth={2.8} />
      {Array.from({ length: Math.max(2, Math.round((x1 - x0) / 16)) }).map((_, i) => {
        const gx = x0 + i * 16;
        return <line key={i} x1={gx} y1={groundY} x2={gx - 6} y2={groundY + 7} stroke={INK} strokeWidth={0.8} opacity={0.7} />;
      })}"""
ground_new = """{/* ground line + earth fill */}
      <rect x={0} y={groundY} width={W} height={H - groundY} fill="url(#elev-earth)" opacity={0.3} />
      <line x1={0} y1={groundY} x2={W} y2={groundY} stroke={INK} strokeWidth={3} />"""
code = code.replace(ground_old, ground_new)

# Apply material pattern to the building mass
mass_old = """<rect x={x0} y={Y(top)} width={x1 - x0} height={fflY - Y(top)} fill={WALL_FILL} stroke={INK} strokeWidth={2.2} />"""
mass_new = """<rect x={x0} y={Y(top)} width={x1 - x0} height={fflY - Y(top)} fill={WALL_FILL} />
      <rect x={x0} y={Y(top)} width={x1 - x0} height={fflY - Y(top)} fill="url(#elev-brick)" opacity={0.6} />
      <rect x={x0} y={Y(top)} width={x1 - x0} height={fflY - Y(top)} fill="none" stroke={INK} strokeWidth={2.2} />"""
code = code.replace(mass_old, mass_new)

# Add water tank and human figure
parapet_old = """{/* parapet coping */}"""
parapet_new = """{/* water tank */}
      <rect x={x1 - Math.min(x1-x0, 2 * S)} y={Y(top + 1.2)} width={1.5 * S} height={1.2 * S} fill="#e2e8f0" stroke={INK} strokeWidth={1.5} />
      <line x1={x1 - Math.min(x1-x0, 2.1 * S)} y1={Y(top + 1.2)} x2={x1 - Math.min(x1-x0, 0.4 * S)} y2={Y(top + 1.2)} stroke={INK} strokeWidth={2} />
      <text x={x1 - Math.min(x1-x0, 1.25 * S)} y={Y(top + 0.5)} fontSize={6} textAnchor="middle" fill={INK} fontFamily="var(--font-mono), monospace">WATER TANK</text>
      
      {/* human figure (1.8m tall) */}
      <g transform={`translate(${x0 + Math.min(x1-x0, 1.5 * S)}, ${groundY - 1.8 * S})`} stroke={INK} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Head */}
        <circle cx="0" cy="3" r="3" fill={INK} />
        {/* Body */}
        <line x1="0" y1="6" x2="0" y2="25" />
        {/* Arms */}
        <line x1="0" y1="10" x2="-6" y2="20" />
        <line x1="0" y1="10" x2="6" y2="20" />
        {/* Legs */}
        <line x1="0" y1="25" x2="-5" y2="54" />
        <line x1="0" y1="25" x2="5" y2="54" />
      </g>
      
      {/* parapet coping */}"""
code = code.replace(parapet_old, parapet_new)

# Improve level markers
levels_old = """const levels: { lvl: number; label: string }[] = [{ lvl: 0, label: "+0.000 FFL" }];
  for (let f = 1; f < nFloors; f++) levels.push({ lvl: f * LEVELS.FLOOR_TO_FLOOR, label: `+${(f * 3).toFixed(3)} FFL` });
  levels.push({ lvl: roof, label: `+${roof.toFixed(2)} Roof` });"""
levels_new = """const levels: { lvl: number; label: string }[] = [{ lvl: 0, label: "FFL +0" }];
  for (let f = 1; f < nFloors; f++) levels.push({ lvl: f * LEVELS.FLOOR_TO_FLOOR, label: `FFL +${f * 3000}` });
  levels.push({ lvl: roof, label: `ROOF +${Math.round(roof * 1000)}` });"""
code = code.replace(levels_old, levels_new)

with open(r"c:\archiproj\web\components\cad\elevation-view.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("Updated elevation-view.tsx")
