import type { Plan, Point, Room, RoomType } from "@gharplan/shared";
import { ROOM_LABELS, ROOM_TYPES } from "@gharplan/shared";
import { rectPolygon } from "./geometry";
import { uid } from "./utils";

export const ROOM_TYPE_OPTIONS = ROOM_TYPES.map((t) => ({ value: t, label: ROOM_LABELS[t] }));

// Pale fills for the Vastu-zone plan overlay (match the PDF export palette).
export const ZONE_FILL: Record<string, string> = {
  N: "#E3F2FD",
  NE: "#E0F7FA",
  E: "#E8F5E9",
  SE: "#FFF3E0",
  S: "#FBE9E7",
  SW: "#EFEBE9",
  W: "#F3E5F5",
  NW: "#EDE7F6",
  CENTER: "#FFFDE7",
};

export const STATUS_FILL: Record<string, string> = {
  pass: "#DCFCE7",
  warn: "#FEF3C7",
  fail: "#FEE2E2",
};

export const STATUS_TEXT: Record<string, string> = {
  pass: "text-ok",
  warn: "text-warn",
  fail: "text-bad",
};

export function emptyPlan(name = "Untitled project"): Plan {
  return {
    schemaVersion: "1.0",
    project: { id: uid("prj"), name, createdAt: new Date().toISOString() },
    plot: {
      widthM: 9.144,
      depthM: 12.192,
      areaSqm: 111.484,
      facing: "E",
      state: "KA",
      city: "Bengaluru",
      floors: 1,
    },
    rooms: [],
    doors: [],
    windows: [],
  };
}

export function newRoom(type: RoomType, rect: [number, number, number, number]): Room {
  return {
    id: uid("room"),
    type,
    polygon: rectPolygon(rect[0], rect[1], rect[2], rect[3]),
    areaSqm: 0,
    perimeterM: 0,
    centroid: null,
    zone: null,
    ceilingHeightM: 3.0,
  };
}

export function roomBounds(poly: Point[]): [number, number, number, number] {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
