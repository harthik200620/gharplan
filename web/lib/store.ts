import { create } from "zustand";
import type { Opening, Plan, Plot, Project, Room } from "@gharplan/shared";
import { area, centroid, perimeter, rectPolygon, zoneOf } from "./geometry";
import { emptyPlan, newRoom } from "./plan-helpers";
import { uid } from "./utils";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Recompute all geometry-derived fields client-side (live UX; engine is authoritative). */
export function recompute(plan: Plan): Plan {
  const { widthM, depthM } = plan.plot;
  return {
    ...plan,
    plot: { ...plan.plot, areaSqm: r3(widthM * depthM) },
    rooms: plan.rooms.map((room) => {
      const c = centroid(room.polygon);
      return {
        ...room,
        areaSqm: r3(area(room.polygon)),
        perimeterM: r3(perimeter(room.polygon)),
        centroid: [r4(c[0]), r4(c[1])],
        zone: zoneOf(c[0], c[1], widthM, depthM),
      };
    }),
  };
}

type WizardStore = {
  plan: Plan;
  setPlan: (plan: Plan) => void;
  reset: (plan?: Plan) => void;
  setProjectField: (patch: Partial<Project>) => void;
  setPlot: (patch: Partial<Plot>) => void;
  addRoom: (room: Room) => void;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  setRoomRect: (id: string, x0: number, y0: number, x1: number, y1: number) => void;
  removeRoom: (id: string) => void;
  addOpening: (kind: "door" | "window", roomId: string) => void;
  updateOpening: (kind: "door" | "window", id: string, patch: Partial<Opening>) => void;
  removeOpening: (kind: "door" | "window", id: string) => void;
};

export const useWizard = create<WizardStore>((set) => ({
  plan: recompute(emptyPlan()),
  setPlan: (plan) => set({ plan: recompute(plan) }),
  reset: (plan) => set({ plan: recompute(plan ?? emptyPlan()) }),
  setProjectField: (patch) =>
    set((s) => ({ plan: { ...s.plan, project: { ...s.plan.project, ...patch } } })),
  setPlot: (patch) => set((s) => ({ plan: recompute({ ...s.plan, plot: { ...s.plan.plot, ...patch } }) })),
  addRoom: (room) => set((s) => ({ plan: recompute({ ...s.plan, rooms: [...s.plan.rooms, room] }) })),
  updateRoom: (id, patch) =>
    set((s) => ({
      plan: recompute({
        ...s.plan,
        rooms: s.plan.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }),
    })),
  setRoomRect: (id, x0, y0, x1, y1) =>
    set((s) => ({
      plan: recompute({
        ...s.plan,
        rooms: s.plan.rooms.map((r) =>
          r.id === id ? { ...r, polygon: rectPolygon(x0, y0, x1, y1) } : r,
        ),
      }),
    })),
  removeRoom: (id) =>
    set((s) => ({
      plan: recompute({
        ...s.plan,
        rooms: s.plan.rooms.filter((r) => r.id !== id),
        doors: s.plan.doors.filter((o) => o.roomId !== id),
        windows: s.plan.windows.filter((o) => o.roomId !== id),
      }),
    })),
  addOpening: (kind, roomId) =>
    set((s) => {
      const opening: Opening = {
        id: uid(kind),
        roomId,
        kind,
        widthM: kind === "door" ? 0.9 : 1.2,
        heightM: kind === "door" ? 2.1 : 1.2,
        count: 1,
      };
      const key = kind === "door" ? "doors" : "windows";
      return { plan: { ...s.plan, [key]: [...s.plan[key], opening] } };
    }),
  updateOpening: (kind, id, patch) =>
    set((s) => {
      const key = kind === "door" ? "doors" : "windows";
      return {
        plan: { ...s.plan, [key]: s.plan[key].map((o) => (o.id === id ? { ...o, ...patch } : o)) },
      };
    }),
  removeOpening: (kind, id) =>
    set((s) => {
      const key = kind === "door" ? "doors" : "windows";
      return { plan: { ...s.plan, [key]: s.plan[key].filter((o) => o.id !== id) } };
    }),
}));

export { newRoom };
