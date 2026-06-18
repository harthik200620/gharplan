import { createBrowserClient } from "@supabase/ssr";
import { hasSupabaseEnv } from "./env";

export function createClient() {
  if (!hasSupabaseEnv()) {
    return null as any;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
