import type { MetadataRoute } from "next";

const BASE = "https://vastukala.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/studio", priority: 0.9 },
    { path: "/demo", priority: 0.7 },
    { path: "/3d-preview", priority: 0.7 },
    { path: "/login", priority: 0.4 },
  ];
  return routes.map(({ path, priority }) => ({
    url: `${BASE}${path}`,
    changeFrequency: "weekly",
    priority,
  }));
}
