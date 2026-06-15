import { NextResponse } from "next/server";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { createClient } from "@/lib/supabase/server";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { orderId, paymentId, signature } = await req.json();
  if (!verifyPaymentSignature(orderId, paymentId, signature)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  const { data: pay } = await supabase
    .from("payments")
    .select("*")
    .eq("razorpay_order_id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!pay) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  if (pay.status === "paid") return NextResponse.json({ ok: true }); // idempotent

  await supabase.from("payments").update({ status: "paid", razorpay_payment_id: paymentId }).eq("id", pay.id);

  if (pay.plan_id === "solo_unlimited") {
    await supabase
      .from("profiles")
      .update({
        subscription_plan: "solo_unlimited",
        subscription_status: "active",
        subscription_period_end: new Date(Date.now() + THIRTY_DAYS).toISOString(),
      })
      .eq("id", user.id);
  } else if (pay.credits_granted > 0) {
    await supabase.rpc("add_credits", { p_user: user.id, n: pay.credits_granted });
  }

  return NextResponse.json({ ok: true });
}
