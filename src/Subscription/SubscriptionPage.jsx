import React, { useEffect, useState } from "react";
import { Check, Minus, Plus, Monitor, ArrowLeft, BadgeCheck, Gift, Calendar, Receipt } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import { fetchSubscriptionPlans, fetchSubscriptionHistory, fetchPaymentRecords, fetchTaxConfig, fetchExchangeRate, createRazorpayOrder, verifyRazorpayPayment, createStripeCheckoutSession } from "../api";

// ---------------------------------------------------------------------------
// Subscription — plan catalog (name, pricing, features) now comes from
// GET /api/subscription-plans (the `subscription_plans` database table,
// editable from the future admin panel) instead of a hardcoded array.
// A screens selector (1-5) scales the price; a duration selector (1/6/12
// months) applies a discount for longer commitments, same as most real
// streaming pricing pages.
// ---------------------------------------------------------------------------

const DURATIONS = [
  { id: "1m", label: "1 Month", months: 1, discount: 0 },
  { id: "6m", label: "6 Months", months: 6, discount: 0.10 },
  { id: "12m", label: "1 Year", months: 12, discount: 0.20 },
];

const MAX_SCREENS = 5;

export default function SubscriptionPage({ onBack }) {
  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [screens, setScreens] = useState({});
  const [durationId, setDurationId] = useState("1m");
  const [useRewards, setUseRewards] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState("");
  const {
    isLoggedIn, requestLogin, isSubscribed, activePlan, activeDuration, activeScreens, activePrice, activeCurrency,
    subscribe, refreshSubscription, refreshProfile, profile,
  } = useApp();

  const isIndia = profile.country === "India";
  const [exchangeRate, setExchangeRate] = useState(null);

  useEffect(() => {
    fetchExchangeRate().then(setExchangeRate).catch(() => setExchangeRate({ inr_per_usd: 83.5 }));
  }, []);

  useEffect(() => {
    fetchSubscriptionPlans()
      .then((data) => {
        // Map backend field names (base_price, per_extra_screen) to the
        // names the rest of this component already uses, and default
        // every plan's screen count to 1.
        const mapped = data.map((p) => ({
          name: p.name,
          basePrice: Number(p.base_price),
          perExtraScreen: Number(p.per_extra_screen),
          basePriceUsd: Number(p.base_price_usd),
          perExtraScreenUsd: Number(p.per_extra_screen_usd),
          tagline: p.tagline,
          features: p.features,
          highlighted: p.highlighted,
        }));
        setPlans(mapped);
        setScreens(Object.fromEntries(mapped.map((p) => [p.name, 1])));
      })
      .catch(() => setPlans([]))
      .finally(() => setPlansLoading(false));
  }, []);

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const loadHistoryAndPayments = () => {
    setHistoryLoading(true);
    fetchSubscriptionHistory()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));

    setPaymentsLoading(true);
    fetchPaymentRecords()
      .then(setPayments)
      .catch(() => setPayments([]))
      .finally(() => setPaymentsLoading(false));
  };

  useEffect(() => {
    if (isLoggedIn) loadHistoryAndPayments();
  }, [isLoggedIn]);

  // Checkout modal — opened by clicking Subscribe/Switch, replaces the old
  // direct-activation flow. checkoutPlan holds the plan being purchased;
  // null means the modal is closed.
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [taxConfig, setTaxConfig] = useState(null);

  useEffect(() => {
    fetchTaxConfig().then(setTaxConfig).catch(() => setTaxConfig({ gst_percent: 18 }));
  }, []);

  // Razorpay's checkout widget is loaded from their CDN once, lazily —
  // no need to block initial page load for a script only needed if/when
  // someone actually opens the checkout modal.
  useEffect(() => {
    if (document.getElementById("razorpay-checkout-js")) return;
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const duration = DURATIONS.find((d) => d.id === durationId);

  const priceFor = (plan) => {
    const count = screens[plan.name] || 1;

    // INR — always computed from the plan's own INR base price
    const monthly = plan.basePrice + (count - 1) * plan.perExtraScreen;
    const preRewards = Math.round(monthly * duration.months * (1 - duration.discount));
    const pointsUsed = useRewards ? Math.min(profile.rewardPoints, preRewards) : 0;
    const total = preRewards - pointsUsed;

    // USD — computed from the plan's own USD base price (set directly by
    // the admin), NOT derived by converting the INR total. Reward points
    // are still earned/valued in ₹ terms platform-wide, so their discount
    // is converted to its USD-equivalent using the exchange rate — that's
    // the one place a conversion rate is still used for USD pricing.
    const rate = exchangeRate ? Number(exchangeRate.inr_per_usd) : 83.5;
    const monthlyUsd = plan.basePriceUsd + (count - 1) * plan.perExtraScreenUsd;
    const preRewardsUsd = Math.round(monthlyUsd * duration.months * (1 - duration.discount) * 100) / 100;
    const pointsUsedUsd = pointsUsed > 0 ? Math.round((pointsUsed / rate) * 100) / 100 : 0;
    const totalUsd = Math.max(0, Math.round((preRewardsUsd - pointsUsedUsd) * 100) / 100);

    return { monthly, preRewards, pointsUsed, total, preRewardsUsd, pointsUsedUsd, totalUsd };
  };

  const handleSubscribe = (plan) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    setError("");
    setCheckoutPlan(plan);
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
              You're currently on the <b>{activePlan}</b> plan — {activeDuration}, {activeScreens} screen{activeScreens > 1 ? "s" : ""}, {activeCurrency === "USD" ? "$" : "₹"}{activePrice} total.
            </p>
          </div>
        )}

        {error && (
          <p className="mx-auto mb-6 max-w-4xl text-center text-sm font-medium" style={{ color: "#f87171" }}>
            {error}
          </p>
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
        {profile.rewardPoints > 0 && (
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
                You have {profile.rewardPoints} reward points (₹{profile.rewardPoints})
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

        {plansLoading ? (
          <p className="mx-auto mt-10 max-w-4xl text-center text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            Loading plans…
          </p>
        ) : plans.length === 0 ? (
          <p className="mx-auto mt-10 max-w-4xl text-center text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            No plans available right now. Please check back shortly.
          </p>
        ) : (
        <div className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
          {plans.map((plan) => {
            const count = screens[plan.name] || 1;
            const { monthly, preRewards, pointsUsed, total, preRewardsUsd, pointsUsedUsd, totalUsd } = priceFor(plan);
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
                    <span className="text-base line-through" style={{ color: "rgba(245,235,221,0.35)" }}>{isIndia ? `₹${preRewards}` : `$${preRewardsUsd}`}</span>
                  )}
                  <span className="text-3xl font-semibold" style={{ color: COLORS.cream }}>{isIndia ? `₹${total}` : `$${totalUsd}`}</span>
                  <span className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
                    /{duration.months === 1 ? "month" : duration.label.toLowerCase()}
                  </span>
                </div>
                {pointsUsed > 0 && (
                  <p className="mt-0.5 text-[11px] font-medium" style={{ color: COLORS.gold }}>
                    − {isIndia ? `₹${pointsUsed}` : `$${pointsUsedUsd}`} reward points applied
                  </p>
                )}
                {duration.months > 1 && (
                  <p className="mt-0.5 text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>
                    ≈ {isIndia ? `₹${Math.round(preRewards / duration.months)}` : `$${Math.round((preRewardsUsd / duration.months) * 100) / 100}`}/month before rewards · save {Math.round(duration.discount * 100)}%
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
                    {isIndia
                      ? `₹${plan.basePrice} for 1 screen + ₹${plan.perExtraScreen} × ${count - 1} extra, per month`
                      : `$${plan.basePriceUsd} for 1 screen + $${plan.perExtraScreenUsd} × ${count - 1} extra, per month`}
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
                    disabled={subscribing}
                    onClick={() => handleSubscribe(plan)}
                    className="mt-6 w-full rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={
                      plan.highlighted
                        ? { background: CTA_GRADIENT, color: CTA_TEXT_COLOR }
                        : { border: `1px solid ${COLORS.gold}`, color: COLORS.gold }
                    }
                  >
                    {subscribing ? "Activating…" : isSubscribed ? "Switch to this plan" : `Subscribe — ${isIndia ? `₹${total}` : `$${totalUsd}`}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        )}

        <p className="mx-auto mt-10 max-w-lg text-center text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
          Demo pricing shown for illustration — no real payment is processed here.
        </p>

        {/* Your subscription — history + payment records, moved below the
            pricing cards so plan selection is the first thing seen */}
        {isLoggedIn && (
          <div className="mx-auto mt-16 max-w-4xl">
            <div className="mb-6 text-center">
              <p className="text-sm font-medium tracking-wide" style={{ color: COLORS.gold }}>YOUR ACCOUNT</p>
              <h2 className="mt-1 text-2xl font-semibold" style={{ color: COLORS.cream }}>Subscription &amp; payment history</h2>
            </div>

            <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
              <h3 className="mb-4 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
                <Calendar className="h-4 w-4" style={{ color: COLORS.gold }} /> Your subscriptions
              </h3>

              {historyLoading || paymentsLoading ? (
                <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No subscriptions yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {history.map((sub) => {
                    // The payment that actually paid for THIS subscription —
                    // matched by the real subscription_id link, not by
                    // eyeballing dates/amounts across two separate lists.
                    const matchingPayment = payments.find((p) => p.subscription_id === sub.id);
                    return (
                      <div
                        key={sub.id}
                        className="overflow-hidden rounded-xl"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                          <div>
                            <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>
                              {sub.plan_name} — {sub.duration_label}, {sub.screens} screen{sub.screens > 1 ? "s" : ""}
                            </p>
                            <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                              Activated {formatDate(sub.started_at)} · Expires {formatDate(sub.expires_at)}
                            </p>
                          </div>
                          <span
                            className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{
                              background: sub.is_active ? "rgba(111,207,151,0.15)" : "rgba(255,255,255,0.08)",
                              color: sub.is_active ? "#6FCF97" : "rgba(245,235,221,0.5)",
                            }}
                          >
                            {sub.is_active ? "Active" : "Expired"}
                          </span>
                        </div>

                        {/* Payment, shown INSIDE its subscription's card — this
                            is the actual fix: no more guessing which payment
                            belongs to which subscription. */}
                        {matchingPayment ? (
                          <div className="flex flex-wrap items-start justify-between gap-2 border-t px-4 py-2.5" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.12)" }}>
                            <div className="flex-1 text-xs" style={{ color: "rgba(245,235,221,0.6)" }}>
                              <p className="flex items-center gap-1.5">
                                <Receipt className="h-3 w-3 flex-shrink-0" style={{ color: COLORS.gold }} />
                                Paid {matchingPayment.currency === "USD" ? "$" : "₹"}{matchingPayment.total_amount} via {matchingPayment.gateway}
                                {" "}(Base {matchingPayment.currency === "USD" ? "$" : "₹"}{matchingPayment.base_amount}
                                {Number(matchingPayment.tax_amount) > 0 ? ` + Tax ${matchingPayment.currency === "USD" ? "$" : "₹"}${matchingPayment.tax_amount}` : ""})
                                {matchingPayment.reward_points_used > 0 && ` · ${matchingPayment.reward_points_used} reward points used`}
                                {" · "}{formatDate(matchingPayment.created_at)}
                              </p>
                              {matchingPayment.gateway_payment_id && (
                                <p className="mt-1 font-mono text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
                                  Transaction ID: {matchingPayment.gateway_payment_id}
                                </p>
                              )}
                            </div>
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
                              style={{
                                background:
                                  matchingPayment.status === "paid" ? "rgba(111,207,151,0.15)"
                                  : matchingPayment.status === "failed" ? "rgba(248,113,113,0.15)"
                                  : "rgba(255,255,255,0.08)",
                                color:
                                  matchingPayment.status === "paid" ? "#6FCF97"
                                  : matchingPayment.status === "failed" ? "#f87171"
                                  : "rgba(245,235,221,0.6)",
                              }}
                            >
                              {matchingPayment.status}
                            </span>
                          </div>
                        ) : (
                          <div className="border-t px-4 py-2.5 text-xs" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.12)", color: "rgba(245,235,221,0.4)" }}>
                            No matching payment record found for this subscription.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Any payment attempts that never resulted in an active
                  subscription (e.g. abandoned/failed checkouts) — shown
                  separately so nothing silently disappears, but clearly
                  distinguished from the successful, linked ones above. */}
              {!historyLoading && !paymentsLoading && payments.some((p) => !history.some((sub) => sub.id === p.subscription_id)) && (
                <>
                  <h3 className="mb-4 mt-8 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
                    <Receipt className="h-4 w-4" style={{ color: COLORS.gold }} /> Other payment attempts
                  </h3>
                  <div className="flex flex-col gap-3">
                    {payments.filter((p) => !history.some((sub) => sub.id === p.subscription_id)).map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                      >
                        <div>
                          <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>
                            {p.plan_name} — {p.currency === "USD" ? "$" : "₹"}{p.total_amount} via {p.gateway}
                          </p>
                          <p className="mt-0.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{formatDate(p.created_at)}</p>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize"
                          style={{
                            background:
                              p.status === "paid" ? "rgba(111,207,151,0.15)"
                              : p.status === "failed" ? "rgba(248,113,113,0.15)"
                              : "rgba(255,255,255,0.08)",
                            color:
                              p.status === "paid" ? "#6FCF97"
                              : p.status === "failed" ? "#f87171"
                              : "rgba(245,235,221,0.6)",
                          }}
                        >
                          {p.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {checkoutPlan && (
        <CheckoutModal
          plan={checkoutPlan}
          duration={duration}
          screens={screens[checkoutPlan.name] || 1}
          taxConfig={taxConfig}
          rewardPoints={profile.rewardPoints}
          userEmail={profile.email}
          userPhone={profile.phone}
          isIndia={isIndia}
          exchangeRate={exchangeRate}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={() => {
            setCheckoutPlan(null);
            refreshSubscription();
            refreshProfile();
            loadHistoryAndPayments();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckoutModal — the real payment flow. Opened by clicking
// Subscribe/Switch on a plan card.
//
// India accounts: reward-redemption choice, server-computed GST (rate
// from /api/tax-config), final total in ₹, hands off to Razorpay's
// checkout widget.
//
// Every other country: reward-redemption still available (points are
// always earned/spent in ₹ terms, converted to their USD-equivalent
// discount), no GST line (GST doesn't apply outside India), total shown
// in $ using the fixed exchange rate from /api/exchange-rate, hands off
// to a real Stripe Checkout session (hosted redirect — the browser
// navigates to Stripe's own payment page, then Stripe redirects back to
// theomy.com/stripe/success on completion).
// ---------------------------------------------------------------------------
function CheckoutModal({ plan, duration, screens, taxConfig, rewardPoints, userEmail, userPhone, isIndia, exchangeRate, onClose, onSuccess }) {
  const [useRewards, setUseRewards] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  const monthly = plan.basePrice + (screens - 1) * plan.perExtraScreen;
  const preRewardsInr = Math.round(monthly * duration.months * (1 - duration.discount));
  const pointsUsed = useRewards ? Math.min(rewardPoints, preRewardsInr) : 0;
  const taxableInr = preRewardsInr - pointsUsed;

  const gstPercent = taxConfig ? Number(taxConfig.gst_percent) : 18;
  const taxAmountInr = isIndia ? Math.round((taxableInr * gstPercent) / 100) : 0;
  const totalInr = taxableInr + taxAmountInr;

  // USD — from the plan's own USD price, not converted from the INR
  // total. Reward points are still valued in ₹ (that's how they're
  // earned platform-wide), so their discount is converted to its
  // USD-equivalent using the exchange rate — the one place a conversion
  // rate is still used on the USD side.
  const rate = exchangeRate ? Number(exchangeRate.inr_per_usd) : 83.5;
  const monthlyUsd = plan.basePriceUsd + (screens - 1) * plan.perExtraScreenUsd;
  const preRewardsUsd = Math.round(monthlyUsd * duration.months * (1 - duration.discount) * 100) / 100;
  const pointsUsedUsd = pointsUsed > 0 ? Math.round((pointsUsed / rate) * 100) / 100 : 0;
  const totalUsd = Math.max(0, Math.round((preRewardsUsd - pointsUsedUsd) * 100) / 100);

  const handlePayWithRazorpay = async () => {
    setError("");
    setPaying(true);
    try {
      const order = await createRazorpayOrder({
        planName: plan.name,
        durationLabel: duration.label,
        screens,
        rewardPointsRequested: pointsUsed,
      });

      if (!window.Razorpay) {
        throw new Error("Payment widget failed to load. Please refresh and try again.");
      }

      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: Math.round(Number(order.total_amount) * 100),
        currency: order.currency,
        name: "theomy",
        description: `${order.plan_name} — ${order.duration_label}`,
        order_id: order.razorpay_order_id,
        prefill: { email: userEmail, contact: userPhone || undefined },
        theme: { color: "#D4AF37" },
        handler: async (response) => {
          try {
            await verifyRazorpayPayment({
              paymentId: order.payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            onSuccess();
          } catch (err) {
            setError(err.message || "Payment verification failed. If money was deducted, contact support.");
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      });
      rzp.on("payment.failed", () => {
        setError("Payment failed. Please try again.");
        setPaying(false);
      });
      rzp.open();
    } catch (err) {
      setError(err.message || "Couldn't start checkout. Please try again.");
      setPaying(false);
    }
  };

  const handlePayWithStripe = async () => {
    setError("");
    setPaying(true);
    try {
      const session = await createStripeCheckoutSession({
        planName: plan.name,
        durationLabel: duration.label,
        screens,
        rewardPointsRequested: pointsUsed,
      });
      // Hosted redirect — the browser leaves theomy.com entirely, pays on
      // Stripe's own page, then Stripe sends it back to
      // theomy.com/stripe/success?session_id=... on completion.
      window.location.href = session.checkout_url;
    } catch (err) {
      setError(err.message || "Couldn't start checkout. Please try again.");
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(10,1,4,0.8)" }}>
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: COLORS.blackSoft, border: `1px solid rgba(212,175,55,0.2)` }}
      >
        <h2 className="mb-1 text-lg font-semibold" style={{ color: COLORS.cream }}>Confirm your subscription</h2>
        <p className="mb-4 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          {plan.name} — {duration.label}, {screens} screen{screens > 1 ? "s" : ""}
        </p>

        {rewardPoints > 0 && (
          <button
            type="button"
            onClick={() => setUseRewards((v) => !v)}
            className="mb-4 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors"
            style={{
              background: useRewards ? "rgba(212,175,55,0.1)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${useRewards ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            <Gift className="h-4 w-4 flex-shrink-0" style={{ color: COLORS.gold }} />
            <span className="flex-1 text-xs" style={{ color: "rgba(245,235,221,0.75)" }}>
              Redeem {Math.min(rewardPoints, preRewardsInr)} reward points (₹{Math.min(rewardPoints, preRewardsInr)} off)
            </span>
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

        <div className="mb-4 flex flex-col gap-1.5 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,255,255,0.03)" }}>
          {isIndia ? (
            <>
              <div className="flex justify-between" style={{ color: "rgba(245,235,221,0.65)" }}>
                <span>Plan price</span><span>₹{preRewardsInr}</span>
              </div>
              {pointsUsed > 0 && (
                <div className="flex justify-between" style={{ color: COLORS.gold }}>
                  <span>Reward points applied</span><span>− ₹{pointsUsed}</span>
                </div>
              )}
              <div className="flex justify-between" style={{ color: "rgba(245,235,221,0.65)" }}>
                <span>GST ({gstPercent}%)</span><span>₹{taxAmountInr}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1.5 text-base font-semibold" style={{ borderColor: "rgba(255,255,255,0.1)", color: COLORS.cream }}>
                <span>Total</span><span>₹{totalInr}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between" style={{ color: "rgba(245,235,221,0.65)" }}>
                <span>Plan price</span><span>${preRewardsUsd}</span>
              </div>
              {pointsUsed > 0 && (
                <div className="flex justify-between" style={{ color: COLORS.gold }}>
                  <span>Reward points applied</span><span>− ${pointsUsedUsd}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t pt-1.5 text-base font-semibold" style={{ borderColor: "rgba(255,255,255,0.1)", color: COLORS.cream }}>
                <span>Total</span><span>${totalUsd}</span>
              </div>
              <p className="mt-0.5 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
                No GST applies outside India.
              </p>
            </>
          )}
        </div>

        {error && (
          <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>
        )}

        <div className="flex flex-col gap-2">
          {isIndia ? (
            <button
              type="button"
              disabled={paying}
              onClick={handlePayWithRazorpay}
              className="rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              {paying ? "Processing…" : `Pay ₹${totalInr} with Razorpay`}
            </button>
          ) : (
            <div>
              <button
                type="button"
                disabled
                className="w-full rounded-full px-5 py-2.5 text-sm font-semibold opacity-50"
                style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
              >
                International payments coming soon
              </button>
              <p className="mt-2 text-center text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
                We're setting up secure international checkout. Please check back shortly.
              </p>
            </div>
          )}
          <button
            type="button"
            disabled={paying}
            onClick={onClose}
            className="mt-1 text-xs font-medium hover:opacity-80"
            style={{ color: "rgba(245,235,221,0.5)" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
