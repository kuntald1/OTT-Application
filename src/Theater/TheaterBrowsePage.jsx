import React, { useMemo, useState } from "react";
import { Ticket, Info, Plus, Check, X, Star, MapPin, Calendar, SlidersHorizontal, ChevronDown } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, NAV_CLEARANCE_CLASS } from "../theme";
import { SHOWS, CATEGORIES, VENUES } from "./showsData";
import { useApp } from "../context/AppContext";
import { useAnimatedModal } from "../shared/useAnimatedModal";

// ---------------------------------------------------------------------------
// Theater Browse — exactly the 8 real shows from showsData.js (same ones
// cycling in the Hero above), shown once each with no generated repeats,
// and no genre-row categorization. Instead: a ticketing-style Filters panel
// (category / date / venue / price) narrows the same fixed list, the way a
// real booking site would.
// ---------------------------------------------------------------------------

const T = {
  pageBg: COLORS.black,
  border: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.7)",
  textFaint: "rgba(255,255,255,0.5)",
  textFainter: "rgba(255,255,255,0.4)",
  modalSurface: COLORS.blackSoft,
  modalOverlay: "rgba(0,0,0,0.7)",
};

const DATE_TAGS = ["Today", "Tomorrow", "This Weekend"];
const PRICE_TAGS = ["Free", "0-500", "501-2000", "Above 2000"];

function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? COLORS.gold : "rgba(255,255,255,0.15)",
        background: active ? "rgba(212,175,55,0.14)" : "transparent",
        color: active ? COLORS.gold : T.textMuted,
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

export default function TheaterBrowsePage() {
  const modal = useAnimatedModal();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(new Set());
  const [venueFilter, setVenueFilter] = useState(new Set());
  const [dateFilter, setDateFilter] = useState(null);
  const [priceFilter, setPriceFilter] = useState(null);

  const filtered = useMemo(() => {
    return SHOWS.filter((s) => {
      if (categoryFilter.size > 0 && !categoryFilter.has(s.category)) return false;
      if (venueFilter.size > 0 && !venueFilter.has(s.venue)) return false;
      if (dateFilter && s.dateTag !== dateFilter) return false;
      if (priceFilter && s.priceTag !== priceFilter) return false;
      return true;
    });
  }, [categoryFilter, venueFilter, dateFilter, priceFilter]);

  const activeFilterCount =
    categoryFilter.size + venueFilter.size + (dateFilter ? 1 : 0) + (priceFilter ? 1 : 0);

  const clearAll = () => {
    setCategoryFilter(new Set());
    setVenueFilter(new Set());
    setDateFilter(null);
    setPriceFilter(null);
  };

  return (
    <div style={{ background: T.pageBg, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className={`px-6 py-8 sm:px-10 ${NAV_CLEARANCE_CLASS}`}>
        {/* Mobile filter toggle */}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="mb-4 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium lg:hidden"
          style={{ borderColor: "rgba(255,255,255,0.15)", color: T.text }}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
        </button>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
          {/* ---------------- Filters panel ---------------- */}
          <aside
            className={`flex-shrink-0 rounded-2xl p-5 lg:sticky lg:top-24 lg:block lg:w-64 ${filtersOpen ? "block" : "hidden"}`}
            style={{ background: T.modalSurface, border: `1px solid ${T.border}` }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: T.text }}>Filters</h2>
              {activeFilterCount > 0 && (
                <button type="button" onClick={clearAll} className="text-xs font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                  Clear
                </button>
              )}
            </div>

            <FilterSection title="Category">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <FilterPill key={c} active={categoryFilter.has(c)} onClick={() => setCategoryFilter((s) => toggleInSet(s, c))}>
                    {c}
                  </FilterPill>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Date">
              <div className="flex flex-wrap gap-2">
                {DATE_TAGS.map((d) => (
                  <FilterPill key={d} active={dateFilter === d} onClick={() => setDateFilter((cur) => (cur === d ? null : d))}>
                    {d}
                  </FilterPill>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Venue">
              <div className="flex flex-wrap gap-2">
                {VENUES.map((v) => (
                  <FilterPill key={v} active={venueFilter.has(v)} onClick={() => setVenueFilter((s) => toggleInSet(s, v))}>
                    {v}
                  </FilterPill>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Price" last>
              <div className="flex flex-wrap gap-2">
                {PRICE_TAGS.map((p) => (
                  <FilterPill key={p} active={priceFilter === p} onClick={() => setPriceFilter((cur) => (cur === p ? null : p))}>
                    {p}
                  </FilterPill>
                ))}
              </div>
            </FilterSection>
          </aside>

          {/* ---------------- Results grid ---------------- */}
          <div className="min-w-0 flex-1">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm" style={{ color: T.textFaint }}>
                {filtered.length} of {SHOWS.length} shows
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: T.modalSurface, border: `1px solid ${T.border}` }}>
                <p className="text-sm" style={{ color: T.textMuted }}>No shows match these filters.</p>
                <button type="button" onClick={clearAll} className="mt-3 text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((show) => (
                  <button
                    type="button"
                    key={show.id}
                    onClick={() => modal.open(show)}
                    className="group relative text-left"
                  >
                    <div
                      className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl"
                      style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}
                    >
                      <img
                        src={show.posterLarge}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                      />
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        <Star className="h-2.5 w-2.5" style={{ fill: COLORS.gold, color: COLORS.gold }} /> {show.rating}
                      </span>
                    </div>
                    <p className="mt-2.5 truncate text-sm font-medium" style={{ color: T.text }}>{show.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: T.textFaint }}>
                      <MapPin className="h-3 w-3" /> {show.venue}
                    </p>
                    <p className="text-xs" style={{ color: T.textFainter }}>{show.date}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="px-6 py-12 sm:px-10" style={{ borderTop: `1px solid ${T.border}` }}>
        <p className="text-sm font-semibold" style={{ color: T.text }}>Theater</p>
        <p className="mt-1 text-xs" style={{ color: T.textFaint }}>Celebrating Kolkata's stages, one production at a time.</p>
        <p className="mt-4 text-xs" style={{ color: T.textFainter }}>
          Theater is a demo concept within theomy. Productions and cast listings are fictional; poster art is originally generated, not photography of real people or events.
        </p>
      </footer>

      {modal.item && <ShowModal show={modal.item} closing={modal.closing} onClose={modal.close} />}
    </div>
  );
}

function FilterSection({ title, children, last }) {
  return (
    <div className={last ? "" : "mb-5 border-b pb-5"} style={{ borderColor: T.border }}>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: T.textFaint }}>{title}</p>
      {children}
    </div>
  );
}

function ShowModal({ show, closing, onClose }) {
  const { isLoggedIn, requestLogin, isInList, toggleListItem } = useApp();
  const saved = isInList(show.id);
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
    toggleListItem({
      id: show.id,
      title: show.title,
      image: show.posterLarge,
      meta: `${show.venue} · ${show.date}`,
      section: "Theater",
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: T.modalOverlay, opacity: shown ? 1 : 0, backdropFilter: shown ? "blur(6px)" : "blur(0px)", WebkitBackdropFilter: shown ? "blur(6px)" : "blur(0px)", transition: "opacity 320ms ease, backdrop-filter 320ms ease" }}
      onClick={onClose}
    >
      <style>{`
        .theater-modal-scroll::-webkit-scrollbar { display: none; }
        .theater-modal-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="theater-modal-scroll w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{
          background: T.modalSurface, maxHeight: "90vh", overflowY: "auto",
          transform: shown ? "perspective(1200px) scale(1) translateY(0) rotateX(0deg)" : "perspective(1200px) scale(0.82) translateY(32px) rotateX(8deg)",
          opacity: shown ? 1 : 0,
          transition: "transform 480ms cubic-bezier(0.22, 1.28, 0.36, 1), opacity 340ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full">
          <img src={show.posterLarge} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${T.modalSurface}FF 100%)` }} />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>
          <h2 className="absolute bottom-4 left-6 right-16 text-2xl font-semibold sm:text-3xl" style={{ color: T.text }}>
            {show.title}
          </h2>
        </div>

        <div className="px-6 py-6">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              <Ticket className="h-4 w-4" /> Book Tickets — {show.price}
            </button>
            <button
              type="button"
              onClick={handleAddToList}
              aria-label={saved ? "Remove from My List" : "Add to My List"}
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
              style={{
                borderColor: saved ? COLORS.gold : "rgba(255,255,255,0.3)",
                color: saved ? COLORS.gold : "#fff",
                background: saved ? "rgba(212,175,55,0.12)" : "transparent",
              }}
            >
              {saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white hover:bg-white/10">
              <Info className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm" style={{ color: T.textMuted }}>
            <span className="flex items-center gap-1" style={{ color: COLORS.gold }}>
              <Star className="h-4 w-4" style={{ fill: COLORS.gold }} /> {show.rating}
            </span>
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {show.venue}</span>
            <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> {show.date}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs" style={{ color: COLORS.gold }}>{show.category}</span>
          </div>

          <p className="mb-4 text-sm leading-relaxed" style={{ color: T.textMuted }}>{show.synopsis}</p>
          <p className="text-xs" style={{ color: T.textFaint }}>Featuring {show.lead}</p>
        </div>
      </div>
    </div>
  );
}
