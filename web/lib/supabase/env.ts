// True when Supabase is configured. When false, the app runs in a local
// "demo mode" (no auth, no persistence) so it can be tried without a backend.
export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
