import React, { useEffect, useState } from "react";
import { ArrowLeft, SearchX } from "lucide-react";
import { COLORS } from "../theme";
import { searchVideos } from "../api";

// ---------------------------------------------------------------------------
// Real search results — title, description, category, cast, and crew
// name matches (see routers/videos.py's search_videos). Clicking a
// result navigates back to Plays with openVideoId set, so
// VideoBrowsePage opens that exact video's real detail modal — the
// same fully-featured one used everywhere else (ads, resume position,
// screens-limit, purchase flow), not a separate/simpler page.
// ---------------------------------------------------------------------------

export default function SearchResultsPage({ query, section, onBack, onNavigate }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    searchVideos(query, section)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [query, section]);

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
          Search results for "{query}"
        </h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
          Matches title, description, category, cast, and crew names.
        </p>

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Searching…</p>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <SearchX className="h-8 w-8" style={{ color: "rgba(245,235,221,0.3)" }} />
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
              No videos found for "{query}".
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {results.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onNavigate?.(section === "archive" ? "accordion" : "hero", { openVideoId: v.id })}
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
