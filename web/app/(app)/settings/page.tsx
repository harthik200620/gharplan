import { SettingsForm } from "@/components/settings-form";
import { DEMO_PROFILE, getOrCreateProfile } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = createClient(); // null in demo mode (no Supabase env)
  let profile = DEMO_PROFILE;
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    profile = await getOrCreateProfile(supabase, user!.id, user!.email ?? "");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Branding shown on your client proposals and BOQ exports.
        </p>
      </div>
      <SettingsForm profile={profile} />
    </div>
  );
}
