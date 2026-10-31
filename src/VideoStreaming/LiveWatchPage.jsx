import React, { useEffect, useState } from "react";
import { ArrowLeft, Radio, CalendarClock, Lock } from "lucide-react";
import { COLORS } from "../theme";
import { fetchLiveStream, createLiveStreamPurchaseOrder, verifyLiveStreamPurchasePayment } from "../api";
import { useApp } from "../context/AppContext";
import LiveVideoPlayer from "./LiveVideoPlayer";
import { formatPrice, liveEventAction } from "../shared/liveAccess";

// ---------------------------------------------------------------------------
// One live event: its player when the viewer may watch and it's on air,
// and otherwise an honest reason why not — announced for later, needs a
// plan, needs a ticket, or over.
//
// The reason comes from the server (has_access / access_reason); this
// page never guesses from the viewer's subscription. Signed-out visitors
// can read the page — an announced show is a promotion — they just can't
// play it.
// ---------------------------------------------------------------------------

// Everything that isn't "here's the player": each state says what's
// true and, where there's something to do about it, offers the one
// button that does it.
function LockedPanel({ live, onNavigate, requestLogin, onBuy, buying, buyError }) {
  const action = liveEventAction(live);
  const price = formatPrice(live);
  const onAir = action.isLive;

  // Two independent facts: whether it's on air, and whether this viewer
  // may watch. Say both — "Starts Nov 2, 1:15 PM" AND "Buy for ₹125" —
  // so nobody has to come back at show time just to find out they need
  // a ticket.
  let icon = onAir ? <Lock className="h-6 w-6" /> : <CalendarClock className="h-6 w-6" />;
  let headline = onAir ? "This show is on air now" : "Not live yet";
  let detail = action.hint;
  let cta = null;

  if (action.kind === "ended") {
    icon = <Radio className="h-6 w-6" />;
    headline = "This broadcast has ended.";
    detail = "";
  } else if (action.kind === "login") {
    cta = { label: "Sign in", onClick: () => requestLogin?.() };
    detail = onAir ? "Sign in to watch it." : `${action.hint} · Sign in to watch it.`;
  } else if (action.kind === "subscribe") {
    cta = { label: action.label, onClick: () => onNavigate?.("subscription") };
    detail = onAir ? `${action.label} to watch it.` : `${action.hint} · ${action.label} to watch it.`;
  } else if (action.kind === "pay") {
    const buyLine = price
      ? (onAir ? `Buy this show for ${price} to watch it.` : `Buy it now for ${price} and you're set for show time.`)
      : "Buy this show to watch it.";
    detail = onAir ? buyLine : `${action.hint} · ${buyLine}`;
    cta = { label: buying ? "Opening checkout…" : action.label, onClick: buying ? null : onBuy };
  }

  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 px-6 text-center"
      style={{ background: COLORS.blackSoft }}
    >
      <span style={{ color: "rgba(245,235,221,0.35)" }}>{icon}</span>
      <p className="text-base font-semibold" style={{ color: COLORS.cream }}>{headline}</p>
      {detail && <p className="max-w-md text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>{detail}</p>}
      {cta && (
        <button
          type="button"
          onClick={cta.onClick || undefined}
          disabled={!cta.onClick}
          className="mt-1 rounded-full px-5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          {cta.label}
        </button>
      )}
      {buyError && (
        <p className="max-w-sm text-xs" style={{ color: "#f87171" }}>{buyError}</p>
      )}
    </div>
  );
}

export default function LiveWatchPage({ liveStreamId, onBack, onNavigate }) {
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const { requestLogin, profile } = useApp();

  const loadLive = () => {
    setLoading(true);
    fetchLiveStream(liveStreamId)
      .then(setLive)
      .catch(() => setLive(null))
      .finally(() => setLoading(false));
  };

  useEffect(loadLive, [liveStreamId]);

  // Razorpay's widget, loaded once lazily — same pattern as
  // SubscriptionPage.jsx and VideoBrowsePage.jsx, so "Buy" works even
  // if this is the first page the viewer has opened this session.
  useEffect(() => {
    if (document.getElementById("razorpay-checkout-js")) return;
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const handleBuy = async () => {
    setBuyError("");
    setBuying(true);
    try {
      const order = await createLiveStreamPurchaseOrder(liveStreamId);
      if (!window.Razorpay) {
        throw new Error("Payment widget failed to load. Please refresh and try again.");
      }
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: Math.round(Number(order.amount) * 100),
        currency: order.currency,
        name: "theomy",
        description: order.live_stream_title,
        order_id: order.razorpay_order_id,
        prefill: { email: profile?.email, contact: profile?.phone || undefined },
        theme: { color: "#D4AF37" },
        handler: async (response) => {
          try {
            await verifyLiveStreamPurchasePayment({
              purchaseId: order.purchase_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            // Re-fetch rather than flipping a local flag: the server is
            // what decides has_access, and only it can hand back the
            // playback_url this page needs.
            loadLive();
          } catch (err) {
            setBuyError(err.message || "Payment verification failed. If money was deducted, contact support.");
          } finally {
            setBuying(false);
          }
        },
        modal: { ondismiss: () => setBuying(false) },
      });
      rzp.on("payment.failed", () => {
        setBuyError("Payment failed. Please try again.");
        setBuying(false);
      });
      rzp.open();
    } catch (err) {
      setBuyError(err.message || "Couldn't start checkout. Please try again.");
      setBuying(false);
    }
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-4xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : !live ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Live stream not found.</p>
        ) : (
          <>
            <div className="mb-4 overflow-hidden rounded-xl">
              {live.playback_url && live.status === "active" ? (
                <LiveVideoPlayer playbackUrl={live.playback_url} />
              ) : (
                <LockedPanel
                  live={live}
                  onNavigate={onNavigate}
                  requestLogin={requestLogin}
                  onBuy={handleBuy}
                  buying={buying}
                  buyError={buyError}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              {live.status === "active" && (
                <span className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(248,113,113,0.15)", color: "#f87171" }}>
                  <Radio className="h-3 w-3" /> LIVE
                </span>
              )}
              <h1 className="text-xl font-semibold" style={{ color: COLORS.cream }}>{live.title}</h1>
            </div>
            {live.description && (
              <p className="mt-2 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>{live.description}</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
