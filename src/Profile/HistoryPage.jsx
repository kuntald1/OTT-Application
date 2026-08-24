import React, { useEffect, useState } from "react";
import { ArrowLeft, Clock, Play, CheckCircle2 } from "lucide-react";
import { COLORS } from "../theme";
import { fetchWatchHistory } from "../api";

// ---------------------------------------------------------------------------
// Watch History — every video the person has watched at least a few
// seconds of, most recent first. Real data from WatchProgress (see
// routers/watch_progress.py) — the same table that powers "Continue
// Watching" on the Play browse page and the resume-position embed URL
// param, not a separate/fake history log.
//
// Clicking a row navigates back to Plays and relies on the person
// re-opening that title from there — this page itself doesn't embed a
// player, matching how My List works (a list of things to act on
// elsewhere, not a playback surface of its own).
// ---------------------------------------------------------------------------

function formatWhen(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function HistoryPage({ onBack, onNavigate }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWatchHistory()
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, []);

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

        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Watch History</h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Everything you've watched, most recent first. Real playback progress, not an estimate.
        </p>

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            You haven't watched anything yet — titles you watch will show up here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((item) => (
              <button
                key={item.video_id}
                type="button"
                onClick={() => onNavigate?.("hero")}
                className="flex items-center gap-4 rounded-xl p-3 text-left transition-colors hover:bg-white/5"
                style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
                  {(item.thumbnail_url || item.poster_image_url) && (
                    <img
                      src={item.thumbnail_url || item.poster_image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                  {!item.finished && item.duration_seconds && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(0, Math.min(100, Math.round((item.position_seconds / item.duration_seconds) * 100)))}%`,
                          background: COLORS.gold,
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold" style={{ color: COLORS.cream }}>{item.title}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                    <Clock className="h-3 w-3" /> Watched {formatWhen(item.updated_at)}
                    {item.duration_seconds && ` · ${formatDuration(item.position_seconds)} of ${formatDuration(item.duration_seconds)}`}
                  </p>
                  <span
                    className="mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: item.finished ? "rgba(111,207,151,0.15)" : "rgba(212,175,55,0.15)",
                      color: item.finished ? "#6FCF97" : COLORS.gold,
                    }}
                  >
                    {item.finished ? (
                      <><CheckCircle2 className="h-3 w-3" /> Finished</>
                    ) : (
                      <><Play className="h-3 w-3" /> In progress</>
                    )}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
