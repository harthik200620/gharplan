import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { createServiceClient } from "@/lib/supabase/server";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// Server-to-server backup for grants (in case the client verify call is missed).
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  const event = JSON.parse(raw);
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const entity = event.payload?.payment?.entity ?? event.payload?.order?.entity;
    const orderId = entity?.order_id ?? entity?.id;
    const db = createServiceClient();
    const { data: pay } = await db.from("payments").select("*").eq("razorpay_order_id", orderId).maybeSingle();
    if (pay && pay.status !== "paid") {
      await db.from("payments").update({ status: "paid", razorpay_payment_id: entity?.id ?? null }).eq("id", pay.id);
      if (pay.plan_id === "solo_unlimited") {
        await db
          .from("profiles")
          .update({
            subscription_plan: "solo_unlimited",
            subscription_status: "active",
            subscription_period_end: new Date(Date.now() + THIRTY_DAYS).toISOString(),
          })
          .eq("id", pay.user_id);
      } else if (pay.credits_granted > 0) {
        await db.rpc("add_credits", { p_user: pay.user_id, n: pay.credits_granted });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
