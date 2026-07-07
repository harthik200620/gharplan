import Link from "next/link";
import { ArrowRight, Building2, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectRow } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createClient(); // null in demo mode (no Supabase env)
  let projects: Pick<ProjectRow, "id" | "name" | "client_name" | "plan" | "updated_at">[] = [];
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("projects")
      .select("id, name, client_name, plan, updated_at")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false });
    projects = (data ?? []) as Pick<ProjectRow, "id" | "name" | "client_name" | "plan" | "updated_at">[];
  }

  return (
    <div className="space-y-8">
      {/* AI CTA */}
      <Link href="/studio" className="group block">
        <div className="relative overflow-hidden rounded-2xl bg-brand-gradient px-6 py-7 text-white shadow-glow transition-all group-hover:shadow-[0_16px_48px_-12px_hsl(var(--primary)/0.6)] sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(28rem_18rem_at_85%_-30%,rgba(255,255,255,0.22),transparent)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <Badge variant="accent" className="mb-3 border-white/20 bg-white/15 text-white">
                <Sparkles className="h-3 w-3" /> AI design
              </Badge>
              <h2 className="font-display text-2xl font-bold tracking-tight">Design with AI</h2>
              <p className="mt-1 max-w-md text-sm text-white/85">
                Describe the plot in one sentence and get a Vastu-zoned, code-aware floor plan with a costed BOQ in seconds.
              </p>
            </div>
            <Button
              size="lg"
              className="shrink-0 bg-white text-primary shadow-soft hover:bg-white/90"
            >
              Open AI Studio <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </div>
        </div>
      </Link>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Draw a plan, review Vastu &amp; code, generate a costed BOQ.
          </p>
        </div>
        <Button asChild variant="brand">
          <Link href="/projects/new">
            <Plus className="h-4 w-4" /> New project
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Building2 className="h-7 w-7" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Start your first plan or design one with AI.</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild variant="brand">
                <Link href="/projects/new">
                  <Plus className="h-4 w-4" /> New project
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/studio">
                  <Sparkles className="h-4 w-4" /> Design with AI
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="group">
              <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-premium">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{p.client_name || "—"}</p>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="font-mono tabular-nums">
                    {p.plan?.plot?.widthM}×{p.plan?.plot?.depthM} m · {p.plan?.plot?.facing}-facing · {p.plan?.plot?.city}
                  </div>
                  <div>
                    {p.plan?.rooms?.length ?? 0} rooms · updated{" "}
                    {new Date(p.updated_at).toLocaleDateString("en-IN")}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
