import { notFound } from "next/navigation";
import { Wizard } from "@/components/wizard/wizard";
import { canExport, getOrCreateProfile, type ProjectRow } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function EditProjectPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!project) notFound();

  const profile = await getOrCreateProfile(supabase, user!.id, user!.email ?? "");
  return (
    <Wizard
      projectId={(project as ProjectRow).id}
      initialPlan={(project as ProjectRow).plan}
      canExport={canExport(profile)}
    />
  );
}
