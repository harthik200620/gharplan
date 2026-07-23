import { NextResponse } from "next/server";
import { brandingFromProfile, getOrCreateProfile, hasActiveSubscription } from "@/lib/db";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  dxf: "image/vnd.dxf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ifc: "application/x-step",
};
// Endpoints that take the bare Plan (not the ExportRequest wrapper).
const PLAN_ONLY = new Set(["dxf", "ifc"]);
// Server-side: prefer an internal ENGINE_URL (e.g. http://engine:8000 in Docker),
// falling back to the public URL used by the browser. That public URL is often
// relative (e.g. "/engine" for the combined single-Vercel-project deploy) — a bare
// path has no meaning to a server-side fetch(), so resolve it against the incoming
// request's own origin. An already-absolute URL (localhost, Docker, a separate host)
// passes straight through untouched.
function engineExportUrl(req: Request, type: string): string {
  const raw = process.env.ENGINE_URL || process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000";
  const base = new URL(raw, req.url);
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/export/${type}`;
  return base.toString();
}

async function proxyToEngine(req: Request, type: string, engineBody: unknown, name: string) {
  const res = await fetch(engineExportUrl(req, type), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(engineBody),
  });
  if (!res.ok) {
    return NextResponse.json({ error: "engine_failed", detail: await res.text() }, { status: 502 });
  }
  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": MIME[type],
      "Content-Disposition": `attachment; filename="${name}.${type}"`,
    },
  });
}

// Export gating: an active subscription OR one credit (which unlocks all exports
// for that project). In demo mode (no Supabase) there is no auth/gating.
export async function POST(req: Request, { params }: { params: { type: string } }) {
  const type = params.type;
  if (!(type in MIME)) return NextResponse.json({ error: "bad_type" }, { status: 400 });

  const body = await req.json();
  const name = (body?.plan?.project?.name ?? "export").replace(/\W+/g, "_");

  // ---- demo mode: no auth, engine uses its default branding ----
  if (!hasSupabaseEnv()) {
    return proxyToEngine(req, type, PLAN_ONLY.has(type) ? body.plan : body, name);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile(supabase, user.id, user.email ?? "");
  const projectId: string | undefined = body.projectId;

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

  const engineBody = PLAN_ONLY.has(type)
    ? body.plan
    : { ...body, branding: brandingFromProfile(profile) };
  return proxyToEngine(req, type, engineBody, name);
}
