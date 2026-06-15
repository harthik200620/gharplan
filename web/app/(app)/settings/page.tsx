import { SettingsForm } from "@/components/settings-form";
import { getOrCreateProfile } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getOrCreateProfile(supabase, user!.id, user!.email ?? "");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-primary">Settings</h1>
      <SettingsForm profile={profile} />
    </div>
  );
}
