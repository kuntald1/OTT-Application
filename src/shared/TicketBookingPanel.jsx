import React, { useCallback, useEffect, useState } from "react";
import { COLORS } from "../theme";
import {
  fetchTicketAvailability,
  createTicketBookingOrder,
  verifyTicketBookingPayment,
  getToken,
} from "../api";

// ---------------------------------------------------------------------------
// Booking tickets for a show people physically attend.
//
// One component, used by BOTH places an event can be opened from — the
// Shows page modal (Theater/TheaterBrowsePage) and the shareable event
// link (Community/EventDetailPage). They each used to render their own
// read-only list of tiers, which is exactly how one of them ends up with
// a Buy button and the other doesn't.
//
// The rows come from the availability call, not from event.ticket_tiers,
// because only the server knows how many seats are left. A sold-out row
// is still shown, greyed and unclickable, so people can see the house
// filling up.
// ---------------------------------------------------------------------------

export default function TicketBookingPanel({ enquiryId, isLoggedIn, onRequestLogin }) {
  const [availability, setAvailability] = useState([]);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const [bookError, setBookError] = useState("");
  const [booked, setBooked] = useState(null);

  // Either the caller tells us, or we fall back to whether there's a token.
  const signedIn = typeof isLoggedIn === "boolean" ? isLoggedIn : !!getToken();

  const loadAvailability = useCallback(() => {
    if (!enquiryId) return;
    fetchTicketAvailability(enquiryId)
      .then(setAvailability)
      .catch(() => setAvailability([]));
  }, [enquiryId]);

  useEffect(loadAvailability, [loadAvailability]);

  const selectedTier = availability.find((t) => t.id === selectedTierId) || null;
  const maxForTier = selectedTier ? Math.min(10, selectedTier.available) : 1;
  const total = selectedTier ? Number(selectedTier.price) * quantity : 0;

  const chooseTier = (tier) => {
    if (tier.sold_out) return;
    setBookError("");
    setSelectedTierId(tier.id);
    setQuantity(1);
  };

  const handleBook = async () => {
    if (!selectedTier) return;
    if (!signedIn) {
      if (onRequestLogin) onRequestLogin();
      return;
    }
    setBookError("");
    setBuying(true);
    try {
      const order = await createTicketBookingOrder({
        enquiryId,
        tierId: selectedTier.id,
        quantity,
      });
      if (!window.Razorpay) {
        throw new Error("Payment widget failed to load. Please refresh and try again.");
      }
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: Math.round(Number(order.amount) * 100),
        currency: order.currency,
        name: "theomy",
        description: `${order.event_title} — ${order.tier_name} x${order.quantity}`,
        order_id: order.razorpay_order_id,
        theme: { color: "#D4AF37" },
        handler: async (response) => {
          try {
            const confirmed = await verifyTicketBookingPayment({
              bookingId: order.booking_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            setBooked(confirmed);
            setSelectedTierId(null);
            loadAvailability();
          } catch (err) {
            setBookError(err.message || "Payment verification failed. If money was deducted, contact support.");
          } finally {
            setBuying(false);
          }
        },
        modal: { ondismiss: () => setBuying(false) },
      });
      rzp.on("payment.failed", () => {
        setBookError("Payment failed. Please try again.");
        setBuying(false);
      });
      rzp.open();
    } catch (err) {
      setBookError(err.message || "Couldn't start the booking. Please try again.");
      setBuying(false);
    }
  };

  if (availability.length === 0) return null;

  if (booked) {
    return (
      <div
        className="mt-4 rounded-xl p-4"
        style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.3)" }}
      >
        <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>Booking confirmed</p>
        <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
          {booked.quantity} × {booked.tier_name} · ₹{Number(booked.amount).toLocaleString("en-IN")}
        </p>
        <p className="mt-3 text-lg font-bold tracking-widest" style={{ color: COLORS.gold }}>
          {booked.booking_reference}
        </p>
        <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
          Sent to you on WhatsApp and email. Show the QR code from My Bookings at the venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-col gap-1.5">
        {availability.map((t) => {
          const chosen = t.id === selectedTierId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => chooseTier(t)}
              disabled={t.sold_out}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm"
              style={{
                background: chosen ? "rgba(212,175,55,0.14)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${chosen ? "rgba(212,175,55,0.5)" : "transparent"}`,
                opacity: t.sold_out ? 0.45 : 1,
                cursor: t.sold_out ? "not-allowed" : "pointer",
              }}
            >
              <span>
                <span style={{ color: COLORS.cream }}>{t.tier_name}</span>
                <span className="ml-2 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                  {t.sold_out
                    ? "Sold out"
                    : t.available <= 10
                    ? `Only ${t.available} left`
                    : `${t.available} available`}
                </span>
              </span>
              <span style={{ color: COLORS.gold }}>₹{Number(t.price).toLocaleString("en-IN")}</span>
            </button>
          );
        })}
      </div>

      {selectedTier && (
        <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>How many?</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="h-7 w-7 rounded-full text-base"
                style={{ background: "rgba(255,255,255,0.08)", color: COLORS.cream }}
              >
                −
              </button>
              <span className="w-6 text-center text-sm font-semibold" style={{ color: COLORS.cream }}>
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxForTier, q + 1))}
                className="h-7 w-7 rounded-full text-base"
                style={{ background: "rgba(255,255,255,0.08)", color: COLORS.cream }}
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>Total</span>
            <span className="text-lg font-semibold" style={{ color: COLORS.gold }}>
              ₹{total.toLocaleString("en-IN")}
            </span>
          </div>

          <button
            type="button"
            onClick={handleBook}
            disabled={buying}
            className="mt-4 w-full rounded-lg py-2.5 text-sm font-semibold"
            style={{ background: COLORS.gold, color: "#1a0a0f", opacity: buying ? 0.6 : 1 }}
          >
            {buying
              ? "Opening checkout…"
              : signedIn
              ? `Pay ₹${total.toLocaleString("en-IN")}`
              : "Sign in to book"}
          </button>

          {!!bookError && <p className="mt-2 text-sm" style={{ color: "#ff8a80" }}>{bookError}</p>}
        </div>
      )}
    </div>
  );
}
