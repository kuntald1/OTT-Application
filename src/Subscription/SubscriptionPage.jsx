import React, { useState } from "react";
import { Check, Minus, Plus, Monitor, ArrowLeft, BadgeCheck, Gift } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";

// ---------------------------------------------------------------------------
// Subscription — three plans, each priced for a single screen by default.
// A screens selector (1-5) scales the price; a duration selector (1/6/12
// months) applies a discount for longer commitments, same as most real
// streaming pricing pages.
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

const DURATIONS = [
  { id: "1m", label: "1 Month", months: 1, discount: 0 },
  { id: "6m", label: "6 Months", months: 6, discount: 0.10 },
  { id: "12m", label: "1 Year", months: 12, discount: 0.20 },
];

const MAX_SCREENS = 5;

export default function SubscriptionPage({ onBack }) {
  const [screens, setScreens] = useState({ Play: 1, Archive: 1, Both: 1 });
  const [durationId, setDurationId] = useState("1m");
  const [useRewards, setUseRewards] = useState(false);
  const {
    isLoggedIn, requestLogin, isSubscribed, activePlan, activeDuration, activeScreens, activePrice,
    subscribe, rewardPoints, redeemRewardPoints,
  } = useApp();

  const duration = DURATIONS.find((d) => d.id === durationId);

  const priceFor = (plan) => {
    const count = screens[plan.name];
    const monthly = plan.basePrice + (count - 1) * plan.perExtraScreen;
    const preRewards = Math.round(monthly * duration.months * (1 - duration.discount));
    const pointsUsed = useRewards ? Math.min(rewardPoints, preRewards) : 0;
    const total = preRewards - pointsUsed;
    return { monthly, preRewards, pointsUsed, total };
  };

  const handleSubscribe = (plan) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    const { total, pointsUsed } = priceFor(plan);
    if (pointsUsed > 0) redeemRewardPoints(pointsUsed);
    subscribe(plan.name, duration.label, screens[plan.name], total);
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

        {/* Current plan banner */}
        {isSubscribed && (
          <div
            className="mx-auto mb-8 flex max-w-4xl flex-wrap items-center gap-3 rounded-2xl px-5 py-4"
            style={{ background: "rgba(111,207,151,0.1)", border: "1px solid rgba(111,207,151,0.35)" }}
          >
            <BadgeCheck className="h-5 w-5 flex-shrink-0" style={{ color: "#6FCF97" }} />
            <p className="text-sm" style={{ color: "#6FCF97" }}>
              You're currently on the <b>{activePlan}</b> plan — {activeDuration}, {activeScreens} screen{activeScreens > 1 ? "s" : ""}, ₹{activePrice} total.
            </p>
          </div>
        )}

        <div className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-medium tracking-wide" style={{ color: COLORS.gold }}>SUBSCRIPTION</p>
          <h1 className="mt-2 text-3xl font-semibold sm:text-4xl" style={{ color: COLORS.cream }}>Choose your plan</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm" style={{ color: "rgba(245,235,221,0.65)" }}>
            Unlimited streaming, no watch limits, cancel anytime. Pick a billing cycle and how many screens can watch at once.
          </p>
        </div>

        {/* Duration selector — applies to all three plans */}
        <div className="mx-auto mt-6 flex max-w-xs items-center justify-center gap-2 rounded-full p-1.5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
          {DURATIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDurationId(d.id)}
              className="flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors"
              style={
                durationId === d.id
                  ? { background: CTA_GRADIENT, color: CTA_TEXT_COLOR }
                  : { color: "rgba(245,235,221,0.65)" }
              }
            >
              {d.label}
              {d.discount > 0 && (
                <span className="ml-1" style={{ color: durationId === d.id ? CTA_TEXT_COLOR : COLORS.gold }}>
                  −{Math.round(d.discount * 100)}%
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Rewards redemption toggle */}
        {rewardPoints > 0 && (
          <button
            type="button"
            onClick={() => setUseRewards((v) => !v)}
            className="mx-auto mt-4 flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors"
            style={{
              background: useRewards ? "rgba(212,175,55,0.1)" : COLORS.blackSoft,
              border: `1px solid ${useRewards ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: "rgba(212,175,55,0.14)" }}
            >
              <Gift className="h-4 w-4" style={{ color: COLORS.gold }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>
                You have {rewardPoints} reward points (₹{rewardPoints})
              </p>
              <p className="text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
                {useRewards ? "Applying to your total below — tap to remove" : "Tap to redeem toward this subscription"}
              </p>
            </div>
            <div
              className="flex h-5 w-9 flex-shrink-0 items-center rounded-full p-0.5 transition-colors"
              style={{ background: useRewards ? CTA_GRADIENT : "rgba(255,255,255,0.15)" }}
            >
              <div
                className="h-4 w-4 rounded-full bg-white transition-transform"
                style={{ transform: useRewards ? "translateX(16px)" : "translateX(0)" }}
              />
            </div>
          </button>
        )}

        <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const count = screens[plan.name];
            const { monthly, preRewards, pointsUsed, total } = priceFor(plan);
            const isCurrent = activePlan === plan.name && activeDuration === duration.label && activeScreens === count;
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

                <div className="mt-5 flex items-baseline gap-2">
                  {pointsUsed > 0 && (
                    <span className="text-base line-through" style={{ color: "rgba(245,235,221,0.35)" }}>₹{preRewards}</span>
                  )}
                  <span className="text-3xl font-semibold" style={{ color: COLORS.cream }}>₹{total}</span>
                  <span className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
                    /{duration.months === 1 ? "month" : duration.label.toLowerCase()}
                  </span>
                </div>
                {pointsUsed > 0 && (
                  <p className="mt-0.5 text-[11px] font-medium" style={{ color: COLORS.gold }}>
                    − ₹{pointsUsed} reward points applied
                  </p>
                )}
                {duration.months > 1 && (
                  <p className="mt-0.5 text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>
                    ≈ ₹{Math.round(preRewards / duration.months)}/month before rewards · save {Math.round(duration.discount * 100)}%
                  </p>
                )}
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
                    ₹{plan.basePrice} for 1 screen + ₹{plan.perExtraScreen} × {count - 1} extra, per month
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

                {isCurrent ? (
                  <div className="mt-6 flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold" style={{ background: "rgba(111,207,151,0.15)", color: "#6FCF97", border: "1px solid rgba(111,207,151,0.4)" }}>
                    <Check className="h-4 w-4" /> Current Plan
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSubscribe(plan)}
                    className="mt-6 w-full rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={
                      plan.highlighted
                        ? { background: CTA_GRADIENT, color: CTA_TEXT_COLOR }
                        : { border: `1px solid ${COLORS.gold}`, color: COLORS.gold }
                    }
                  >
                    {isSubscribed ? "Switch to this plan" : `Subscribe — ₹${total}`}
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
