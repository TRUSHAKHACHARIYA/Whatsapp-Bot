"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CreditCard, Check, AlertCircle, ExternalLink } from "lucide-react";
import { apiClient } from "@/services/api";
import { Button, Card, Spinner } from "@/components/ui";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import AppLayout, { Topbar } from "@/components/layout/AppLayout";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    monthly: 999,
    annual: 8999,
    description: "For small businesses just getting started",
    features: [
      "1 WhatsApp Number",
      "2 Agents",
      "1,000 conversations/month",
      "Menu Bot + FAQ Engine",
      "Lead Forms",
      "Basic Analytics",
    ],
    missing: ["Campaigns & Broadcasts", "White Label", "Priority Support"],
  },
  {
    id: "growth",
    name: "Growth",
    monthly: 2499,
    annual: 21999,
    description: "For growing businesses with active teams",
    popular: true,
    features: [
      "3 WhatsApp Numbers",
      "10 Agents",
      "10,000 conversations/month",
      "Campaigns & Broadcasts",
      "Full Analytics Dashboard",
      "Team Management",
      "Email Support",
    ],
    missing: ["White Label", "Custom Domain"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: 6999,
    annual: 59999,
    description: "For large teams needing full control",
    features: [
      "Unlimited WhatsApp Numbers",
      "Unlimited Agents",
      "Unlimited conversations",
      "White Label",
      "Custom Domain",
      "Priority Support",
      "Dedicated Account Manager",
      "API Access",
    ],
    missing: [],
  },
];

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function BillingPage() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const { data: subscription, isLoading, refetch } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => apiClient.get("/subscriptions/me").then((r) => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.post("/subscriptions/cancel"),
    onSuccess: () => {
      toast.success("Subscription cancelled. Access continues until the end of your billing period.");
      refetch();
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || "Failed to cancel."),
  });

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      // Load Razorpay script
      await loadRazorpay();

      const res = await apiClient.post("/subscriptions/create", {
        plan: planId,
        billing_cycle: billing,
      });

      const { razorpay_subscription_id, razorpay_key_id } = res.data;

      const rzp = new window.Razorpay({
        key: razorpay_key_id,
        subscription_id: razorpay_subscription_id,
        name: "WapiSend",
        description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan`,
        handler: async (response: any) => {
          try {
            await apiClient.post("/subscriptions/verify-payment", {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success("🎉 Subscription activated successfully!");
            refetch();
          } catch {
            toast.error("Payment verification failed. Contact support.");
          }
        },
        prefill: {},
        theme: { color: "#25D366" },
      });

      rzp.open();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to initiate payment.");
    } finally {
      setUpgrading(null);
    }
  };

  function loadRazorpay(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay"));
      document.body.appendChild(script);
    });
  }

  const currentPlan = subscription?.plan;

  return (
    <AppLayout>
      <Topbar title="Billing" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* Current subscription */}
        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : subscription ? (
          <Card className="p-5 mb-6 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <CreditCard size={18} className="text-green-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 capitalize">{subscription.plan_name} Plan</span>
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  subscription.status === "active" ? "bg-green-50 text-green-700" :
                  subscription.status === "trialing" ? "bg-blue-50 text-blue-700" :
                  "bg-red-50 text-red-600"
                )}>
                  {subscription.status === "trialing" ? "Free Trial" : subscription.status}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {subscription.max_agents} agents · {subscription.max_conversations_per_month?.toLocaleString()} conversations/mo · {subscription.max_whatsapp_numbers} numbers
              </div>
              {subscription.current_period_end && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {subscription.status === "cancelled" ? "Access until" : "Renews"} {new Date(subscription.current_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {subscription.status !== "cancelled" && subscription.status !== "trialing" && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={cancelMutation.isPending}
                  onClick={() => {
                    if (window.confirm("Cancel your subscription? You'll retain access until the period ends.")) {
                      cancelMutation.mutate();
                    }
                  }}
                >
                  Cancel Plan
                </Button>
              )}
            </div>
          </Card>
        ) : null}

        {/* Billing toggle */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <span className={cn("text-sm", billing === "monthly" ? "text-gray-900 font-medium" : "text-gray-400")}>Monthly</span>
          <button
            onClick={() => setBilling(billing === "monthly" ? "annual" : "monthly")}
            className={cn("relative w-12 h-6 rounded-full transition-colors", billing === "annual" ? "bg-green-500" : "bg-gray-200")}
          >
            <span className={cn("absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform", billing === "annual" ? "translate-x-7" : "translate-x-1")} />
          </button>
          <span className={cn("text-sm", billing === "annual" ? "text-gray-900 font-medium" : "text-gray-400")}>
            Annual <span className="text-green-600 text-xs font-medium">Save 25%</span>
          </span>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-3 gap-4 max-w-5xl mx-auto">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const price = billing === "monthly" ? plan.monthly : plan.annual;
            const period = billing === "monthly" ? "month" : "year";

            return (
              <div
                key={plan.id}
                className={cn(
                  "bg-white rounded-2xl border p-6 relative flex flex-col",
                  plan.popular ? "border-green-400 shadow-md shadow-green-100" : "border-gray-100",
                  isCurrent && "ring-2 ring-green-400"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-green-500 text-white text-[11px] font-medium px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-4">
                  <div className="text-base font-semibold text-gray-900">{plan.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{plan.description}</div>
                </div>

                <div className="mb-5">
                  <span className="text-3xl font-bold text-gray-900">₹{price.toLocaleString()}</span>
                  <span className="text-sm text-gray-400">/{period}</span>
                  {billing === "annual" && (
                    <div className="text-xs text-green-600 mt-0.5">
                      ₹{Math.round(price / 12).toLocaleString()}/month billed annually
                    </div>
                  )}
                </div>

                <div className="space-y-2 mb-5 flex-1">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check size={13} className="text-green-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </div>
                  ))}
                  {plan.missing.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="w-3 h-3 border border-gray-200 rounded-sm flex-shrink-0 mt-0.5" />
                      {f}
                    </div>
                  ))}
                </div>

                <Button
                  variant={isCurrent ? "secondary" : plan.popular ? "primary" : "secondary"}
                  loading={upgrading === plan.id}
                  disabled={isCurrent}
                  onClick={() => !isCurrent && handleUpgrade(plan.id)}
                  className="w-full justify-center"
                >
                  {isCurrent ? "Current Plan" : "Upgrade"}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-gray-400">
          <AlertCircle size={12} />
          All prices in INR. Billed via Razorpay. Cancel anytime.
        </div>
      </div>
    </AppLayout>
  );
}
