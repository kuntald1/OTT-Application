import React, { useState } from "react";
import { Check, Minus, Plus, Monitor, ArrowLeft } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";

// ---------------------------------------------------------------------------
// Subscription — three plans, each priced for a single screen by default.
// A screens selector (1-5) on each card scales the price live: base price
// for the first screen, plus a per-plan increment for every additional one.
// ---------------------------------------------------------------------------

const PLANS = [
  {
    name: "Play",
    basePrice: 100,
    perExtraScreen: 60,
    tagline: "Unlimited Video Streaming",
    features: ["Unlimited access to all Play content", "New titles added weekly"],
    highlighted: false,
  },
  {
    name: "Archive",
    basePrice: 100,
    perExtraScreen: 60,
    tagline: "Unlimited Archive access",
    features: ["Unlimited access to old & restored footage", "Vintage recordings added regularly"],
    highlighted: false,
  },
  {
    name: "Both",
    basePrice: 150,
    perExtraScreen: 90,
    tagline: "Play + Archive, unlimited",
    features: ["Everything in Play", "Everything in Archive", "Best value vs buying separately"],
    highlighted: true,
  },
];

const MAX_SCREENS = 5;

export default function SubscriptionPage({ onBack }) {
  const [screens, setScreens] = useState({ Play: 1, Archive: 1, Both: 1 });
  const { isLoggedIn, requestLogin, isSubscribed, activePlan, subscribe } = useApp();

  const handleSubscribe = (planName) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    subscribe(planName);
  };

  const setScreenCount = (planName, delta) => {
    setScreens((s) => ({
      ...s,
      [planName]: Math.min(MAX_SCREENS, Math.max(1, s[planName] + delta)),
    }));
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="px-6 pb-12 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-medium tracking-wide" style={{ color: COLORS.gold }}>SUBSCRIPTION</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl" style={{ color: COLORS.cream }}>Choose your plan</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm" style={{ color: "rgba(245,235,221,0.65)" }}>
            Unlimited streaming, no watch limits, cancel anytime. Pick how many screens can watch at once.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const count = screens[plan.name];
            const total = plan.basePrice + (count - 1) * plan.perExtraScreen;
            return (
              <div
                key={plan.name}
                className="relative flex flex-col rounded-2xl p-6"
                style={{
                  background: plan.highlighted ? COLORS.blackSoft : "rgba(255,255,255,0.03)",
                  border: plan.highlighted ? `1.5px solid ${COLORS.gold}` : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {plan.highlighted && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                  >
                    Best Value
                  </span>
                )}

                <p className="text-lg font-semibold" style={{ color: COLORS.cream }}>{plan.name}</p>
                <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>{plan.tagline}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold" style={{ color: COLORS.cream }}>₹{total}</span>
                  <span className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>/month</span>
                </div>
                <p className="mt-1 text-xs" style={{ color: COLORS.gold }}>Unlimited</p>

                {/* Screens selector */}
                <div className="mt-4 flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>
                    <Monitor className="h-3.5 w-3.5" /> Screens
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setScreenCount(plan.name, -1)}
                      disabled={count <= 1}
                      aria-label="Fewer screens"
                      className="flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-30"
                      style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-4 text-center text-sm font-semibold" style={{ color: COLORS.cream }}>{count}</span>
                    <button
                      type="button"
                      onClick={() => setScreenCount(plan.name, 1)}
                      disabled={count >= MAX_SCREENS}
                      aria-label="More screens"
                      className="flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-30"
                      style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {count > 1 && (
                  <p className="mt-1.5 text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>
                    ₹{plan.basePrice} for 1 screen + ₹{plan.perExtraScreen} × {count - 1} extra
                  </p>
                )}

                <ul className="mt-5 flex flex-1 flex-col gap-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: "rgba(245,235,221,0.75)" }}>
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: COLORS.gold }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {activePlan === plan.name ? (
                  <div className="mt-6 flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold" style={{ background: "rgba(111,207,151,0.15)", color: "#6FCF97", border: "1px solid rgba(111,207,151,0.4)" }}>
                    <Check className="h-4 w-4" /> Current Plan
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan.name)}
                    className="mt-6 w-full rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={
                      plan.highlighted
                        ? { background: CTA_GRADIENT, color: CTA_TEXT_COLOR }
                        : { border: `1px solid ${COLORS.gold}`, color: COLORS.gold }
                    }
                  >
                    {isSubscribed ? "Switch to this plan" : `Subscribe — ₹${total}/mo`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-10 max-w-lg text-center text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
          Demo pricing shown for illustration — no real payment is processed here.
        </p>
      </main>
    </div>
  );
}
