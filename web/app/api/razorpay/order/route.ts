import { NextResponse } from "next/server";
import { isRazorpayConfigured, PRICING, razorpay } from "@/lib/razorpay";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isRazorpayConfigured()) {
    return NextResponse.json({ error: "razorpay_not_configured" }, { status: 503 });
  }

  const { kind, planId, quantity = 1 } = await req.json();

  let amountInr = 0;
  let credits = 0;
  let pid = "credit_pack";
  if (kind === "credit") {
    const qty = Math.max(1, Math.round(quantity));
    amountInr = PRICING.creditUnitInr * qty;
    credits = qty;
  } else if (planId === "solo_5") {
    amountInr = PRICING.solo_5.amountInr;
    credits = PRICING.solo_5.credits;
    pid = "solo_5";
  } else if (planId === "solo_unlimited") {
    amountInr = PRICING.solo_unlimited.amountInr;
    credits = PRICING.solo_unlimited.credits;
    pid = "solo_unlimited";
  } else {
    return NextResponse.json({ error: "bad_plan" }, { status: 400 });
  }

  const order = await razorpay().orders.create({
    amount: amountInr * 100,
    currency: "INR",
    notes: { user: user.id, kind, planId: pid, credits: String(credits) },
  });

  await supabase.from("payments").insert({
    user_id: user.id,
    kind,
    plan_id: pid,
    amount_inr: amountInr,
    credits_granted: credits,
    razorpay_order_id: order.id,
    status: "created",
  });

  return NextResponse.json({
    orderId: order.id,
    amount: amountInr * 100,
    currency: "INR",
    keyId: process.env.RAZORPAY_KEY_ID,
    planId: pid,
    credits,
  });
}
