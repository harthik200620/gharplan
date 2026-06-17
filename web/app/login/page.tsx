"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  async function withEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (mode === "signup") {
        toast.success("Account created. Check your email if confirmation is required.");
      }
      router.push(next);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function withGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) toast.error(error.message);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.4]" />
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo href="/" />
          <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create your workspace"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to your studio workspace."
              : "Start designing Vastu-correct, costed plans."}
          </p>
        </div>
        <Card className="shadow-premium">
          <CardContent className="space-y-4 p-6">
            <Button variant="outline" className="w-full" onClick={withGoogle}>
              Continue with Google
            </Button>
            <div className="relative text-center text-xs text-muted-foreground">
              <span className="bg-card px-2">or</span>
              <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
            </div>
            <form onSubmit={withEmail} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button variant="brand" type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
              </Button>
            </form>
            <button
              className="w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
