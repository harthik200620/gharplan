import { redirect } from "next/navigation";
import { AppNav } from "@/components/app-nav";
import { getOrCreateProfile, hasActiveSubscription } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getOrCreateProfile(supabase, user.id, user.email ?? "");

  return (
    <div className="min-h-screen bg-muted/30">
      <AppNav
        studioName={profile.studio_name}
        credits={profile.credits}
        subscribed={hasActiveSubscription(profile)}
      />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl animate-fade-up px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
