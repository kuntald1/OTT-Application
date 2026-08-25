import React, { useEffect, useState } from "react";
import { Radio, ChevronUp, ChevronDown } from "lucide-react";
import { fetchActiveLiveStreams } from "../api";
import { useApp } from "../context/AppContext";

// ---------------------------------------------------------------------------
// LiveFloatingBadge — a persistent, fixed bottom-right indicator that
// shows whenever ANY live stream (either section) is currently active.
// Meant to be rendered once at the App level so it's visible on every
// page, not tied to any specific browse page's own "Live Now" row.
//
// With exactly one active stream, clicking it goes straight there. With
// more than one, clicking expands a small stacked list so every stream
// is reachable — there's no other "Live Now" browse page anymore (see
// VideoBrowsePage.jsx / MovixBrowsePage.jsx), so this is the only entry
// point and needs to reach all of them, not just the most recent.
// ---------------------------------------------------------------------------

function LiveCard({ stream, onClick, compact }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-64 items-center gap-3 overflow-hidden rounded-xl p-3 text-left transition-transform hover:scale-[1.02]"
      style={{ background: "#150307", border: "1px solid rgba(248,113,113,0.4)" }}
    >
      <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg" style={{ background: "rgba(255,255,255,0.06)" }}>
        {stream.poster_image_url && (
          <img src={stream.poster_image_url} alt="" className="h-full w-full object-cover" />
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
        {!compact && (
          <p className="mb-0.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide" style={{ color: "#f87171" }}>
            <Radio className="h-3.5 w-3.5" /> Live Now
          </p>
        )}
        <p className="truncate text-sm font-semibold" style={{ color: "#f5ebdd" }}>{stream.title}</p>
      </div>
    </button>
  );
}

export default function LiveFloatingBadge({ onNavigate }) {
  const { isLoggedIn } = useApp();
  const [liveStreams, setLiveStreams] = useState([]);
  const [expanded, setExpanded] = useState(false);

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

  const goTo = (stream) => {
    setExpanded(false);
    onNavigate?.("liveWatch", { liveStreamId: stream.id });
  };

  if (liveStreams.length === 1) {
    return (
      <div className="fixed bottom-6 right-6 z-40 shadow-2xl">
        <LiveCard stream={liveStreams[0]} onClick={() => goTo(liveStreams[0])} />
      </div>
    );
  }

  // Multiple active streams — the badge itself just shows a count and
  // toggles an expanded stacked list above it, so every stream stays
  // reachable (not just whichever started most recently).
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {expanded && (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-xl p-1 shadow-2xl">
          {liveStreams.map((s) => (
            <LiveCard key={s.id} stream={s} onClick={() => goTo(s)} compact />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 rounded-full px-4 py-3 shadow-2xl transition-transform hover:scale-105"
        style={{ background: "#f87171", color: "#0a0104" }}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
        </span>
        <Radio className="h-4 w-4" />
        <span className="text-sm font-bold">LIVE NOW ({liveStreams.length})</span>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
    </div>
  );
}
