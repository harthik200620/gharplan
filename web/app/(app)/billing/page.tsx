import { BillingClient } from "@/components/billing-client";
import { getOrCreateProfile, hasActiveSubscription } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function BillingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = await getOrCreateProfile(supabase, user!.id, user!.email ?? "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Billing</h1>
        <p className="text-sm text-muted-foreground">Credits unlock exports. Subscribe for volume.</p>
      </div>
      <BillingClient
        credits={profile.credits}
        subscribed={hasActiveSubscription(profile)}
        planLabel={profile.subscription_plan}
      />
    </div>
  );
}
