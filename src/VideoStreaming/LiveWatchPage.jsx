import React, { useEffect, useState } from "react";
import { ArrowLeft, Radio } from "lucide-react";
import { COLORS } from "../theme";
import { fetchLiveStream } from "../api";
import { useApp } from "../context/AppContext";
import LiveVideoPlayer from "./LiveVideoPlayer";

// ---------------------------------------------------------------------------
// Watch a single live stream. No subscription check yet — see
// LiveStream's backend docstring, deferred by explicit decision. Just
// requires being logged in, same as the rest of the site.
// ---------------------------------------------------------------------------

export default function LiveWatchPage({ liveStreamId, onBack }) {
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isLoggedIn, requestLogin } = useApp();

  useEffect(() => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    setLoading(true);
    fetchLiveStream(liveStreamId)
      .then(setLive)
      .catch(() => setLive(null))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStreamId, isLoggedIn]);

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
                <div className="flex aspect-video w-full items-center justify-center" style={{ background: COLORS.blackSoft }}>
                  <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
                    {live.status === "ended" ? "This broadcast has ended." : "Not live yet — check back soon."}
                  </p>
                </div>
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
