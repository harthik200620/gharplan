import os
with open(r"c:\archiproj\web\components\cad\elevation-view.tsx", "r", encoding="utf-8") as f:
    code = f.read()

win_old = """<rect x={ax} y={tY} width={bx - ax} height={bY - tY} fill={isDoor ? "#b98a52" : GLASS} stroke={INK} strokeWidth={1.4} />
            {/* mullion / panel lines */}
            {isDoor ? (
              <line x1={(ax + bx) / 2} y1={tY} x2={(ax + bx) / 2} y2={bY} stroke={INK} strokeWidth={0.9} />
            ) : (
              <>
                <line x1={(ax + bx) / 2} y1={tY} x2={(ax + bx) / 2} y2={bY} stroke={INK} strokeWidth={0.7} />
                <line x1={ax} y1={(tY + bY) / 2} x2={bx} y2={(tY + bY) / 2} stroke={INK} strokeWidth={0.7} />
              </>
            )}"""
win_new = """{isDoor ? (
              <>
                <rect x={ax} y={tY} width={bx - ax} height={bY - tY} fill="#b98a52" stroke={INK} strokeWidth={1.4} />
                <line x1={(ax + bx) / 2} y1={tY} x2={(ax + bx) / 2} y2={bY} stroke={INK} strokeWidth={0.9} />
              </>
            ) : (
              <>
                <rect x={ax} y={tY} width={bx - ax} height={bY - tY} fill="#cfe4f3" fillOpacity={0.4} stroke={INK} strokeWidth={1.6} />
                {/* inner frame */}
                <rect x={ax + 2} y={tY + 2} width={bx - ax - 4} height={bY - tY - 4} fill="none" stroke={INK} strokeWidth={0.8} />
                <line x1={(ax + bx) / 2} y1={tY} x2={(ax + bx) / 2} y2={bY} stroke={INK} strokeWidth={1.2} />
                <line x1={ax} y1={(tY + bY) / 2} x2={bx} y2={(tY + bY) / 2} stroke={INK} strokeWidth={1.2} />
                {/* sill line */}
                <line x1={ax - 4} y1={bY} x2={bx + 4} y2={bY} stroke={INK} strokeWidth={2.4} />
              </>
            )}"""
code = code.replace(win_old, win_new)

with open(r"c:\archiproj\web\components\cad\elevation-view.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("Updated elevation windows")
