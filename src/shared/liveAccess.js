// ---------------------------------------------------------------------------
// One place that answers "what can this viewer do with this live event?",
// so the floating badge, the Live listing page and the watch page can't
// disagree with each other — or with the server.
//
// The server already decided (routers/live_streams.py _check_live_access)
// and says so in has_access / access_reason. Nothing here re-derives that
// from subscriptions; it only turns the server's answer into a label and
// a destination.
// ---------------------------------------------------------------------------

export const SECTION_LABELS = { play: "Plays", archive: "Archive", both: "theomy" };

export function isLiveNow(ev) {
  return ev?.status === "active";
}

export function hasEnded(ev) {
  return ev?.status === "ended";
}

// "3 Nov, 5:00 PM" in the viewer's own timezone. The API sends UTC.
export function formatShowTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

export function formatPrice(ev) {
  if (ev?.price_inr == null) return null;
  const n = Number(ev.price_inr);
  return Number.isNaN(n) ? null : `₹${n % 1 === 0 ? n : n.toFixed(2)}`;
}

/**
 * kind:
 *   "watch"     — play it now
 *   "login"     — sign in first
 *   "subscribe" — needs a plan covering this event's section
 *   "pay"       — Pay Per Streaming, not bought yet
 *   "upcoming"  — announced, not broadcasting yet
 *   "ended"     — finished
 */
export function liveEventAction(ev) {
  if (!ev) return { kind: "ended", label: "Unavailable" };

  if (hasEnded(ev)) return { kind: "ended", label: "Ended" };

  if (!isLiveNow(ev)) {
    const when = formatShowTime(ev.scheduled_start_at);
    return {
      kind: "upcoming",
      label: "Details",
      hint: when ? `Starts ${when}` : "Starting soon",
    };
  }

  if (ev.has_access) return { kind: "watch", label: "Watch now" };

  if (ev.access_reason === "login_required") {
    return { kind: "login", label: "Sign in to watch" };
  }
  if (ev.access_reason === "purchase_required") {
    const price = formatPrice(ev);
    return { kind: "pay", label: price ? `Buy for ${price}` : "Buy to watch" };
  }
  const where = SECTION_LABELS[ev.section] || "theomy";
  return { kind: "subscribe", label: `Subscribe to ${where}` };
}
