import React, { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Calendar, Clock } from "lucide-react";
import { COLORS } from "../theme";
import { fetchPublicEvent } from "../api";

export default function EventDetailPage({ eventId, onBack }) {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    fetchPublicEvent(eventId)
      .then(setEvent)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [eventId]);

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

            {event.ticket_tiers.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-xs font-semibold uppercase" style={{ color: "rgba(245,235,221,0.5)" }}>Tickets</p>
                <div className="flex flex-col gap-1.5">
                  {event.ticket_tiers.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(245,235,221,0.04)" }}>
                      <span style={{ color: COLORS.cream }}>{t.tier_name}</span>
                      <span style={{ color: COLORS.gold }}>₹{Number(t.price).toLocaleString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
