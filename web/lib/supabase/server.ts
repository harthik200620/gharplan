import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { hasSupabaseEnv } from "./env";

type SupabaseCookie = { name: string; value: string; options: CookieOptions };

/** Server-side Supabase client (RSC / route handlers). Uses the anon key + user session. */
export function createClient() {
  if (!hasSupabaseEnv()) {
    return null as any;
  }
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: SupabaseCookie[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; middleware refreshes the session.
          }
        },
      },
    },
  );
}

/** Service-role client for privileged server work (gating, webhooks). NEVER import in client code. */
export function createServiceClient() {
  if (!hasSupabaseEnv()) {
    return null as any;
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}
