import { Wizard } from "@/components/wizard/wizard";
import { canExport, getOrCreateProfile } from "@/lib/db";
import { emptyPlan } from "@/lib/plan-helpers";
import { createClient } from "@/lib/supabase/server";

export default async function NewProjectPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getOrCreateProfile(supabase, user!.id, user!.email ?? "");
  return <Wizard initialPlan={emptyPlan()} canExport={canExport(profile)} />;
}
