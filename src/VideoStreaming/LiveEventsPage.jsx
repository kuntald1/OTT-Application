import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Radio, CalendarClock } from "lucide-react";
import { COLORS } from "../theme";
import { fetchActiveLiveStreams } from "../api";
import { useApp } from "../context/AppContext";
import {
  formatShowTime, formatPrice, isLiveNow, liveEventAction,
} from "../shared/liveAccess";

// ---------------------------------------------------------------------------
// Live & Upcoming — every announced event in one place, on air or not.
// Reachable at /live and from the floating badge.
//
// Deliberately visible to signed-out visitors: an announced show is a
// promotion, and the people most worth reaching with it are the ones who
// haven't subscribed yet. What they can't do is watch — the server
// decides that and the card's button says so.
// ---------------------------------------------------------------------------

const REFRESH_MS = 30000;

function Poster({ event }) {
  if (event.poster_image_url) {
    return <img src={event.poster_image_url} alt="" className="h-full w-full object-cover" />;
  }
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: "linear-gradient(135deg, rgba(212,175,55,0.18), rgba(248,113,113,0.12))" }}
    >
      <Radio className="h-7 w-7" style={{ color: "rgba(245,235,221,0.35)" }} />
    </div>
  );
}

function EventCard({ event, onAct }) {
  const action = liveEventAction(event);
  const live = isLiveNow(event);
  const when = formatShowTime(event.scheduled_start_at);
  const price = formatPrice(event);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl"
      style={{ background: "#150307", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="relative aspect-video w-full">
        <Poster event={event} />
        {live ? (
          <span
            className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
            style={{ background: "#E0324C" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            LIVE
          </span>
        ) : when ? (
          <span
            className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: "rgba(10,1,4,0.75)", color: COLORS.gold }}
          >
            <CalendarClock className="h-3 w-3" /> {when}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-base font-semibold" style={{ color: COLORS.cream }}>{event.title}</h3>
        {event.description && (
          <p className="line-clamp-2 text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
            {event.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
            {live ? (action.kind === "watch" ? "On air now" : price || "On air now") : action.hint}
          </span>
          <button
            type="button"
            onClick={() => onAct(event, action)}
            disabled={action.kind === "ended"}
            className="whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            style={
              action.kind === "watch" || action.kind === "pay"
                ? { background: COLORS.gold, color: "#0a0104" }
                : { background: "rgba(245,235,221,0.08)", color: COLORS.cream }
            }
          >
            {action.label}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LiveEventsPage({ onBack, onNavigate }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const { requestLogin } = useApp();

  const load = useCallback(() => {
    fetchActiveLiveStreams(undefined, true)
      .then((rows) => setEvents(Array.isArray(rows) ? rows : []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const handleAct = (event, action) => {
    if (action.kind === "login") return requestLogin?.();
    if (action.kind === "subscribe") return onNavigate?.("subscription");
    // watch / pay / upcoming all open the event's own page, which holds
    // the player, the checkout and the full description.
    onNavigate?.("liveWatch", { liveStreamId: event.id });
  };

  const liveCount = events.filter(isLiveNow).length;

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
          <Radio className="h-6 w-6" style={{ color: COLORS.gold }} /> Live &amp; Upcoming
        </h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
          {liveCount > 0
            ? `${liveCount} show${liveCount > 1 ? "s" : ""} on air right now.`
            : "Announced shows — come back at show time to watch."}
        </p>

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            Nothing live or announced right now.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((ev) => (
              <EventCard key={ev.id} event={ev} onAct={handleAct} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
