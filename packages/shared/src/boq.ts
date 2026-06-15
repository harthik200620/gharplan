// BOQ contract — mirrors /engine/app/models/boq.py. Money is serialized as a
// JSON number (rupees, 2dp) for the web; the engine computes it in Decimal.

import type { City, FinishTier } from "./plan";

export interface BoqLine {
  id: string;
  roomId?: string | null;
  roomLabel?: string | null;
  roomType?: string | null;
  trade: string;
  itemCode: string;
  description: string;
  unit: string;
  qty: number;
  materialRate: number;
  labourRate: number;
  rate: number;
  amount: number;
  hsnCode: string;
  gstPercent: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  total: number;
  edited: boolean;
}

export interface BoqGroup {
  key: string;
  label: string;
  lineIds: string[];
  subtotal: number;
  gstTotal: number;
  total: number;
}

export interface BoqSummary {
  subtotal: number;
  gstTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  grandTotal: number;
  lineCount: number;
}

export interface BoqReport {
  city: City;
  finishTier: FinishTier;
  currency: string;
  lines: BoqLine[];
  byRoom: BoqGroup[];
  byTrade: BoqGroup[];
  summary: BoqSummary;
  warnings: string[];
  disclaimer: string;
}

export interface LineOverride {
  lineId: string;
  qty?: number;
  materialRate?: number;
  labourRate?: number;
}

export interface ExtraLine {
  roomId?: string | null;
  trade: string;
  itemCode: string;
  description: string;
  unit: string;
  qty: number;
  materialRate: number;
  labourRate: number;
  hsnCode: string;
  gstPercent: number;
}

export interface BoqOptions {
  falseCeilingRoomIds: string[];
  removeLineIds: string[];
}

export interface BoqRequest {
  plan: import("./plan").Plan;
  city?: City | null;
  finishTier: FinishTier;
  options?: BoqOptions;
  overrides?: LineOverride[];
  extraLines?: ExtraLine[];
}
