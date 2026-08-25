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

  const handleClick = () => {
    if (liveStreams.length === 1) {
      onNavigate?.("liveWatch", { liveStreamId: liveStreams[0].id });
    } else {
      onNavigate?.("hero"); // multiple live — send them to Plays, where the full Live Now row is
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
      style={{ background: "#f87171", boxShadow: "0 4px 20px rgba(248,113,113,0.4)" }}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      <Radio className="h-4 w-4" />
      {liveStreams.length === 1 ? liveStreams[0].title : `${liveStreams.length} Live Now`}
    </button>
  );
}
