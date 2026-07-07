import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vastukala AI — The Autonomous Architect Platform for India",
    short_name: "Vastukala AI",
    description:
      "Vastu-compliant, building-code-aware Indian home design with 2D CAD, live 3D, MEP coordination and BOQ.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b14",
    theme_color: "#5b53e8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
