import { Wizard } from "@/components/wizard/wizard";
import { DEMO_PROFILE, canExport, getOrCreateProfile } from "@/lib/db";
import { emptyPlan } from "@/lib/plan-helpers";
import { createClient } from "@/lib/supabase/server";

export default async function NewProjectPage() {
  const supabase = createClient(); // null in demo mode (no Supabase env)
  let profile = DEMO_PROFILE;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    profile = await getOrCreateProfile(supabase, user!.id, user!.email ?? "");
  }
  return <Wizard initialPlan={emptyPlan()} canExport={canExport(profile)} />;
}
