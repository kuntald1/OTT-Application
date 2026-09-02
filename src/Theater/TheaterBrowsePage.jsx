import React, { useMemo, useState, useEffect } from "react";
import { Ticket, Info, Plus, Check, X, MapPin, Calendar, SlidersHorizontal, ChevronDown } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, NAV_CLEARANCE_CLASS } from "../theme";
import { fetchApprovedEvents } from "../api";
import { useApp } from "../context/AppContext";
import { useAnimatedModal } from "../shared/useAnimatedModal";
import PageHero from "../shared/PageHero";

const TICKETING_THEME = {
  fallbackBg: COLORS.black,
  scrim: "linear-gradient(180deg, rgba(61,0,13,0.35) 0%, rgba(61,0,13,0.15) 35%, rgba(61,0,13,0.85) 100%)",
  glow: `radial-gradient(ellipse at 15% 100%, ${COLORS.burgundy}55 0%, transparent 45%), radial-gradient(ellipse at 100% 0%, ${COLORS.burgundy}40 0%, transparent 40%)`,
  vignette: `radial-gradient(circle, transparent 40%, ${COLORS.black} 100%)`,
};

// ---------------------------------------------------------------------------
// Theater Browse ("Ticketing") — real, admin-approved events (from the
// Event Listing Enquiry flow), not demo/fictional data. A ticketing-style
// Filters panel (category / date / venue / price) narrows the live list,
// the way a real booking site would.
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

// Matches the fixed set the Event Listing Enquiry form (and its backend
// validation) already constrains event_category to — see
// ALLOWED_CATEGORIES in routers/event_enquiries.py.
const CATEGORIES = [
  "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
  "Classical Theatre", "Experimental Theatre", "Popular Shows",
];

const DATE_TAGS = ["Today", "Tomorrow", "This Weekend"];
const PRICE_TAGS = ["Free", "0-500", "501-2000", "Above 2000"];

function getDateTag(dateStr) {
  const eventDay = new Date(dateStr);
  eventDay.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((eventDay - today) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays <= 7) {
    const day = today.getDay(); // 0=Sun..6=Sat
    const daysUntilSat = (6 - day + 7) % 7;
    const daysUntilSun = (7 - day) % 7 || 7;
    if (diffDays === daysUntilSat || diffDays === daysUntilSun) return "This Weekend";
  }
  return null;
}

function getPriceTag(price) {
  if (price === 0) return "Free";
  if (price <= 500) return "0-500";
  if (price <= 2000) return "501-2000";
  return "Above 2000";
}

function formatEventDateLabel(proposedDate, proposedTime) {
  const tag = getDateTag(proposedDate);
  const timePart = proposedTime ? `, ${proposedTime}` : "";
  if (tag === "Today" || tag === "Tomorrow") return `${tag}${timePart}`;
  const d = new Date(proposedDate);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}${timePart}`;
}

// Normalizes a real PublicEventListingOut (from GET /event-enquiries/approved)
// into the flat shape this page's rendering was already built around —
// keeps the render logic itself close to its original form, minimizing
// the surface area for new bugs while swapping the data source entirely.
function toShowShape(event) {
  const cheapestTier = event.ticket_tiers.length > 0
    ? event.ticket_tiers.reduce((min, t) => (Number(t.price) < Number(min.price) ? t : min))
    : null;
  const cheapestPrice = cheapestTier ? Number(cheapestTier.price) : 0;
  return {
    id: event.id,
    title: event.event_title,
    poster: event.poster_image_url, // may be null — rendering falls back to a plain placeholder
    synopsis: event.event_description || "",
    category: event.event_category,
    venue: event.venue,
    orgName: event.org_name,
    date: formatEventDateLabel(event.proposed_date, event.proposed_time),
    dateTag: getDateTag(event.proposed_date),
    price: cheapestTier ? `₹${cheapestPrice.toLocaleString("en-IN")}` : "Free",
    priceTag: getPriceTag(cheapestPrice),
    ticketTiers: event.ticket_tiers,
  };
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

  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchApprovedEvents()
      .then((events) => setShows(events.map(toShowShape)))
      .catch(() => setShows([]))
      .finally(() => setLoading(false));
  }, []);

  const VENUES = useMemo(() => {
    const unique = new Set(shows.map((s) => s.venue));
    return Array.from(unique).sort();
  }, [shows]);

  const filtered = useMemo(() => {
    return shows.filter((s) => {
      if (categoryFilter.size > 0 && !categoryFilter.has(s.category)) return false;
      if (venueFilter.size > 0 && !venueFilter.has(s.venue)) return false;
      if (dateFilter && s.dateTag !== dateFilter) return false;
      if (priceFilter && s.priceTag !== priceFilter) return false;
      return true;
    });
  }, [shows, categoryFilter, venueFilter, dateFilter, priceFilter]);

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
      <PageHero pageKey="ticketing" theme={TICKETING_THEME} />
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
                {VENUES.length === 0 ? (
                  <p className="text-xs" style={{ color: T.textFainter }}>No venues yet.</p>
                ) : (
                  VENUES.map((v) => (
                    <FilterPill key={v} active={venueFilter.has(v)} onClick={() => setVenueFilter((s) => toggleInSet(s, v))}>
                      {v}
                    </FilterPill>
                  ))
                )}
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
                {loading ? "Loading…" : `${filtered.length} of ${shows.length} shows`}
              </p>
            </div>

            {!loading && shows.length === 0 ? (
              <div className="rounded-2xl p-10 text-center" style={{ background: T.modalSurface, border: `1px solid ${T.border}` }}>
                <p className="text-sm" style={{ color: T.textMuted }}>No events listed yet — check back soon.</p>
              </div>
            ) : filtered.length === 0 && !loading ? (
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
                      style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)" }}
                    >
                      {show.poster && (
                        <img
                          src={show.poster}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-110"
                        />
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
        <p className="text-sm font-semibold" style={{ color: T.text }}>Ticketing</p>
        <p className="mt-1 text-xs" style={{ color: T.textFaint }}>Celebrating Kolkata's stages, one production at a time.</p>
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
      image: show.poster,
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
        <div className="relative aspect-video w-full" style={{ background: "rgba(255,255,255,0.04)" }}>
          {show.poster && <img src={show.poster} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />}
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
              <Ticket className="h-4 w-4" /> Book Tickets — From {show.price}
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
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4 text-sm" style={{ color: T.textMuted }}>
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {show.venue}</span>
            <span className="flex items-center gap-1"><Calendar className="h-4 w-4" /> {show.date}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs" style={{ color: COLORS.gold }}>{show.category}</span>
          </div>

          {show.synopsis && <p className="mb-4 text-sm leading-relaxed" style={{ color: T.textMuted }}>{show.synopsis}</p>}
          <p className="text-xs" style={{ color: T.textFaint }}>Presented by {show.orgName}</p>

          {show.ticketTiers.length > 0 && (
            <div className="mt-4 flex flex-col gap-1.5">
              {show.ticketTiers.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <span style={{ color: T.text }}>{t.tier_name}</span>
                  <span style={{ color: COLORS.gold }}>₹{Number(t.price).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
