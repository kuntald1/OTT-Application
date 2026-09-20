import React, { useEffect, useState } from "react";
import { ArrowLeft, Film } from "lucide-react";
import { COLORS } from "../theme";
import { fetchPublishedVideos } from "../api";

// ---------------------------------------------------------------------------
// All Videos — reached from the search icon in the top nav.
//
// Shows EVERY published video (Plays and Archive together) in one grid,
// newest publish date first. No new backend work: GET /videos already
// returns published videos only, across both sections when no `section`
// is passed, ordered by published_at DESC (see list_published_videos in
// routers/videos.py) — the order is used exactly as the server returns it.
//
// Clicking a card behaves exactly like a search result (see
// SearchResultsPage): it goes to that video's own section (Plays →
// "hero", Archive → "accordion") with openVideoId set, so the same
// fully-featured detail modal opens (ads, resume, screens-limit,
// purchase flow) instead of a separate/simpler page.
// ---------------------------------------------------------------------------

export default function AllVideosPage({ onBack, onNavigate }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPublishedVideos()
      .then(setVideos)
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-6xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-1 text-2xl font-semibold" style={{ color: COLORS.cream }}>
          All Videos
        </h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
          Plays and Archive together, newest published first.
        </p>

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Film className="h-8 w-8" style={{ color: "rgba(245,235,221,0.3)" }} />
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
              No videos have been published yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {videos.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onNavigate?.(v.section === "archive" ? "accordion" : "hero", { openVideoId: v.id })}
                className="group text-left"
              >
                <div className="aspect-[2/3] w-full overflow-hidden rounded-lg" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.08)" }}>
                  {(v.poster_image_url || v.thumbnail_url) && (
                    <img
                      src={v.poster_image_url || v.thumbnail_url}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium" style={{ color: COLORS.cream }}>{v.title}</p>
                {v.categories?.length > 0 && (
                  <p className="truncate text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{v.categories.join(", ")}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
