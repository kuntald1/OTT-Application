import React, { useMemo, useState, useEffect } from "react";
import { Play, Ticket, Plus, Check, X, Star } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { CATEGORIES as FALLBACK_CATEGORIES } from "../shared/categories";
import { fetchCategoryOptions } from "../api";
import { SHOWS } from "../Theater/showsData";
import { useApp } from "../context/AppContext";
import { useAnimatedModal } from "../shared/useAnimatedModal";

import filmsPoster from "../assets/posters/films.jpg";
import seriesPoster from "../assets/posters/series.jpg";
import familyPoster from "../assets/posters/family.jpg";
import originalsPoster from "../assets/posters/originals.jpg";
import livePoster from "../assets/posters/live.jpg";
import palCrimson from "../assets/posters/pal-crimson.jpg";
import palTeal from "../assets/posters/pal-teal.jpg";
import palPurple from "../assets/posters/pal-purple.jpg";

import archive1 from "../Archive/assets/posters/archive-1.jpg";
import archive2 from "../Archive/assets/posters/archive-2.jpg";
import archive3 from "../Archive/assets/posters/archive-3.jpg";
import archive4 from "../Archive/assets/posters/archive-4.jpg";

// ---------------------------------------------------------------------------
// Category — reached by clicking a category in the nav's Category dropdown.
// Aggregates matching content from Video Streaming, Movies, Theater, and
// Archive into one grid.
//
// Subscription gating: opening a card's detail popup requires an active
// subscription — EXCEPT Theater cards, which stay open/bookable without one
// (ticket booking is separate from the streaming subscription).
// ---------------------------------------------------------------------------

const TITLE_POOL = ["Season of Ash", "Northbound", "The Glass House", "Amber & Rust", "The Quiet War", "Midnight Ferry", "The Red Courtyard", "Echoes of Midnight"];
const VS_POSTERS = [filmsPoster, seriesPoster, familyPoster, originalsPoster, livePoster, palCrimson, palTeal, palPurple];
const AR_POSTERS = [archive1, archive2, archive3, archive4];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function buildDemoCard(section, category, i, posterPool) {
  const h = hashStr(section + category + i);
  const title = TITLE_POOL[h % TITLE_POOL.length];
  return {
    id: `${section}-${category}-${i}`,
    section,
    category,
    title,
    poster: posterPool[h % posterPool.length],
    meta: section === "Archive" ? `${1975 + (h % 40)} · ${1 + (h % 2)}h ${(h % 50).toString().padStart(2, "0")}m` : `${2023 + (h % 3)} · ${1 + (h % 2)}h ${(h % 50).toString().padStart(2, "0")}m`,
    rating: (7 + ((h % 28) / 10)).toFixed(1),
  };
}

function buildResultsForCategory(category) {
  const results = [];
  for (let i = 0; i < 3; i++) results.push(buildDemoCard("Video Streaming", category, i, VS_POSTERS));
  for (let i = 0; i < 3; i++) results.push(buildDemoCard("Movies", category, i, VS_POSTERS));
  for (let i = 0; i < 2; i++) results.push(buildDemoCard("Archive", category, i, AR_POSTERS));
  SHOWS.filter((s) => s.category === category).forEach((s) => {
    results.push({
      id: s.id, section: "Theater", category: s.category, title: s.title,
      poster: s.posterLarge, meta: `${s.venue} · ${s.date}`, rating: s.rating, price: s.price,
    });
  });
  return results;
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

  useEffect(() => {
    fetchCategoryOptions().then((cats) => {
      if (cats.length > 0) setCategories(cats);
    }).catch(() => {});
  }, []);
  const modal = useAnimatedModal();
  const { isLoggedIn, requestLogin } = useApp();

  const filtered = useMemo(() => {
    const cats = categoryFilter.size > 0 ? Array.from(categoryFilter) : CATEGORIES;
    return cats.flatMap(buildResultsForCategory);
  }, [categoryFilter]);

  const handleCardClick = (card) => {
    if (card.section === "Theater") {
      modal.open(card);
      return;
    }
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    modal.open(card);
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="px-6 pb-12 pt-24 sm:px-10 sm:pt-28">
        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Browse by Category</h1>
        <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Results pulled from Video Streaming, Movies, Theater, and Archive.
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
            <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>{filtered.length} results</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((card) => (
                <button type="button" key={card.id} onClick={() => handleCardClick(card)} className="group relative text-left">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}>
                    <img src={card.poster} alt="" className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-110" />
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      <Star className="h-2.5 w-2.5" style={{ fill: COLORS.gold, color: COLORS.gold }} /> {card.rating}
                    </span>
                    <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: COLORS.gold }}>
                      {card.section}
                    </span>
                  </div>
                  <p className="mt-2.5 truncate text-sm font-medium" style={{ color: COLORS.cream }}>{card.title}</p>
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{card.meta}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {modal.item && <CategoryModal card={modal.item} closing={modal.closing} onClose={modal.close} onNavigate={onNavigate} />}
    </div>
  );
}

function CategoryModal({ card, closing, onClose, onNavigate }) {
  const { isLoggedIn, isSubscribed, requestLogin, isInList, toggleListItem } = useApp();
  const saved = isInList(card.id);
  const isTicketed = card.section === "Theater";
  const [entered, setEntered] = useState(false);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = entered && !closing;

  const handleAddToList = () => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    toggleListItem({ id: card.id, title: card.title, image: card.poster, meta: card.meta, section: card.section });
  };

  const handlePrimaryAction = () => {
    if (isTicketed) return; // Book Tickets — no subscription required
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    if (!isSubscribed) {
      onClose();
      onNavigate?.("subscription");
      return;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", opacity: shown ? 1 : 0, backdropFilter: shown ? "blur(6px)" : "blur(0px)", WebkitBackdropFilter: shown ? "blur(6px)" : "blur(0px)", transition: "opacity 320ms ease, backdrop-filter 320ms ease" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{
          background: COLORS.blackSoft, maxHeight: "90vh", overflowY: "auto",
          transform: shown ? "perspective(1200px) scale(1) translateY(0) rotateX(0deg)" : "perspective(1200px) scale(0.82) translateY(32px) rotateX(8deg)",
          opacity: shown ? 1 : 0,
          transition: "transform 480ms cubic-bezier(0.22, 1.28, 0.36, 1), opacity 340ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full">
          <img src={card.poster} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${COLORS.blackSoft}FF 100%)` }} />
          <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
            <X className="h-4 w-4" />
          </button>
          <h2 className="absolute bottom-4 left-6 right-16 text-2xl font-semibold sm:text-3xl" style={{ color: COLORS.cream }}>{card.title}</h2>
        </div>
        <div className="px-6 py-6">
          <div className="mb-4 flex items-center gap-3">
            <button type="button" onClick={handlePrimaryAction} className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90" style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}>
              {isTicketed ? <><Ticket className="h-4 w-4" /> Book Tickets — {card.price}</> : <><Play className="h-4 w-4" style={{ fill: CTA_TEXT_COLOR }} /> Play</>}
            </button>
            <button
              type="button"
              onClick={handleAddToList}
              aria-label={saved ? "Remove from My List" : "Add to My List"}
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
              style={{ borderColor: saved ? COLORS.gold : "rgba(255,255,255,0.3)", color: saved ? COLORS.gold : "#fff", background: saved ? "rgba(212,175,55,0.12)" : "transparent" }}
            >
              {saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
            <span className="flex items-center gap-1" style={{ color: COLORS.gold }}><Star className="h-4 w-4" style={{ fill: COLORS.gold }} /> {card.rating}</span>
            <span>{card.meta}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs" style={{ color: COLORS.gold }}>{card.category}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs" style={{ color: "rgba(245,235,221,0.7)" }}>{card.section}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
