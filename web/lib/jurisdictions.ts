// Mirror of fixtures/jurisdictions.json (kept in lock-step by hand — the web
// bundle can't import outside its root). State -> district -> ULB city, each
// mapping to the engine rule-pack id sent as `ulbHint`. The engine's City enum
// only carries the four anchor cities, so non-enum ULBs post their state's
// anchor city + the pack id (the resolver gives ulbHint precedence).
import type { City, StateCode } from "@gharplan/shared";

export type UlbCity = { packId: string };
export type District = { cities: Record<string, UlbCity> };
export type StateEntry = { label: string; districts: Record<string, District> };

export const JURISDICTIONS: Record<string, StateEntry> = {
  TG: {
    label: "Telangana",
    districts: {
      Hyderabad: { cities: { Hyderabad: { packId: "tg-ghmc" } } },
      Warangal: { cities: { Warangal: { packId: "tg-ulb-common" } } },
      Nizamabad: { cities: { Nizamabad: { packId: "tg-ulb-common" } } },
      Karimnagar: { cities: { Karimnagar: { packId: "tg-ulb-common" } } },
    },
  },
  AP: {
    label: "Andhra Pradesh",
    districts: {
      Chittoor: { cities: { Tirupati: { packId: "ap-tuda" } } },
      Visakhapatnam: { cities: { Visakhapatnam: { packId: "ap-vmrda" } } },
      NTR: { cities: { Vijayawada: { packId: "ap-crda" } } },
      Guntur: { cities: { Guntur: { packId: "ap-crda" } } },
      Krishna: { cities: { Machilipatnam: { packId: "ap-dpms-common" } } },
      Kurnool: { cities: { Kurnool: { packId: "ap-dpms-common" } } },
    },
  },
  KA: {
    label: "Karnataka",
    districts: {
      "Bengaluru Urban": { cities: { Bengaluru: { packId: "ka-legacy" } } },
    },
  },
};

/** Engine City-enum anchor per state (used when the real ULB isn't in the enum). */
export const ANCHOR_CITY: Record<string, City> = {
  KA: "Bengaluru",
  TG: "Hyderabad",
  AP: "Tirupati",
};

/** Human label for the governing authority behind a pack id. */
export const AUTHORITY_LABEL: Record<string, string> = {
  "tg-ghmc": "GHMC · TG-bPASS",
  "tg-ulb-common": "TG ULB · TG-bPASS",
  "ap-tuda": "TUDA · AP DPMS",
  "ap-vmrda": "VMRDA · AP DPMS",
  "ap-crda": "APCRDA · AP DPMS",
  "ap-dpms-common": "AP DPMS",
  "ka-legacy": "BBMP (state baseline)",
};

/** Find (state, district) for a ULB city name, or null. */
export function locateCity(cityName: string): { state: StateCode; district: string; packId: string } | null {
  for (const [state, entry] of Object.entries(JURISDICTIONS)) {
    for (const [district, d] of Object.entries(entry.districts)) {
      if (cityName in d.cities) {
        return { state: state as StateCode, district, packId: d.cities[cityName].packId };
      }
    }
  }
  return null;
}
