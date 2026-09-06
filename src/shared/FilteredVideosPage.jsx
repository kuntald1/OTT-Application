import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS } from "../theme";
import { fetchPublishedVideos } from "../api";

// ---------------------------------------------------------------------------
// The video grid shown after clicking a tile in DiscoveryRows — either every
// published video in a language, or every published video from one studio
// (Plays Organiser), always scoped to the section (Play/Archive) the tile
// was clicked from.
// ---------------------------------------------------------------------------

export default function FilteredVideosPage({ section, language, uploadedBy, title, onBack, onOpenVideo }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPublishedVideos(section, { language, uploadedBy })
      .then(setVideos)
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, [section, language, uploadedBy]);

  return (
    <div style={{ background: COLORS.black, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}>
      <main className={`px-6 pb-16 pt-24 sm:px-10 sm:pt-28`}>
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-sm font-medium hover:opacity-80"
          style={{ color: "rgba(245,235,221,0.6)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-6 text-2xl font-semibold sm:text-3xl" style={{ color: COLORS.cream }}>{title}</h1>

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : videos.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No videos found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {videos.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onOpenVideo?.(v.id)}
                className="group text-left"
              >
                <div className="relative mb-2 aspect-[2/3] overflow-hidden rounded-lg" style={{ background: "#1a1a1a" }}>
                  {v.poster_image_url && (
                    <img src={v.poster_image_url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  )}
                </div>
                <p className="truncate text-sm font-medium" style={{ color: COLORS.cream }}>{v.title}</p>
                <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{v.release_year}</p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
