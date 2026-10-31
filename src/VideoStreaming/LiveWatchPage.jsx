import React, { useEffect, useState } from "react";
import { ArrowLeft, Radio, CalendarClock, Lock } from "lucide-react";
import { COLORS } from "../theme";
import { fetchLiveStream } from "../api";
import { useApp } from "../context/AppContext";
import LiveVideoPlayer from "./LiveVideoPlayer";
import { formatShowTime, formatPrice, liveEventAction } from "../shared/liveAccess";

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
function LockedPanel({ live, onNavigate, requestLogin }) {
  const action = liveEventAction(live);
  const when = formatShowTime(live.scheduled_start_at);
  const price = formatPrice(live);

  let icon = <CalendarClock className="h-6 w-6" />;
  let headline = "Not live yet";
  let detail = when ? `Starts ${when}` : "Come back at show time.";
  let cta = null;

  if (action.kind === "ended") {
    headline = "This broadcast has ended.";
    detail = "";
    icon = <Radio className="h-6 w-6" />;
  } else if (action.kind === "login") {
    icon = <Lock className="h-6 w-6" />;
    headline = "This show is on air now";
    detail = "Sign in to watch it.";
    cta = { label: "Sign in", onClick: () => requestLogin?.() };
  } else if (action.kind === "subscribe") {
    icon = <Lock className="h-6 w-6" />;
    headline = "This show is on air now";
    detail = `${action.label} to watch it.`;
    cta = { label: action.label, onClick: () => onNavigate?.("subscription") };
  } else if (action.kind === "pay") {
    icon = <Lock className="h-6 w-6" />;
    headline = "This show is on air now";
    detail = price ? `Buy this show for ${price} to watch it.` : "Buy this show to watch it.";
    // Checkout isn't wired yet — saying so beats a button that does
    // nothing. Replaced by the real Razorpay flow in the payment pass.
    cta = { label: "Ticket sales open soon", onClick: null };
  }

  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-3 px-6 text-center"
      style={{ background: COLORS.blackSoft }}
    >
      <span style={{ color: "rgba(245,235,221,0.35)" }}>{icon}</span>
      <p className="text-base font-semibold" style={{ color: COLORS.cream }}>{headline}</p>
      {detail && <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>{detail}</p>}
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
    </div>
  );
}

export default function LiveWatchPage({ liveStreamId, onBack, onNavigate }) {
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const { requestLogin } = useApp();

  useEffect(() => {
    setLoading(true);
    fetchLiveStream(liveStreamId)
      .then(setLive)
      .catch(() => setLive(null))
      .finally(() => setLoading(false));
  }, [liveStreamId]);

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
                <LockedPanel live={live} onNavigate={onNavigate} requestLogin={requestLogin} />
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
