import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, MapPin, Calendar, Clock } from "lucide-react";
import { COLORS } from "../theme";
import {
  fetchPublicEvent,
  fetchTicketAvailability,
  createTicketBookingOrder,
  verifyTicketBookingPayment,
  getToken,
} from "../api";

export default function EventDetailPage({ eventId, onBack, onNavigate }) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Seats left per tier. Kept apart from the event itself because it
  // changes as people buy, and is re-read after every purchase.
  const [availability, setAvailability] = useState([]);
  const [selectedTierId, setSelectedTierId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [buying, setBuying] = useState(false);
  const [bookError, setBookError] = useState("");
  const [booked, setBooked] = useState(null);

  const signedIn = !!getToken();

  const loadAvailability = useCallback(() => {
    fetchTicketAvailability(eventId)
      .then(setAvailability)
      .catch(() => setAvailability([]));
  }, [eventId]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetchPublicEvent(eventId)
      .then(setEvent)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
    loadAvailability();
  }, [eventId, loadAvailability]);

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
    setBookError("");
    setBuying(true);
    try {
      const order = await createTicketBookingOrder({
        enquiryId: eventId,
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
            const booking = await verifyTicketBookingPayment({
              bookingId: order.booking_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            setBooked(booking);
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

  const formatDate = (iso) =>
    new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (loading) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.7)" }}>
          This event isn't available — it may not have been approved (yet), or the link is incorrect.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex flex-col gap-6 sm:flex-row">
          <div
            className="flex-shrink-0 overflow-hidden rounded-xl"
            style={{ width: 220, aspectRatio: "3/4", background: "rgba(245,235,221,0.05)" }}
          >
            {event.poster_image_url && (
              <img src={event.poster_image_url} alt="" className="h-full w-full object-cover" />
            )}
          </div>

          <div className="flex-1">
            <span
              className="mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}
            >
              {event.event_category}
            </span>
            <h1 className="text-3xl font-semibold leading-tight" style={{ color: COLORS.cream }}>{event.event_title}</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.55)" }}>Presented by {event.org_name}</p>

            <div className="mt-4 flex flex-col gap-2 text-sm" style={{ color: "rgba(245,235,221,0.75)" }}>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" style={{ color: COLORS.gold }} /> {formatDate(event.proposed_date)}
              </div>
              {event.proposed_time && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" style={{ color: COLORS.gold }} /> {event.proposed_time}
                </div>
              )}
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: COLORS.gold }} /> {event.venue}
              </div>
            </div>

            {event.event_description && (
              <p className="mt-5 text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.7)" }}>
                {event.event_description}
              </p>
            )}

            {/* Booking. The rows come from the availability call rather than
                event.ticket_tiers, because only that one knows how many seats are
                left. A sold-out row is still shown, greyed and unclickable, so
                people can see the house filling up. */}
            {availability.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-xs font-semibold uppercase" style={{ color: "rgba(245,235,221,0.5)" }}>Tickets</p>

                {booked ? (
                  <div className="rounded-xl p-4" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.3)" }}>
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
                ) : (
                  <>
                    <div className="flex flex-col gap-1.5">
                      {availability.map((t) => {
                        const chosen = t.id === selectedTierId;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => chooseTier(t)}
                            disabled={t.sold_out}
                            className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm"
                            style={{
                              background: chosen ? "rgba(212,175,55,0.14)" : "rgba(245,235,221,0.04)",
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
                      <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.04)" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>How many?</span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                              className="h-7 w-7 rounded-full text-base"
                              style={{ background: "rgba(245,235,221,0.08)", color: COLORS.cream }}
                            >
                              −
                            </button>
                            <span className="w-6 text-center text-sm font-semibold" style={{ color: COLORS.cream }}>{quantity}</span>
                            <button
                              type="button"
                              onClick={() => setQuantity((q) => Math.min(maxForTier, q + 1))}
                              className="h-7 w-7 rounded-full text-base"
                              style={{ background: "rgba(245,235,221,0.08)", color: COLORS.cream }}
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

                        {signedIn ? (
                          <button
                            type="button"
                            onClick={handleBook}
                            disabled={buying}
                            className="mt-4 w-full rounded-lg py-2.5 text-sm font-semibold"
                            style={{ background: COLORS.gold, color: "#1a0a0f", opacity: buying ? 0.6 : 1 }}
                          >
                            {buying ? "Opening checkout…" : `Book ${quantity} ticket${quantity === 1 ? "" : "s"}`}
                          </button>
                        ) : (
                          <p className="mt-4 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
                            Please sign in to book.
                          </p>
                        )}

                        {!!bookError && (
                          <p className="mt-2 text-sm" style={{ color: "#ff8a80" }}>{bookError}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
