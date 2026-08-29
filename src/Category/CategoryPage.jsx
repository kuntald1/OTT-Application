import React, { useMemo, useState, useEffect } from "react";
import { X } from "lucide-react";
import { COLORS, NAV_CLEARANCE_CLASS } from "../theme";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../shared/categories";
import { fetchCategoryOptions, fetchPublishedVideos } from "../api";
import { useApp } from "../context/AppContext";
import { useAnimatedModal } from "../shared/useAnimatedModal";
import { HoverTrailerPreview, RealDetailModal } from "../VideoStreaming/VideoBrowsePage";

// ---------------------------------------------------------------------------
// Category — reached by clicking a category in the nav's Category dropdown.
// Real, published videos (any section — Play or Archive) filtered by
// category, using the same hover-trailer preview and full-featured
// playback modal (ads, revenue tracking, resume, subtitles) as Play and
// Archive — see VideoStreaming/VideoBrowsePage.jsx's exported
// HoverTrailerPreview/RealDetailModal for the shared implementation.
//
// No Title/Release Year/Duration caption here — that's an Archive-only
// treatment per explicit instruction; this page matches Play's plain
// hover-only title behavior instead.
//
// Theater/Ticketing events aren't merged in here — TheaterBrowsePage.jsx
// already has its own real, category-filterable browsing UI for those.
// ---------------------------------------------------------------------------

const POSTER_POOL = [
  "linear-gradient(135deg, #3a1a1a, #1a0a0a)",
  "linear-gradient(135deg, #1a2a3a, #0a141a)",
  "linear-gradient(135deg, #2a1a3a, #140a1a)",
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? COLORS.gold : "rgba(255,255,255,0.15)",
        background: active ? "rgba(212,175,55,0.14)" : "transparent",
        color: active ? COLORS.gold : "rgba(255,255,255,0.7)",
      }}
    >
      {children}
    </button>
  );
}

function toggleInSet(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function CategoryPage({ initialCategory, onNavigate }) {
  const [categoryFilter, setCategoryFilter] = useState(new Set(initialCategory ? [initialCategory] : []));
  const [CATEGORIES, setCategories] = useState(FALLBACK_CATEGORIES);
  const [allVideos, setAllVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategoryOptions().then((cats) => {
      if (cats.length > 0) setCategories(cats);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPublishedVideos() // no section filter — every published video, Play or Archive
      .then((videos) => {
        setAllVideos(
          videos.map((v) => ({
            id: v.id,
            title: v.title,
            poster: v.poster_image_url || v.thumbnail_url || null,
            isReal: true,
            videoId: v.id,
            trailerUrl: v.trailer_playback_url || null,
            categories: v.categories || [],
          }))
        );
      })
      .catch(() => setAllVideos([]))
      .finally(() => setLoading(false));
  }, []);

  const modal = useAnimatedModal();
  const { isLoggedIn, requestLogin } = useApp();

  const filtered = useMemo(() => {
    if (categoryFilter.size === 0) return allVideos;
    return allVideos.filter((v) => v.categories.some((c) => categoryFilter.has(c)));
  }, [allVideos, categoryFilter]);

  const handleCardClick = (card) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    modal.open(card);
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className={`px-6 pb-12 sm:px-10 ${NAV_CLEARANCE_CLASS}`}>
        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Browse by Category</h1>
        <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Every published title, filterable by category.
        </p>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          <aside
            className="flex-shrink-0 rounded-2xl p-5 lg:sticky lg:top-24 lg:w-64"
            style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <h2 className="mb-4 text-lg font-semibold" style={{ color: COLORS.cream }}>Filters</h2>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>Category</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <FilterPill key={c} active={categoryFilter.has(c)} onClick={() => setCategoryFilter((s) => toggleInSet(s, c))}>
                  {c}
                </FilterPill>
              ))}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
              {loading ? "Loading…" : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
            </p>

            {!loading && filtered.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>No videos match this category yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((card) => (
                  <button type="button" key={card.id} onClick={() => handleCardClick(card)} className="group relative text-left">
                    <div
                      className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl"
                      style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)", background: POSTER_POOL[hashStr(card.id) % POSTER_POOL.length] }}
                    >
                      <HoverTrailerPreview poster={card.poster} trailerUrl={card.trailerUrl} title={card.title} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
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
