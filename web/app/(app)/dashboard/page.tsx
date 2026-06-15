import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectRow } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("projects")
    .select("id, name, client_name, plan, updated_at")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false });
  const projects = (data ?? []) as Pick<ProjectRow, "id" | "name" | "client_name" | "plan" | "updated_at">[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Projects</h1>
          <p className="text-sm text-muted-foreground">Draw a plan, review Vastu &amp; code, generate a costed BOQ.</p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="h-4 w-4" /> New project
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No projects yet. Start your first plan.</p>
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="h-4 w-4" /> New project
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{p.client_name || "—"}</p>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  <div>
                    {p.plan?.plot?.widthM}×{p.plan?.plot?.depthM} m · {p.plan?.plot?.facing}-facing · {p.plan?.plot?.city}
                  </div>
                  <div className="mt-1">
                    {p.plan?.rooms?.length ?? 0} rooms · updated {new Date(p.updated_at).toLocaleDateString("en-IN")}
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
