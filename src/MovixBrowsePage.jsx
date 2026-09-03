import React, { useState, useEffect } from "react";
import { ChevronRight, Play, Plus, Check, ThumbsUp, X, Volume2, VolumeX, Star } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, NAV_CLEARANCE_CLASS } from "./theme";
import { useApp } from "./context/AppContext";
import { pickCast, pickCrew } from "./shared/peopleData";
import { useAnimatedModal } from "./shared/useAnimatedModal";
import Footer from "./shared/Footer";
import { fetchPublishedVideos, fetchVideoById, fetchSpecialCategories } from "./api";
import { GenreRow as RealGenreRow, RealDetailModal, formatDuration } from "./VideoStreaming/VideoBrowsePage";

import filmsPoster from "./assets/posters/films.jpg";
import seriesPoster from "./assets/posters/series.jpg";
import familyPoster from "./assets/posters/family.jpg";
import originalsPoster from "./assets/posters/originals.jpg";
import livePoster from "./assets/posters/live.jpg";
import palCrimson from "./assets/posters/pal-crimson.jpg";
import palTeal from "./assets/posters/pal-teal.jpg";
import palPurple from "./assets/posters/pal-purple.jpg";
import palForest from "./assets/posters/pal-forest.jpg";
import palSlate from "./assets/posters/pal-slate.jpg";
import palRose from "./assets/posters/pal-rose.jpg";

const NAVY_DEEP = COLORS.black;
const NAVY = COLORS.blackSoft;
const TEAL = COLORS.gold;

// Bronze/amber palette — applied here (not the orphaned ArchiveBrowsePage.jsx)
// because this is the page the "Archive" nav link actually opens.
const ARCHIVE_BG = "#4A2A0A";
const ARCHIVE_SURFACE = "#6B4419";
const ARCHIVE_TEXTURE = `linear-gradient(180deg, ${ARCHIVE_BG} 0%, ${ARCHIVE_BG} 10%, #6B4419 22%, #B8792E 38%, #D4A244 46%, #B8792E 54%, #6B4419 68%, ${ARCHIVE_BG} 82%, ${ARCHIVE_BG} 100%)`;

const THEMES = {
  dark: {
    pageBg: ARCHIVE_BG,
    border: "rgba(255,255,255,0.08)",
    text: "#FFFFFF",
    textMuted: "rgba(255,255,255,0.7)",
    textFaint: "rgba(255,255,255,0.5)",
    textFainter: "rgba(255,255,255,0.4)",
    modalSurface: ARCHIVE_SURFACE,
    modalOverlay: "rgba(0,0,0,0.7)",
  },
  light: {
    pageBg: COLORS.cream,
    border: "rgba(61,0,13,0.12)",
    text: "#12141C",
    textMuted: "rgba(18,20,28,0.65)",
    textFaint: "rgba(18,20,28,0.5)",
    textFainter: "rgba(18,20,28,0.4)",
    modalSurface: "#FFFFFF",
    modalOverlay: "rgba(0,0,0,0.5)",
  },
};

const POSTER_POOL = [
  filmsPoster, seriesPoster, familyPoster, originalsPoster, livePoster,
  palCrimson, palTeal, palPurple, palForest, palSlate, palRose,
];

const TITLE_POOL = [
  "The Last Horizon", "Echoes of Midnight", "Crimson Dynasty", "Solar Drift",
  "The Quiet Verdict", "Neon Requiem", "The Iron Coast", "Run the Long Way",
  "Velocity", "Glasswing", "After the Fall", "Salt & Embers",
  "The Cartographer's Daughter", "Paper Lanterns", "Low Orbit", "Broken Compass",
  "The Ember Line", "Wildfire Season", "Static & Silence", "The Long Goodbye",
  "Harbor Lights", "Midnight Ferry", "The Glass House", "Northbound",
  "Season of Ash", "The Quiet War", "Amber & Rust", "Fault Lines",
  "The Last Reel", "Hollow Moon",
];

const SYNOPSES = [
  "A discovery no one was looking for forces three strangers to decide how far they'll go to keep it secret.",
  "Ten years after the accident, she returns to the one place that still remembers what really happened.",
  "A quiet town, a missing week, and the one person left who's still asking the right questions.",
  "Everything he built rests on a promise he's not sure he can keep for one more day.",
  "Two rivals, one impossible deadline, and a truth that could end both their careers.",
  "She inherited a map to a place that does not appear on any other map ever drawn.",
  "The night shift was supposed to be quiet. It wasn't, and now nobody can agree on what they saw.",
  "A family reunion turns into a reckoning nobody signed up for.",
];

const CATEGORIES = [
  "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
  "Classical Theatre", "Experimental Theatre", "Popular Shows",
];


function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const CERTS = ["UA13+", "UA16+"];

function buildCard(category, i) {
  const title = TITLE_POOL[hashStr(category + i) % TITLE_POOL.length];
  const h = hashStr(category + "::" + title + i);
  const seed = `movie-${category}-${i}`;
  return {
    id: seed,
    title,
    category,
    poster: POSTER_POOL[h % POSTER_POOL.length],
    year: 2023 + (h % 3),
    durationMin: 90 + (h % 60),
    rating: (7 + ((h % 28) / 10)).toFixed(1),
    cert: CERTS[h % CERTS.length],
    synopsis: SYNOPSES[h % SYNOPSES.length],
    genres: [category, CATEGORIES[(h >>> 3) % CATEGORIES.length]].filter((g, idx, arr) => arr.indexOf(g) === idx),
    cast: pickCast(seed, 3),
    crew: pickCrew(seed),
  };
}

export default function MovixBrowsePage({ theme = "dark", onOpenPerson, onNavigate, openVideoId }) {
  const t = THEMES[theme] ?? THEMES.dark;
  const isLight = theme === "light";
  const modal = useAnimatedModal();
  const { isLoggedIn, requestLogin } = useApp();

  // Auto-opens a specific video's real detail modal when arriving here
  // with openVideoId set (from search results) — same pattern as
  // VideoStreaming/VideoBrowsePage.jsx.
  useEffect(() => {
    if (!openVideoId) return;
    fetchVideoById(openVideoId)
      .then((v) => {
        modal.open({
          id: v.id,
          title: v.title,
          poster: v.poster_image_url || v.thumbnail_url || POSTER_POOL[hashStr(v.id) % POSTER_POOL.length],
          isReal: true,
          videoId: v.id,
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openVideoId]);

  // Real, published videos with section "archive" — fetched from the
  // actual backend, shown as their own row at the top using the same
  // poster-card GenreRow visual as the demo rows below.
  // Admin-curated "Special Categories" — see VideoStreaming/VideoBrowsePage.jsx's
  // identical block for the full reasoning. Requested with section="archive".
  const [specialCategories, setSpecialCategories] = useState([]);
  useEffect(() => {
    fetchSpecialCategories("archive")
      .then(setSpecialCategories)
      .catch(() => setSpecialCategories([]));
  }, []);

  // Real, published videos with section "archive" — grouped by category,
  // the exact same pattern VideoStreaming/VideoBrowsePage.jsx (Play) uses,
  // so Archive's rows behave identically (hover trailer, 4-per-row sizing,
  // real playback/ads/revenue tracking via the imported RealGenreRow +
  // RealDetailModal below) rather than a separate re-implementation.
  const [realVideosByCategory, setRealVideosByCategory] = useState({});
  useEffect(() => {
    fetchPublishedVideos("archive")
      .then((videos) => {
        const grouped = {};
        videos.forEach((v) => {
          const card = {
            id: v.id,
            title: v.title,
            poster: v.poster_image_url || v.thumbnail_url || POSTER_POOL[hashStr(v.id) % POSTER_POOL.length],
            isReal: true,
            videoId: v.id,
            trailerUrl: v.trailer_playback_url || null,
            releaseYear: v.release_year,
            durationLabel: v.duration_seconds ? formatDuration(Math.round(v.duration_seconds / 60)) : null,
          };
          (v.categories || []).forEach((cat) => {
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(card);
          });
        });
        setRealVideosByCategory(grouped);
      })
      .catch(() => setRealVideosByCategory({}));
  }, []);

  const handleSelectCard = (card) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    if (card.isLive) {
      onNavigate?.("liveWatch", { liveStreamId: card.id });
      return;
    }
    // Both real and demo cards use the same modal mechanism — which
    // component renders inside (RealDetailModal vs the demo DetailModal)
    // is decided by card.isReal at render time below.
    modal.open(card);
  };

  return (
    <div
      style={{
        backgroundColor: t.pageBg,
        backgroundImage: isLight ? "none" : ARCHIVE_TEXTURE,
        backgroundSize: isLight ? "auto" : "100% 700px",
        backgroundRepeat: isLight ? "no-repeat" : "repeat-y",
        fontFamily: "'Geist', -apple-system, sans-serif",
        minHeight: "100vh",
      }}
    >
      <main className={`px-6 py-8 sm:px-10 ${NAV_CLEARANCE_CLASS}`}>
        {specialCategories.map((sc) => (
          <RealGenreRow
            key={sc.id}
            category={sc.title}
            cards={sc.videos.map((v) => ({
              id: v.id,
              title: v.title,
              poster: v.poster_image_url || v.thumbnail_url || POSTER_POOL[hashStr(v.id) % POSTER_POOL.length],
              isReal: true,
              videoId: v.id,
              trailerUrl: v.trailer_playback_url || null,
            }))}
            onSelect={handleSelectCard}
            showCaption
          />
        ))}
        {Object.keys(realVideosByCategory).length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: t.modalSurface, border: `1px solid ${t.border}` }}>
            <p className="text-sm" style={{ color: t.textMuted }}>No videos in Archive yet — check back soon.</p>
          </div>
        ) : (
          Object.entries(realVideosByCategory).map(([category, cards]) => (
            <RealGenreRow key={category} category={category} cards={cards} onSelect={handleSelectCard} showCaption />
          ))
        )}
      </main>

      <Footer onNavigate={onNavigate} />

      {modal.item && modal.item.isReal ? (
        <RealDetailModal card={modal.item} closing={modal.closing} onClose={modal.close} onNavigate={onNavigate} onSelectRelated={(relatedCard) => modal.open(relatedCard)} />
      ) : modal.item ? (
        <DetailModal card={modal.item} closing={modal.closing} onClose={modal.close} t={t} isLight={isLight} onOpenPerson={onOpenPerson} onNavigate={onNavigate} />
      ) : null}
    </div>
  );
}

function useReveal() {
  const ref = React.useRef(null);
  const [visible, setVisible] = useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, visible];
}

function DetailModal({ card, closing, onClose, t, isLight, onOpenPerson, onNavigate }) {
  const [muted, setMuted] = useState(true);
  const [entered, setEntered] = useState(false);
  const { isLoggedIn, isSubscribed, requestLogin, isInList, toggleListItem } = useApp();
  const saved = isInList(card.id);
  const iconBtnClass = isLight
    ? "border-black/25 text-black hover:bg-black/10"
    : "border-white/30 text-white hover:bg-white/10";
  const genreChipBg = isLight ? "bg-black/8" : "bg-white/10";

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = entered && !closing;

  const requireSubscription = (fn) => (...args) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    if (!isSubscribed) {
      onClose();
      onNavigate?.("subscription");
      return;
    }
    fn(...args);
  };

  const handleAddToList = requireSubscription(() => {
    toggleListItem({
      id: card.id,
      title: card.title,
      image: card.poster,
      meta: `${card.year} · ${Math.floor(card.durationMin / 60)}h ${(card.durationMin % 60).toString().padStart(2, "0")}m`,
      section: "Movies",
    });
  });

  const handlePlay = requireSubscription(() => {});

  const handleThumbsUp = requireSubscription(() => {});

  const handlePersonClick = requireSubscription((personId) => {
    onClose();
    onOpenPerson?.(personId);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: t.modalOverlay, opacity: shown ? 1 : 0, backdropFilter: shown ? "blur(6px)" : "blur(0px)", WebkitBackdropFilter: shown ? "blur(6px)" : "blur(0px)", transition: "opacity 320ms ease, backdrop-filter 320ms ease" }}
      onClick={onClose}
    >
      <style>{`
        .movix-modal-scroll::-webkit-scrollbar { display: none; }
        .movix-modal-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="movix-modal-scroll w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{
          background: t.modalSurface, maxHeight: "90vh", overflowY: "auto",
          transform: shown ? "perspective(1200px) scale(1) translateY(0) rotateX(0deg)" : "perspective(1200px) scale(0.82) translateY(32px) rotateX(8deg)",
          opacity: shown ? 1 : 0,
          transition: "transform 480ms cubic-bezier(0.22, 1.28, 0.36, 1), opacity 340ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full">
          <img src={card.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${t.modalSurface}FF 100%)` }} />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/40 text-white hover:bg-black/60"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <h2
            className="absolute bottom-4 left-6 text-3xl font-semibold sm:text-4xl"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: t.text }}
          >
            {card.title}
          </h2>
        </div>

        <div className="px-6 py-6">
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handlePlay}
              className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              <Play className="h-4 w-4" style={{ fill: CTA_TEXT_COLOR }} /> Play
            </button>
            <button
              type="button"
              onClick={handleAddToList}
              aria-label={saved ? "Remove from My List" : "Add to My List"}
              className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
              style={saved ? { borderColor: COLORS.gold, color: COLORS.gold, background: "rgba(212,175,55,0.12)" } : undefined}
            >
              <span className={saved ? "" : iconBtnClass}>
                {saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </span>
            </button>
            <button type="button" onClick={handleThumbsUp} className={`flex h-9 w-9 items-center justify-center rounded-full border ${iconBtnClass}`}>
              <ThumbsUp className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: t.textMuted }}>
            <span className="flex items-center gap-1" style={{ color: TEAL }}>
              <Star className="h-4 w-4" style={{ fill: TEAL }} /> {card.rating}
            </span>
            <span>{card.year}</span>
            <span>{formatDuration(card.durationMin)}</span>
            <span className="rounded border px-1.5 py-0.5 text-xs font-semibold" style={{ borderColor: COLORS.gold, color: COLORS.gold }}>
              {card.cert}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${genreChipBg}`} style={{ color: COLORS.burgundy }}>
              {card.category}
            </span>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <p className="text-sm leading-relaxed sm:col-span-2" style={{ color: t.textMuted }}>{card.synopsis}</p>
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <p className="mb-1" style={{ color: t.textFainter }}>GENRES</p>
                <p style={{ color: t.textMuted }}>{card.genres.join(", ")}</p>
              </div>
              <div>
                <p className="mb-1" style={{ color: t.textFainter }}>RATING</p>
                <p style={{ color: t.textMuted }}>{card.rating} / 10</p>
              </div>
              <div>
                <p className="mb-1" style={{ color: t.textFainter }}>AVAILABLE IN</p>
                <p style={{ color: t.textMuted }}>HD · Multi-language</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-2" style={{ borderColor: t.border }}>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: t.textFainter }}>Cast</p>
              <div className="flex flex-col gap-2.5">
                {card.cast.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => handlePersonClick(person.id)}
                    className="flex w-fit items-center gap-2 text-left"
                  >
                    <img src={person.photo} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover object-top" />
                    <span className="text-sm font-medium hover:underline" style={{ color: COLORS.gold }}>{person.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: t.textFainter }}>Crew</p>
              <div className="flex flex-col gap-2.5">
                {card.crew.map((person) => (
                  <button
                    key={person.id + person.role}
                    type="button"
                    onClick={() => handlePersonClick(person.id)}
                    className="flex w-fit items-center gap-2 text-left"
                  >
                    <img src={person.photo} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover object-top" />
                    <span className="text-sm">
                      <span style={{ color: t.textFainter }}>{person.role}: </span>
                      <span className="font-medium hover:underline" style={{ color: COLORS.gold }}>{person.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function MovixMark({ className, style }) {
  return (
    <svg viewBox="0 0 256 256" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M 128 128 C 128 198.692 70.692 256 0 256 C 0 185.308 57.308 128 128 128 Z M 128 128 C 198.692 128 256 185.308 256 256 C 185.308 256 128 198.692 128 128 Z M 0 0 C 70.692 0 128 57.308 128 128 C 57.308 128 0 70.692 0 0 Z M 256 0 C 256 70.692 198.692 128 128 128 C 128 57.308 185.308 0 256 0 Z" />
    </svg>
  );
}
