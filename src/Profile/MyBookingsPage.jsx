import React, { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Calendar, Ticket } from "lucide-react";
import { COLORS } from "../theme";
import { fetchMyTicketBookings, fetchTicketQrObjectUrl } from "../api";

// ---------------------------------------------------------------------------
// Tickets this person has bought for shows they will physically attend.
//
// Only paid bookings come back from the server, so there is no status to
// show — a row here IS a ticket. What matters is the booking number and
// the QR code, and both need to be readable at a dim venue door, which
// is why the number is set large and the QR is on white.
// ---------------------------------------------------------------------------

export default function MyBookingsPage({ onBack }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchMyTicketBookings()
      .then(setBookings)
      .catch((e) => setError(e.message || "Couldn't load your bookings."))
      .finally(() => setLoading(false));
  }, []);

  const formatWhen = (iso, time) => {
    if (!iso) return "";
    const d = new Date(iso).toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });
    return time ? `${d}, ${time}` : d;
  };

  return (
    <div style={{ background: COLORS.black, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}>
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>My Bookings</h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Show the QR code at the venue. If your phone is flat, the booking number is enough.
        </p>

        {loading && <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>}
        {!!error && <p style={{ color: "#ff8a80" }}>{error}</p>}

        {!loading && !error && bookings.length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(245,235,221,0.04)" }}>
            <Ticket className="mx-auto h-8 w-8" style={{ color: "rgba(245,235,221,0.3)" }} />
            <p className="mt-3 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
              You haven't booked any shows yet.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} formatWhen={formatWhen} />
          ))}
        </div>
      </main>
    </div>
  );
}

function BookingCard({ booking, formatWhen }) {
  const [qrUrl, setQrUrl] = useState("");

  // The QR is fetched with the auth header and held as a blob URL, so
  // the token never ends up in a URL. Revoked on unmount so the blob
  // doesn't linger for the life of the tab.
  useEffect(() => {
    let url = "";
    let cancelled = false;
    fetchTicketQrObjectUrl(booking.id)
      .then((u) => {
        url = u;
        if (!cancelled) setQrUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [booking.id]);

  const used = !!booking.checked_in_at;

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(245,235,221,0.04)",
        border: `1px solid ${used ? "rgba(245,235,221,0.1)" : "rgba(212,175,55,0.3)"}`,
        opacity: used ? 0.6 : 1,
      }}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold" style={{ color: COLORS.cream }}>
            {booking.event_title || "Show"}
          </p>

          {booking.event_date && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm" style={{ color: "rgba(245,235,221,0.65)" }}>
              <Calendar className="h-3.5 w-3.5" /> {formatWhen(booking.event_date, booking.event_time)}
            </p>
          )}
          {booking.event_venue && (
            <p className="mt-1 flex items-center gap-1.5 text-sm" style={{ color: "rgba(245,235,221,0.65)" }}>
              <MapPin className="h-3.5 w-3.5" /> {booking.event_venue}
            </p>
          )}

          <p className="mt-3 text-sm" style={{ color: "rgba(245,235,221,0.75)" }}>
            {booking.quantity} × {booking.tier_name} · ₹{Number(booking.amount).toLocaleString("en-IN")}
          </p>

          <p className="mt-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.45)" }}>
            Booking number
          </p>
          <p className="text-xl font-bold tracking-widest" style={{ color: COLORS.gold }}>
            {booking.booking_reference}
          </p>

          {used && (
            <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
              Checked in on {new Date(booking.checked_in_at).toLocaleString("en-GB")}
            </p>
          )}
        </div>

        <div className="shrink-0 self-center sm:self-start">
          {qrUrl ? (
            <img
              src={qrUrl}
              alt={`QR code for booking ${booking.booking_reference}`}
              className="h-36 w-36 rounded-lg"
              style={{ background: "#fff", padding: 6 }}
            />
          ) : (
            <div
              className="flex h-36 w-36 items-center justify-center rounded-lg text-xs"
              style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.4)" }}
            >
              QR loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
