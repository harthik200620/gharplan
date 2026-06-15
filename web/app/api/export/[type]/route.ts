import { NextResponse } from "next/server";
import { brandingFromProfile, getOrCreateProfile, hasActiveSubscription } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  dxf: "image/vnd.dxf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
// Server-side: prefer an internal ENGINE_URL (e.g. http://engine:8000 in Docker),
// falling back to the public URL used by the browser.
const ENGINE_URL =
  process.env.ENGINE_URL || process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000";

// Server-side export gating: an active subscription OR one credit (which unlocks
// all exports for that project). Then proxy to the engine with the studio branding.
export async function POST(req: Request, { params }: { params: { type: string } }) {
  const type = params.type;
  if (!(type in MIME)) return NextResponse.json({ error: "bad_type" }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(supabase, user.id, user.email ?? "");
  const body = await req.json();
  const projectId: string | undefined = body.projectId;

  // ---- gating ----
  let allowed = hasActiveSubscription(profile);
  if (!allowed && projectId) {
    const { data: proj } = await supabase
      .from("projects")
      .select("is_unlocked")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (proj?.is_unlocked) allowed = true;
  }
  if (!allowed) {
    const { data: ok } = await supabase.rpc("consume_credit", { p_user: user.id });
    if (!ok) return NextResponse.json({ error: "no_credits" }, { status: 402 });
    if (projectId) await supabase.from("projects").update({ is_unlocked: true }).eq("id", projectId);
  }

  // ---- proxy to engine ----
  const engineBody =
    type === "dxf" ? body.plan : { ...body, branding: brandingFromProfile(profile) };
  const res = await fetch(`${ENGINE_URL}/export/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(engineBody),
  });
  if (!res.ok) {
    return NextResponse.json({ error: "engine_failed", detail: await res.text() }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  const name = (body?.plan?.project?.name ?? "export").replace(/\W+/g, "_");
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": MIME[type],
      "Content-Disposition": `attachment; filename="${name}.${type}"`,
    },
  });
}
