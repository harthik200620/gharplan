"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export function BillingClient({
  credits,
  subscribed,
  planLabel,
}: {
  credits: number;
  subscribed: boolean;
  planLabel: string | null;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  async function pay(kind: "credit" | "subscription", planId?: string, quantity = 1) {
    setBusy(planId ?? "credit");
    try {
      const r = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, planId, quantity }),
      });
      if (r.status === 503) {
        toast.error("Billing isn’t configured yet — add Razorpay keys to enable checkout.");
        return;
      }
      if (!r.ok) throw new Error("Could not start checkout");
      const o = await r.json();
      if (!(await loadRazorpay())) throw new Error("Failed to load Razorpay");

      const rzp = new window.Razorpay({
        key: o.keyId,
        amount: o.amount,
        currency: o.currency,
        name: "GharPlan",
        description: planId ?? `${quantity} export credit(s)`,
        order_id: o.orderId,
        theme: { color: "#1F3A5F" },
        handler: async (resp: any) => {
          const v = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: resp.razorpay_order_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            }),
          });
          if (v.ok) {
            toast.success("Payment successful!");
            router.refresh();
          } else {
            toast.error("Payment verification failed — contact support.");
          }
        },
      });
      rzp.open();
    } catch (e: any) {
      toast.error(e.message ?? "Checkout failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
        </CardHeader>
        <CardContent>
          {subscribed ? (
            <p className="text-sm">
              <strong>{planLabel ?? "Unlimited"}</strong> — unlimited exports active.
            </p>
          ) : (
            <p className="text-sm">
              You have <strong>{credits}</strong> export credit(s). One credit unlocks all exports for a plan.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pay per plan</CardTitle>
            <p className="text-sm text-muted-foreground">{inr(499)} = 1 export-ready plan</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">× {inr(499)} = {inr(499 * qty)}</span>
            </div>
            <Button className="w-full" disabled={busy === "credit"} onClick={() => pay("credit", undefined, qty)}>
              {busy === "credit" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Buy credits
            </Button>
          </CardContent>
        </Card>

        <PlanCard
          title="Studio"
          price={1500}
          features={["5 plans / month", "All exports", "Studio branding"]}
          busy={busy === "solo_5"}
          onClick={() => pay("subscription", "solo_5")}
        />
        <PlanCard
          title="Solo Unlimited"
          price={2999}
          features={["Unlimited plans", "All exports", "Priority updates"]}
          highlight
          busy={busy === "solo_unlimited"}
          onClick={() => pay("subscription", "solo_unlimited")}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Payments via Razorpay. Subscriptions here grant a 30-day access window; wire Razorpay Plans for true
        auto-recurring billing. Pricing is indicative — TODO(human): confirm before launch.
      </p>
    </div>
  );
}

function PlanCard({
  title,
  price,
  features,
  highlight,
  busy,
  onClick,
}: {
  title: string;
  price: number;
  features: string[];
  highlight?: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Card className={highlight ? "border-accent ring-1 ring-accent" : ""}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-2xl font-bold text-primary">
          {inr(price)}
          <span className="text-sm font-normal text-muted-foreground">/mo</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-ok" /> {f}
            </li>
          ))}
        </ul>
        <Button variant={highlight ? "accent" : "outline"} className="w-full" disabled={busy} onClick={onClick}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Subscribe
        </Button>
      </CardContent>
    </Card>
  );
}
