import { ImageResponse } from "next/og";

// Edge runtime uses the WASM/satori font loader; the Node runtime's default-font
// loader throws ERR_INVALID_URL on Windows (malformed file:// path to noto-sans).
export const runtime = "edge";

export const alt = "Vastukala AI — The Autonomous Architect Platform for India";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand palette
const INDIGO = "#5b53e8"; // hsl(243 75% 59%)
const SAFFRON = "#f59e0b"; // hsl(38 96% 52%)

// A crisp house / blueprint glyph drawn as an inline SVG element.
function HouseGlyph() {
  return (
    <svg
      width="132"
      height="132"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* rounded plate behind the glyph */}
      <rect x="2" y="2" width="96" height="96" rx="22" fill="rgba(91,83,232,0.18)" />
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        rx="21.5"
        stroke="rgba(245,158,11,0.55)"
        strokeWidth="1.5"
      />
      {/* roof */}
      <path
        d="M22 47 L50 24 L78 47"
        stroke={SAFFRON}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* house body */}
      <path
        d="M29 45 L29 76 L71 76 L71 45"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* blueprint floor-plan grid inside */}
      <path d="M50 50 L50 76" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeLinecap="round" />
      <path d="M29 62 L71 62" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeLinecap="round" />
      {/* door */}
      <path d="M38 76 L38 67 L46 67 L46 76" stroke={SAFFRON} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 22px",
        borderRadius: 999,
        fontSize: 22,
        fontWeight: 600,
        color: "#e0e7ff",
        background: "rgba(91,83,232,0.22)",
        border: "1px solid rgba(245,158,11,0.45)",
      }}
    >
      {label}
    </div>
  );
}

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 45%, #0f172a 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* soft saffron radial accent glow (top-right) */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: -220,
            right: -160,
            width: 640,
            height: 640,
            borderRadius: 999,
            background:
              "radial-gradient(circle, rgba(245,158,11,0.38) 0%, rgba(245,158,11,0.10) 42%, rgba(245,158,11,0) 70%)",
          }}
        />
        {/* faint indigo glow (bottom-left) for depth */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: -260,
            left: -180,
            width: 560,
            height: 560,
            borderRadius: 999,
            background:
              "radial-gradient(circle, rgba(91,83,232,0.40) 0%, rgba(91,83,232,0) 70%)",
          }}
        />

        {/* top row: glyph + brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <HouseGlyph />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 84,
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: -2,
                lineHeight: 1,
              }}
            >
              Vastukala AI
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 16,
                fontSize: 32,
                fontWeight: 500,
                color: "#cbd5e1",
              }}
            >
              The Autonomous Architect Platform for India
            </div>
          </div>
        </div>

        {/* middle: pill chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <Chip label="Vastu" />
          <Chip label="Code-aware" />
          <Chip label="CAD" />
          <Chip label="3D" />
          <Chip label="BOQ" />
        </div>

        {/* bottom strip */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              height: 3,
              width: "100%",
              background:
                "linear-gradient(90deg, rgba(245,158,11,0.85) 0%, rgba(91,83,232,0.85) 55%, rgba(91,83,232,0) 100%)",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 500,
              color: "#94a3b8",
            }}
          >
            Vastu-compliant · NBC code-aware · client-ready exports
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
