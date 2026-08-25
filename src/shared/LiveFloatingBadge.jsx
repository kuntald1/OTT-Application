import React, { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { fetchActiveLiveStreams } from "../api";
import { useApp } from "../context/AppContext";

// ---------------------------------------------------------------------------
// LiveFloatingBadge — a persistent, fixed bottom-right indicator that
// shows whenever ANY live stream (either section) is currently active.
// Meant to be rendered once at the App level so it's visible on every
// page, not tied to any specific browse page's own "Live Now" row.
// ---------------------------------------------------------------------------

export default function LiveFloatingBadge({ onNavigate }) {
  const { isLoggedIn } = useApp();
  const [liveStreams, setLiveStreams] = useState([]);

  useEffect(() => {
    if (!isLoggedIn) {
      setLiveStreams([]);
      return;
    }
    const load = () => {
      fetchActiveLiveStreams() // no section filter — any active stream, either section
        .then(setLiveStreams)
        .catch(() => setLiveStreams([]));
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  if (liveStreams.length === 0) return null;

  const primary = liveStreams[0];

  return (
    <button
      type="button"
      onClick={() => onNavigate?.("liveWatch", { liveStreamId: primary.id })}
      className="group fixed bottom-6 right-6 z-40 flex w-64 items-center gap-3 overflow-hidden rounded-xl p-3 text-left shadow-2xl transition-transform hover:scale-[1.02]"
      style={{ background: "#150307", border: "1px solid rgba(248,113,113,0.4)" }}
    >
      <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
        {primary.poster_image_url && (
          <img src={primary.poster_image_url} alt="" className="h-full w-full object-cover" />
        )}
        <span className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          LIVE
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#f87171" }}>
          <Radio className="h-3 w-3" /> Live Now{liveStreams.length > 1 ? ` (${liveStreams.length})` : ""}
        </p>
        <p className="truncate text-sm font-semibold" style={{ color: "#f5ebdd" }}>{primary.title}</p>
      </div>
    </button>
  );
}
