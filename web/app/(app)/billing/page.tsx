import { BillingClient } from "@/components/billing-client";
import { DEMO_PROFILE, getOrCreateProfile, hasActiveSubscription } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function BillingPage() {
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
        <h1 className="font-display text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Credits unlock exports. Subscribe for volume.</p>
      </div>
      <BillingClient
        credits={profile.credits}
        subscribed={hasActiveSubscription(profile)}
        planLabel={profile.subscription_plan}
      />
    </div>
  );
}
