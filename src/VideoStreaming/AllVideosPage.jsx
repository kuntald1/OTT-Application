import React, { useEffect, useState } from "react";
import { ArrowLeft, Film, Search, SearchX, X } from "lucide-react";
import { COLORS } from "../theme";
import { useApp } from "../context/AppContext";
import { useAnimatedModal } from "../shared/useAnimatedModal";
import { fetchPublishedVideos, searchVideos } from "../api";
import { RealDetailModal } from "./VideoBrowsePage";

// ---------------------------------------------------------------------------
// All Videos — reached from the search icon in the top nav.
//
// Shows EVERY published video (Plays and Archive together) in one grid,
// newest publish date first. No new backend work: GET /videos already
// returns published videos only, across both sections when no `section`
// is passed, ordered by published_at DESC (see list_published_videos in
// routers/videos.py) — the order is used exactly as the server returns it.
//
// The search box uses the same real search as before (GET /videos/search:
// title, description, category, cast/crew names and studio name, both
// sections, also newest-published first). An empty box shows the full list.
//
// Clicking a card opens that video's detail popup RIGHT HERE — the same
// RealDetailModal the Plays and Archive pages use (ads, resume,
// screens-limit, purchase/subscribe prompts) — so the page, the search
// text and the results all stay exactly as they were behind it.
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 300;

export default function AllVideosPage({ onBack, onNavigate }) {
  const modal = useAnimatedModal();
  const { isLoggedIn, requestLogin } = useApp();

  const [videos, setVideos] = useState([]);       // full list, newest first
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);   // null = not searching
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPublishedVideos()
      .then(setVideos)
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, []);

  // Debounced live search. `cancelled` drops a stale response if the person
  // kept typing (or cleared the box) before it came back, so results from an
  // older query can never overwrite newer ones.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      searchVideos(q)
        .then((r) => { if (!cancelled) setResults(r); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const handleSelect = (v) => {
    // Same rule as clicking a card on the Plays/Archive pages.
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    modal.open({
      id: v.id,
      title: v.title,
      poster: v.poster_image_url || v.thumbnail_url || "",
      isReal: true,
      videoId: v.id,
      trailerUrl: v.trailer_playback_url || null,
    });
  };

  const trimmed = query.trim();
  const shown = results !== null ? results : videos;
  const waitingForFirstResults = searching && results === null;

  let infoLine = "Plays and Archive together, newest published first.";
  if (trimmed && !waitingForFirstResults) {
    infoLine = searching
      ? "Searching…"
      : `${shown.length} ${shown.length === 1 ? "result" : "results"} for "${trimmed}", newest published first.`;
  }

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
        <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
          {infoLine}
        </p>

        <div
          className="mb-8 flex max-w-md items-center gap-2 rounded-full px-4 py-2"
          style={{ border: "1px solid rgba(212,175,55,0.4)", background: "rgba(255,255,255,0.03)" }}
        >
          <Search className="h-4 w-4 flex-shrink-0" style={{ color: "rgba(245,235,221,0.5)" }} />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            placeholder="Search title, cast, crew, category…"
            aria-label="Search videos"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder-white/40"
            style={{ color: COLORS.cream }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="flex-shrink-0 hover:opacity-80"
              style={{ color: "rgba(245,235,221,0.6)" }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {loading || waitingForFirstResults ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            {loading ? "Loading…" : "Searching…"}
          </p>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            {trimmed ? (
              <SearchX className="h-8 w-8" style={{ color: "rgba(245,235,221,0.3)" }} />
            ) : (
              <Film className="h-8 w-8" style={{ color: "rgba(245,235,221,0.3)" }} />
            )}
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
              {trimmed ? `No videos found for "${trimmed}".` : "No videos have been published yet."}
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            style={{ opacity: searching ? 0.6 : 1 }}
          >
            {shown.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => handleSelect(v)}
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

      {modal.item && (
        <RealDetailModal
          card={modal.item}
          closing={modal.closing}
          onClose={modal.close}
          onNavigate={onNavigate}
          onSelectRelated={(relatedCard) => modal.open(relatedCard)}
        />
      )}
    </div>
  );
}
