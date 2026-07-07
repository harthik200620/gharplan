import type { Branding, Plan } from "@gharplan/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  studio_name: string;
  address: string;
  gstin: string;
  phone: string;
  email: string;
  website: string;
  logo_data_url: string | null;
  terms: string;
  credits: number;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
};

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  client_name: string | null;
  plan: Plan;
  created_at: string;
  updated_at: string;
};

const DEFAULT_TERMS =
  "1. This proposal is indicative and valid for 15 days. 2. Rates are subject to final measurement and site conditions. 3. GST as applicable. 4. This is not an approved or stamped drawing.";

/** Fetch the caller's profile, creating a default row on first login. */
export async function getOrCreateProfile(supabase: SupabaseClient, userId: string, email: string): Promise<Profile> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data as Profile;
  const seed: Partial<Profile> = {
    id: userId,
    studio_name: "Your Studio",
    email,
    terms: DEFAULT_TERMS,
    credits: 1, // one free export-ready plan to try
  };
  const { data: created } = await supabase.from("profiles").insert(seed).select("*").single();
  return created as Profile;
}

export function brandingFromProfile(p: Profile): Branding {
  return {
    studioName: p.studio_name || "Your Studio",
    address: p.address || "",
    gstin: p.gstin || "",
    phone: p.phone || "",
    email: p.email || "",
    website: p.website || "",
    logoDataUrl: p.logo_data_url,
    terms: p.terms || DEFAULT_TERMS,
  };
}

/** Stand-in profile when Supabase env is absent (demo mode) — keeps the (app)
    pages renderable/prerenderable without auth; nothing is persisted. */
export const DEMO_PROFILE: Profile = {
  id: "demo",
  studio_name: "Demo Studio",
  address: "",
  gstin: "",
  phone: "",
  email: "demo@vastukala.local",
  website: "",
  logo_data_url: null,
  terms: "",
  credits: 99,
  subscription_plan: "demo",
  subscription_status: "active",
  subscription_period_end: null,
};

export function hasActiveSubscription(p: Profile): boolean {
  if (p.subscription_status !== "active") return false;
  if (!p.subscription_period_end) return true;
  return new Date(p.subscription_period_end).getTime() > Date.now();
}

/** True if the user can export (active sub OR >=1 credit). */
export function canExport(p: Profile): boolean {
  return hasActiveSubscription(p) || (p.credits ?? 0) > 0;
}
