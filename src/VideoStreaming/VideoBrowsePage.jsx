import React, { useState, useEffect, useRef } from "react";
import { ChevronRight, Play, Plus, Check, ThumbsUp, X, Volume2, VolumeX, Star } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, NAV_CLEARANCE_CLASS } from "../theme";
import { useApp } from "../context/AppContext";
import { pickCast, pickCrew } from "../shared/peopleData";
import { useAnimatedModal } from "../shared/useAnimatedModal";
import { fetchPublishedVideos, fetchVideoById, createVideoPurchaseOrder, verifyVideoPurchasePayment, sendWatchHeartbeat, toggleVideoLike, startPlaybackSession, endPlaybackSession, getPlaybackSessionToken, saveWatchProgress, fetchContinueWatching, fetchRecommendedForMe, fetchMoreLikeThis } from "../api";

import filmsPoster from "../assets/posters/films.jpg";
import seriesPoster from "../assets/posters/series.jpg";
import familyPoster from "../assets/posters/family.jpg";
import originalsPoster from "../assets/posters/originals.jpg";
import livePoster from "../assets/posters/live.jpg";
import palCrimson from "../assets/posters/pal-crimson.jpg";
import palTeal from "../assets/posters/pal-teal.jpg";
import palPurple from "../assets/posters/pal-purple.jpg";
import palForest from "../assets/posters/pal-forest.jpg";
import palSlate from "../assets/posters/pal-slate.jpg";
import palRose from "../assets/posters/pal-rose.jpg";

// ---------------------------------------------------------------------------
// VideoStreaming's own Browse feed — now organized into genre-style rows
// (Trending Now / Music / Nature / Funny / Recently Uploaded), matching the
// Movies Browse page's layout pattern instead of a flat grid. Dark theme,
// matching the site-wide unified color scheme (burgundy/gold on black).
// ---------------------------------------------------------------------------

const NAVY_DEEP = COLORS.black;
const NAVY = COLORS.blackSoft;
const GOLD = COLORS.gold;

const T = {
  pageBg: NAVY_DEEP,
  border: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.7)",
  textFaint: "rgba(255,255,255,0.5)",
  textFainter: "rgba(255,255,255,0.4)",
  modalSurface: NAVY,
  modalOverlay: "rgba(0,0,0,0.7)",
};

const POSTER_POOL = [
  filmsPoster, seriesPoster, familyPoster, originalsPoster, livePoster,
  palCrimson, palTeal, palPurple, palForest, palSlate, palRose,
];

const TITLE_POOL = [
  "Sunset Over the Valley — 4K Ambience", "10-Minute Piano Relaxation",
  "Try Not To Laugh Challenge #14", "Wildlife in 4K: A Morning Walk",
  "Lo-fi Beats to Study To", "Funniest Home Video Fails Compilation",
  "Morning Birdsong Ambience, 1 Hour", "Guitar Cover — Acoustic Session",
  "Rainforest Sounds for Deep Sleep", "Stand-up Comedy Highlights Vol. 3",
  "Ocean Waves at Golden Hour", "Prank Gone Wrong (Not Really)",
  "Live Looping Session — Full Set", "Timelapse: Clouds Over the Hills",
  "Dogs Reacting to Squeaky Toys", "Rain on a Tin Roof — 3 Hours",
  "Busking in the City Square", "Baby Animals Being Clumsy",
  "Northern Lights Timelapse", "Open Mic Night Highlights",
  "Desert at Dawn — Drone Footage", "Cats vs. Cucumbers Compilation",
  "Campfire Crackle Ambience", "Street Magic Reactions",
];

const CATEGORIES = [
  "Drama", "Comedy", "Musical Theatre",
  "Classical Theatre", "Experimental Theatre", "Popular Shows",
];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

const CERTS = ["UA13+", "UA16+"];

function buildVideoCard(category, i) {
  const title = TITLE_POOL[hashStr(category + i) % TITLE_POOL.length];
  const h = hashStr(category + "::" + title + i);
  const durationMin = 60 + (h % 90); // 1h to 2h30m — feature-length, not short-form clips
  const seed = `video-${category}-${i}`;
  return {
    id: seed,
    title,
    category,
    poster: POSTER_POOL[h % POSTER_POOL.length],
    duration: formatDuration(durationMin),
    year: 2023 + (h % 3),
    rating: (7 + ((h % 28) / 10)).toFixed(1),
    cert: CERTS[h % CERTS.length],
    genres: [category, CATEGORIES[(h >>> 3) % CATEGORIES.length]].filter((g, idx, arr) => arr.indexOf(g) === idx),
    description: "Uploaded to theomy. Original poster art — no real footage behind this demo card.",
    cast: pickCast(seed, 3),
    crew: pickCrew(seed),
  };
}

export default function VideoBrowsePage({ onOpenPerson, onNavigate }) {
  const modal = useAnimatedModal();
  const { isLoggedIn, requestLogin } = useApp();

  // Real, published videos — fetched from the actual backend, section
  // "play" specifically. Rendered as its own row at the top, above the
  // demo genre rows below, using the exact same GenreRow visual so it
  // fits the page's existing look without a separate design.
  const [realVideos, setRealVideos] = useState([]);
  useEffect(() => {
    fetchPublishedVideos("play")
      .then((videos) => {
        setRealVideos(
          videos.map((v) => ({
            id: v.id,
            title: v.title,
            poster: v.poster_image_url || v.thumbnail_url || POSTER_POOL[hashStr(v.id) % POSTER_POOL.length],
            isReal: true,
            videoId: v.id,
          }))
        );
      })
      .catch(() => setRealVideos([]));
  }, []);

  // "Continue Watching" — real, from WatchProgress, not a demo. Only
  // fetched when logged in (the endpoint requires auth anyway).
  const [continueWatching, setContinueWatching] = useState([]);
  const loadContinueWatching = () => {
    if (!isLoggedIn) {
      setContinueWatching([]);
      return;
    }
    fetchContinueWatching()
      .then((items) => {
        setContinueWatching(
          items.map((v) => ({
            id: v.video_id,
            title: v.title,
            poster: v.poster_image_url || v.thumbnail_url || POSTER_POOL[hashStr(v.video_id) % POSTER_POOL.length],
            isReal: true,
            videoId: v.video_id,
            progressPercent: v.progress_percent,
          }))
        );
      })
      .catch(() => setContinueWatching([]));
  };
  useEffect(loadContinueWatching, [isLoggedIn]);

  // "Recommended for you" — real AI recommendations (Voyage AI content
  // similarity blended with actual watch/like history, see
  // routers/recommendations.py). Only fetched when logged in.
  const [recommended, setRecommended] = useState([]);
  useEffect(() => {
    if (!isLoggedIn) {
      setRecommended([]);
      return;
    }
    fetchRecommendedForMe()
      .then((videos) => {
        setRecommended(
          videos.map((v) => ({
            id: v.id,
            title: v.title,
            poster: v.poster_image_url || v.thumbnail_url || POSTER_POOL[hashStr(v.id) % POSTER_POOL.length],
            isReal: true,
            videoId: v.id,
          }))
        );
      })
      .catch(() => setRecommended([]));
  }, [isLoggedIn]);

  const handleSelectCard = (card) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    // Both real and demo cards use the same modal mechanism — which
    // component actually renders inside it (RealDetailModal vs the
    // existing demo DetailModal) is decided by card.isReal below.
    modal.open(card);
  };

  return (
    <div style={{ background: T.pageBg, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className={`px-6 py-8 sm:px-10 ${NAV_CLEARANCE_CLASS}`}>
        {continueWatching.length > 0 && (
          <GenreRow category="Continue Watching" cards={continueWatching} onSelect={handleSelectCard} />
        )}
        {recommended.length > 0 && (
          <GenreRow category="Recommended for You" cards={recommended} onSelect={handleSelectCard} />
        )}
        {realVideos.length > 0 && (
          <GenreRow category="Bengali Theatre" cards={realVideos} onSelect={handleSelectCard} />
        )}
        {CATEGORIES.map((category) => {
          const cards = Array.from({ length: 6 }, (_, i) => buildVideoCard(category, i));
          return <GenreRow key={category} category={category} cards={cards} onSelect={handleSelectCard} />;
        })}
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="px-6 py-12 sm:px-10" style={{ borderTop: `1px solid ${T.border}` }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2" style={{ color: T.text }}>
            <MovixMark className="h-5 w-5" style={{ fill: COLORS.gold }} />
            <div>
              <p className="text-sm font-semibold">theomy</p>
              <p className="text-xs" style={{ color: T.textFaint }}>Stream stories, beautifully.</p>
            </div>
          </div>
          <p className="text-xs" style={{ color: T.textFainter }}>English</p>
        </div>
        <p className="mt-4 text-xs" style={{ color: T.textFainter }}>
          theomy is a demo streaming concept. Titles and descriptions are fictional; thumbnail art is originally generated, not licensed photography.
        </p>
      </footer>

      {modal.item && modal.item.isReal ? (
        <RealDetailModal
          card={modal.item}
          closing={modal.closing}
          onClose={() => { modal.close(); loadContinueWatching(); }}
          onNavigate={onNavigate}
          onSelectRelated={(relatedCard) => modal.open(relatedCard)}
        />
      ) : modal.item ? (
        <DetailModal card={modal.item} closing={modal.closing} onClose={modal.close} onOpenPerson={onOpenPerson} onNavigate={onNavigate} />
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

function GenreRow({ category, cards, onSelect }) {
  const [ref, visible] = useReveal();
  const scrollerRef = React.useRef(null);
  const drag = React.useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  const onMouseDown = (e) => {
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.pageX, startScroll: el.scrollLeft, moved: false };
    el.style.cursor = "grabbing";
    el.style.scrollSnapType = "none"; // disable snap while dragging — it was fighting each mousemove tick, causing jerk
  };
  const onMouseMove = (e) => {
    const el = scrollerRef.current;
    if (!el || !drag.current.active) return;
    e.preventDefault();
    const dx = e.pageX - drag.current.startX;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    el.scrollLeft = drag.current.startScroll - dx;
  };
  const endDrag = () => {
    const el = scrollerRef.current;
    if (el) {
      el.style.cursor = "grab";
      el.style.scrollSnapType = "x mandatory"; // re-enable snap once released, so the row still settles cleanly
    }
    drag.current.active = false;
  };
  const onCardClick = (card) => {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    onSelect(card);
  };

  return (
    <section
      ref={ref}
      className="mb-6 transition-all duration-700 ease-out"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(28px)" }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="group flex cursor-default items-center gap-1.5 text-2xl font-semibold" style={{ color: T.text }}>
          <span className="h-4 w-1 rounded-full" style={{ background: `linear-gradient(180deg, ${COLORS.gold}, ${COLORS.burgundyLight}, ${COLORS.burgundyDark})` }} />
          {category}
          <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" style={{ color: T.textFaint }} />
        </h2>
        <span className="text-xs" style={{ color: T.textFainter }}>{cards.length} titles</span>
      </div>

      <div className="relative">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 sm:w-12"
          style={{ background: `linear-gradient(90deg, ${T.pageBg} 0%, transparent 100%)` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 sm:w-32"
          style={{ background: `linear-gradient(270deg, ${T.pageBg} 15%, transparent 100%)` }}
        />

        <div
          ref={scrollerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          className="flex select-none gap-4 overflow-x-auto pb-3 pr-20 sm:pr-32 [scroll-snap-type:x_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ cursor: "grab" }}
        >
          {cards.map((card, i) => (
            <button
              type="button"
              key={i}
              onClick={() => onCardClick(card)}
              className="group relative w-56 flex-shrink-0 text-left transition-all duration-300 hover:-translate-y-1.5 sm:w-64 lg:w-72"
              style={{ transitionDelay: visible ? `${i * 60}ms` : "0ms", scrollSnapAlign: "start" }}
            >
              <div
                className="relative aspect-[2/3] overflow-hidden rounded-xl transition-all duration-300 group-hover:scale-105 group-hover:shadow-2xl"
                style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}
              >
                <img
                  src={card.poster}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                {typeof card.progressPercent === "number" && (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                    <div
                      className="h-full"
                      style={{ width: `${card.progressPercent}%`, background: COLORS.gold }}
                    />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DetailModal({ card, closing, onClose, onOpenPerson, onNavigate }) {
  const [muted, setMuted] = useState(true);
  const [entered, setEntered] = useState(false);
  const { isLoggedIn, isSubscribed, requestLogin, isInList, toggleListItem } = useApp();
  const saved = isInList(card.id);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = entered && !closing;

  // Shared gate — every interactive action inside this popup (Play, +,
  // thumbs-up, Cast/Crew) requires login, then an active subscription.
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
      meta: `${card.year} · ${card.duration}`,
      section: "Video Streaming",
    });
  });

  const handlePlay = requireSubscription(() => {
    // No real playback exists in this demo — subscription check is the point.
  });

  const handleThumbsUp = requireSubscription(() => {
    // Decorative — no real "liked" state exists in this demo.
  });

  const handlePersonClick = requireSubscription((personId) => {
    onClose();
    onOpenPerson?.(personId);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: T.modalOverlay, opacity: shown ? 1 : 0, backdropFilter: shown ? "blur(6px)" : "blur(0px)", WebkitBackdropFilter: shown ? "blur(6px)" : "blur(0px)", transition: "opacity 320ms ease, backdrop-filter 320ms ease" }}
      onClick={onClose}
    >
      <style>{`
        .movix-video-modal-scroll::-webkit-scrollbar { display: none; }
        .movix-video-modal-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="movix-video-modal-scroll w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{
          background: T.modalSurface, maxHeight: "90vh", overflowY: "auto",
          transform: shown ? "perspective(1200px) scale(1) translateY(0) rotateX(0deg)" : "perspective(1200px) scale(0.82) translateY(32px) rotateX(8deg)",
          opacity: shown ? 1 : 0,
          transition: "transform 480ms cubic-bezier(0.22, 1.28, 0.36, 1), opacity 340ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full">
          <img src={card.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${T.modalSurface}FF 100%)` }} />
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
          <h2 className="absolute bottom-4 left-6 right-16 text-2xl font-semibold sm:text-3xl" style={{ color: T.text }}>
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
              style={{
                borderColor: saved ? COLORS.gold : "rgba(255,255,255,0.3)",
                color: saved ? COLORS.gold : "#fff",
                background: saved ? "rgba(212,175,55,0.12)" : "transparent",
              }}
            >
              {saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
            <button type="button" onClick={handleThumbsUp} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white hover:bg-white/10">
              <ThumbsUp className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: T.textMuted }}>
            <span className="flex items-center gap-1" style={{ color: GOLD }}>
              <Star className="h-4 w-4" style={{ fill: GOLD }} /> {card.rating}
            </span>
            <span>{card.year}</span>
            <span>{card.duration}</span>
            <span className="rounded border px-1.5 py-0.5 text-xs font-semibold" style={{ borderColor: GOLD, color: GOLD }}>
              {card.cert}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs" style={{ color: GOLD }}>
              {card.category}
            </span>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <p className="text-sm leading-relaxed sm:col-span-2" style={{ color: T.textMuted }}>{card.description}</p>
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <p className="mb-1" style={{ color: T.textFainter }}>GENRES</p>
                <p style={{ color: T.textMuted }}>{card.genres.join(", ")}</p>
              </div>
              <div>
                <p className="mb-1" style={{ color: T.textFainter }}>RATING</p>
                <p style={{ color: T.textMuted }}>{card.rating} / 10</p>
              </div>
              <div>
                <p className="mb-1" style={{ color: T.textFainter }}>AVAILABLE IN</p>
                <p style={{ color: T.textMuted }}>HD · Multi-language</p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: T.textFainter }}>Cast</p>
              <div className="flex flex-col gap-2.5">
                {card.cast.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => handlePersonClick(person.id)}
                    className="flex w-fit items-center gap-2 text-left"
                  >
                    <img src={person.photo} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover object-top" />
                    <span className="text-sm font-medium hover:underline" style={{ color: GOLD }}>{person.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: T.textFainter }}>Crew</p>
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
                      <span style={{ color: T.textFainter }}>{person.role}: </span>
                      <span className="font-medium hover:underline" style={{ color: GOLD }}>{person.name}</span>
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

// ---------------------------------------------------------------------------
// AdEnabledVideoPlayer — the real Google IMA SDK integration for videos
// with ad cue points. Deliberately ONLY used when video.ad_cue_points
// is non-empty; every ad-free video keeps using the existing Bunny
// iframe embed below, completely untouched. This was necessary because
// Bunny's iframe is cross-origin with no postMessage control — IMA SDK
// needs a real <video> element it can pause/resume itself, so this
// plays the direct HLS stream (video.playback_url) via hls.js instead.
//
// offset_seconds=0 cue points are requested immediately as a pre-roll
// (adDisplayContainer.initialize() runs on the same user gesture as
// pressing Play, which browsers require for ad playback). Any
// offset_seconds>0 cue point is a mid-roll — content playback is
// paused via a timeupdate listener once it crosses that point, a new
// ad is requested for just that VAST tag, and content resumes after.
// This is a manual sequential-ad approach (not a VMAP ad-pod), which
// matches what the Ad Library actually stores (a plain VAST tag URL
// per cue point, not a VMAP playlist).
//
// UNTESTED against a live ad account by design — I have no way to run
// a real ad auction from here. Verify with a real VAST tag after
// deploying.
// ---------------------------------------------------------------------------
function loadScriptOnce(src, isLoadedCheck) {
  return new Promise((resolve, reject) => {
    if (isLoadedCheck()) return resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function AdEnabledVideoPlayer({ video, poster }) {
  const videoRef = useRef(null);
  const adContainerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [adPlaying, setAdPlaying] = useState(false);
  const [loadError, setLoadError] = useState("");
  const state = useRef({ playedOffsets: new Set() }).current;

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        await Promise.all([
          loadScriptOnce("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js", () => !!window.Hls),
          loadScriptOnce("https://imasdk.googleapis.com/js/sdkloader/ima3.js", () => !!(window.google && window.google.ima)),
        ]);
        if (cancelled) return;

        const videoEl = videoRef.current;
        const wrapperEl = wrapperRef.current;
        if (!videoEl || !wrapperEl) return;

        // Content playback — native HLS on Safari, hls.js everywhere else.
        if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
          videoEl.src = video.playback_url;
        } else if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls();
          hls.loadSource(video.playback_url);
          hls.attachMedia(videoEl);
          state.hls = hls;
        } else {
          setLoadError("This browser can't play this video's format.");
          return;
        }

        const google = window.google;
        const adDisplayContainer = new google.ima.AdDisplayContainer(adContainerRef.current, videoEl);
        const adsLoader = new google.ima.AdsLoader(adDisplayContainer);
        state.adsLoader = adsLoader;

        const playContentDirectly = () => {
          setAdPlaying(false);
          videoEl.play().catch(() => {});
        };

        const requestAd = (vastTagUrl) => {
          const req = new google.ima.AdsRequest();
          req.adTagUrl = vastTagUrl;
          req.linearAdSlotWidth = wrapperEl.clientWidth;
          req.linearAdSlotHeight = wrapperEl.clientHeight;
          adsLoader.requestAds(req);
        };

        adsLoader.addEventListener(
          google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (adsManagerLoadedEvent) => {
            const settings = new google.ima.AdsRenderingSettings();
            settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
            const adsManager = adsManagerLoadedEvent.getAdsManager(videoEl, settings);
            state.adsManager = adsManager;

            adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, () => {
              try { adsManager.destroy(); } catch (e) {}
              playContentDirectly();
            });
            adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, () => {
              setAdPlaying(true);
              videoEl.pause();
            });
            adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, playContentDirectly);
            adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, () => setAdPlaying(false));

            try {
              adsManager.init(wrapperEl.clientWidth, wrapperEl.clientHeight, google.ima.ViewMode.NORMAL);
              adsManager.start();
            } catch (e) {
              playContentDirectly();
            }
          },
          false
        );
        adsLoader.addEventListener(
          google.ima.AdErrorEvent.Type.AD_ERROR,
          playContentDirectly, // no ad available / VAST failure — never block the viewer from watching
          false
        );

        const cuePoints = video.ad_cue_points || [];
        const preRoll = cuePoints.find((c) => c.offset_seconds === 0);
        if (preRoll) {
          adDisplayContainer.initialize();
          state.playedOffsets.add(0);
          requestAd(preRoll.vast_tag_url);
        } else {
          videoEl.play().catch(() => {});
        }

        const midRolls = cuePoints.filter((c) => c.offset_seconds > 0);
        if (midRolls.length > 0) {
          const onTimeUpdate = () => {
            for (const cue of midRolls) {
              if (!state.playedOffsets.has(cue.offset_seconds) && videoEl.currentTime >= cue.offset_seconds) {
                state.playedOffsets.add(cue.offset_seconds);
                videoEl.pause();
                adDisplayContainer.initialize();
                requestAd(cue.vast_tag_url);
              }
            }
          };
          videoEl.addEventListener("timeupdate", onTimeUpdate);
          state.onTimeUpdate = onTimeUpdate;
        }
      } catch (e) {
        setLoadError("Ad playback couldn't load — playing the video without ads.");
        videoRef.current?.play().catch(() => {});
      }
    }

    setup();

    return () => {
      cancelled = true;
      if (state.hls) { try { state.hls.destroy(); } catch (e) {} }
      if (state.adsManager) { try { state.adsManager.destroy(); } catch (e) {} }
      if (state.adsLoader) { try { state.adsLoader.destroy(); } catch (e) {} }
      if (videoRef.current && state.onTimeUpdate) videoRef.current.removeEventListener("timeupdate", state.onTimeUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <video ref={videoRef} poster={poster} className="h-full w-full" playsInline controls={!adPlaying} />
      <div ref={adContainerRef} className="absolute inset-0" style={{ pointerEvents: adPlaying ? "auto" : "none" }} />
      {loadError && (
        <p className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-red-400">{loadError}</p>
      )}
    </div>
  );
}


function RealDetailModal({ card, closing, onClose, onNavigate, onSelectRelated }) {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState("");
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [playStarting, setPlayStarting] = useState(false);
  const [screenLimitError, setScreenLimitError] = useState("");
  const { isInList, toggleListItem, profile, requestLogin, isLoggedIn } = useApp();
  const saved = isInList(card.id);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = entered && !closing;

  // Razorpay's checkout widget, loaded once lazily — same pattern as
  // SubscriptionPage.jsx / DonationPage.jsx, so it's available the
  // moment someone hits "Buy" here without depending on having visited
  // either of those pages first in this session.
  useEffect(() => {
    if (document.getElementById("razorpay-checkout-js")) return;
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const [moreLikeThis, setMoreLikeThis] = useState([]);

  const loadVideo = () => {
    setLoading(true);
    fetchVideoById(card.videoId)
      .then((v) => {
        setVideo(v);
        setLiked(v.liked_by_me);
        setLikesCount(v.likes_count);
      })
      .catch(() => setVideo(null))
      .finally(() => setLoading(false));

    fetchMoreLikeThis(card.videoId)
      .then((videos) => {
        setMoreLikeThis(
          videos.map((v) => ({
            id: v.id,
            title: v.title,
            poster: v.poster_image_url || v.thumbnail_url || POSTER_POOL[hashStr(v.id) % POSTER_POOL.length],
            isReal: true,
            videoId: v.id,
          }))
        );
      })
      .catch(() => setMoreLikeThis([]));
  };

  useEffect(loadVideo, [card.videoId]);

  const handleToggleLike = () => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    if (likeBusy) return;
    // Optimistic update — the toggle is idempotent server-side (same
    // create/delete-row pattern as My List), so a failed request just
    // reverts these two values back rather than leaving stale state.
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!prevLiked);
    setLikesCount(prevLiked ? prevCount - 1 : prevCount + 1);
    setLikeBusy(true);
    toggleVideoLike(card.videoId)
      .then((res) => {
        setLiked(res.liked);
        setLikesCount(res.likes_count);
      })
      .catch(() => {
        setLiked(prevLiked);
        setLikesCount(prevCount);
      })
      .finally(() => setLikeBusy(false));
  };

  // Real gating — has_access comes straight from the backend's actual
  // subscription/purchase check (_check_video_access), not just "is
  // there a login token". This is the fix for the known gap: someone
  // whose subscription expired no longer gets a working embed_url at
  // all, regardless of what the browser's login state says.
  const canPlay = video?.has_file && video?.has_access;

  // Phase 3 — real watch-time tracking. The Bunny embed is a
  // cross-origin iframe with no postMessage wiring here, so this
  // approximates "watching" as wall-clock time elapsed since Play was
  // pressed — reasonable given the embed doesn't expose real play/pause
  // events to us, and heartbeats are cheap/idempotent (the backend only
  // ever credits the INCREMENTAL amount when a session beats the
  // viewer's previous best, so an inflated estimate from, say, a
  // backgrounded tab doesn't runaway-credit anything real).
  useEffect(() => {
    if (!playing || !canPlay) return;
    const sessionToken = getPlaybackSessionToken();
    const resumeOffsetSeconds = video?.resume_position_seconds || 0;
    const playStartedAt = Date.now();
    const sendHeartbeat = () => {
      const elapsedSeconds = Math.round((Date.now() - playStartedAt) / 1000);
      if (elapsedSeconds > 0) {
        // Revenue heartbeat stays session-relative by design (see
        // VideoWatchRecord's "max single-session view" rule) — it
        // should NOT include the resume offset. Progress-saving is
        // different: it needs the video's ABSOLUTE position, so the
        // resume offset (where this session started from) is added.
        sendWatchHeartbeat(card.videoId, elapsedSeconds, sessionToken).catch(() => {});
        saveWatchProgress(card.videoId, resumeOffsetSeconds + elapsedSeconds).catch(() => {});
      }
    };
    const interval = setInterval(sendHeartbeat, 20000);
    return () => {
      clearInterval(interval);
      sendHeartbeat(); // final heartbeat on close/unmount so the last stretch isn't lost
      endPlaybackSession(sessionToken).catch(() => {}); // frees this device's screens-limit slot immediately
    };
  }, [playing, canPlay, card.videoId]);

  // Screens-limit gate — checked right before playback actually starts,
  // not just on page load. Blocks with a clear message instead of
  // silently letting an over-the-limit device stream, which "screens"
  // previously did nothing to prevent.
  const handlePlayClick = async () => {
    setScreenLimitError("");
    setPlayStarting(true);
    try {
      const result = await startPlaybackSession(card.videoId, getPlaybackSessionToken());
      if (result.allowed) {
        setPlaying(true);
      } else {
        setScreenLimitError(result.reason || "Device limit reached for your plan.");
      }
    } catch (err) {
      setScreenLimitError(err.message || "Couldn't start playback. Please try again.");
    } finally {
      setPlayStarting(false);
    }
  };

  const handleBuy = async () => {
    setBuyError("");
    setBuying(true);
    try {
      const order = await createVideoPurchaseOrder(card.videoId);

      if (!window.Razorpay) {
        throw new Error("Payment widget failed to load. Please refresh and try again.");
      }

      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: Math.round(Number(order.amount) * 100),
        currency: order.currency,
        name: "theomy",
        description: order.video_title,
        order_id: order.razorpay_order_id,
        prefill: { email: profile.email, contact: profile.phone || undefined },
        theme: { color: "#D4AF37" },
        handler: async (response) => {
          try {
            await verifyVideoPurchasePayment({
              purchaseId: order.purchase_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            // Re-fetch so embed_url/playback_url populate now that
            // has_access is genuinely true, instead of faking it locally.
            loadVideo();
          } catch (err) {
            setBuyError(err.message || "Payment verification failed. If money was deducted, contact support.");
          } finally {
            setBuying(false);
          }
        },
        modal: { ondismiss: () => setBuying(false) },
      });
      rzp.on("payment.failed", () => {
        setBuyError("Payment failed. Please try again.");
        setBuying(false);
      });
      rzp.open();
    } catch (err) {
      setBuyError(err.message || "Couldn't start checkout. Please try again.");
      setBuying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: T.modalOverlay, opacity: shown ? 1 : 0, backdropFilter: shown ? "blur(6px)" : "blur(0px)", WebkitBackdropFilter: shown ? "blur(6px)" : "blur(0px)", transition: "opacity 320ms ease, backdrop-filter 320ms ease" }}
      onClick={onClose}
    >
      <style>{`
        .movix-video-modal-scroll::-webkit-scrollbar { display: none; }
        .movix-video-modal-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div
        className="movix-video-modal-scroll w-full max-w-2xl overflow-hidden rounded-2xl"
        style={{
          background: T.modalSurface, maxHeight: "90vh", overflowY: "auto",
          transform: shown ? "perspective(1200px) scale(1) translateY(0) rotateX(0deg)" : "perspective(1200px) scale(0.82) translateY(32px) rotateX(8deg)",
          opacity: shown ? 1 : 0,
          transition: "transform 480ms cubic-bezier(0.22, 1.28, 0.36, 1), opacity 340ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full" style={{ background: "#000" }}>
          {playing && canPlay ? (
            video.ad_cue_points && video.ad_cue_points.length > 0 ? (
              <AdEnabledVideoPlayer video={video} poster={card.poster} />
            ) : (
              <iframe
                src={video.embed_url}
                loading="lazy"
                style={{ border: "none", position: "absolute", inset: 0, width: "100%", height: "100%" }}
                allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
                allowFullScreen
              />
            )
          ) : (
            <>
              {(card.poster) && <img src={card.poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${T.modalSurface}FF 100%)` }} />
              <h2 className="absolute bottom-4 left-6 right-16 text-2xl font-semibold sm:text-3xl" style={{ color: T.text }}>{card.title}</h2>
            </>
          )}
          <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <p className="text-sm" style={{ color: T.textFaint }}>Loading…</p>
          ) : !video ? (
            <p className="text-sm" style={{ color: T.textFaint }}>Couldn't load this video.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  {!video.has_file ? (
                    <p className="text-sm" style={{ color: T.textFaint }}>This video is still processing — check back soon.</p>
                  ) : video.has_access ? (
                    !playing ? (
                      <button
                        type="button"
                        onClick={handlePlayClick}
                        disabled={playStarting}
                        className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                      >
                        <Play className="h-4 w-4" style={{ fill: CTA_TEXT_COLOR }} /> {playStarting ? "Checking…" : "Play"}
                      </button>
                    ) : null
                  ) : video.access_reason === "login_required" ? (
                    <button
                      type="button"
                      onClick={requestLogin}
                      className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                      style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                    >
                      Log in to Watch
                    </button>
                  ) : video.access_reason === "purchase_required" ? (
                    <button
                      type="button"
                      onClick={handleBuy}
                      disabled={buying}
                      className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
                      style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                    >
                      {buying ? "Processing…" : `Buy for ₹${video.pricing?.price_inr}`}
                    </button>
                  ) : (
                    // access_reason === "subscription_required" — covers both
                    // a subscription_only video with no matching plan AND a
                    // pay_per_video one where the prerequisite plan itself
                    // is missing/expired (see Video model docstring: no
                    // subscription means no ability to buy either).
                    <button
                      type="button"
                      onClick={() => { onClose(); onNavigate?.("subscription"); }}
                      className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                      style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                    >
                      Subscribe to Watch
                    </button>
                  )}

                  {/* Real "Add to My List" AND real thumbs-up — both
                      persisted server-side (MyListItem / VideoLike),
                      not decorative. */}
                  <button
                    type="button"
                    onClick={() => toggleListItem({ id: card.id, title: video.title, image: card.poster, meta: `${video.release_year} · ${video.age_rating}`, section: "Video Streaming" })}
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
                  <button
                    type="button"
                    onClick={handleToggleLike}
                    disabled={likeBusy}
                    aria-label={liked ? "Remove like" : "Like this video"}
                    className="flex h-9 items-center gap-1.5 rounded-full border px-3 transition-colors disabled:cursor-not-allowed"
                    style={{
                      borderColor: liked ? COLORS.gold : "rgba(255,255,255,0.3)",
                      color: liked ? COLORS.gold : "#fff",
                      background: liked ? "rgba(212,175,55,0.12)" : "transparent",
                    }}
                  >
                    <ThumbsUp className="h-4 w-4" style={liked ? { fill: COLORS.gold } : undefined} />
                    {likesCount > 0 && <span className="text-xs font-medium">{likesCount}</span>}
                  </button>
                </div>
                {buyError && (
                  <p className="text-xs" style={{ color: "#f87171" }}>{buyError}</p>
                )}
                {screenLimitError && (
                  <p className="text-xs" style={{ color: "#f87171" }}>{screenLimitError}</p>
                )}
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: T.textMuted }}>
                <span>{video.release_year}</span>
                {video.duration_seconds > 0 && <span>{formatDuration(Math.round(video.duration_seconds / 60))}</span>}
                <span className="rounded border px-1.5 py-0.5 text-xs font-semibold" style={{ borderColor: GOLD, color: GOLD }}>{video.age_rating}</span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs" style={{ color: GOLD }}>{video.categories[0]}</span>
              </div>

              <div className="grid gap-6 sm:grid-cols-3">
                <p className="text-sm leading-relaxed sm:col-span-2" style={{ color: T.textMuted }}>{video.description}</p>
                <div className="flex flex-col gap-3 text-xs">
                  {video.categories.length > 0 && (
                    <div>
                      <p className="mb-1" style={{ color: T.textFainter }}>GENRES</p>
                      <p style={{ color: T.textMuted }}>{video.categories.join(", ")}</p>
                    </div>
                  )}
                  {video.languages.length > 0 && (
                    <div>
                      <p className="mb-1" style={{ color: T.textFainter }}>AVAILABLE IN</p>
                      <p style={{ color: T.textMuted }}>{video.languages.join(", ")}</p>
                    </div>
                  )}
                </div>
              </div>

              {(video.cast.length > 0 || video.crew.length > 0) && (
                <div className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  {video.cast.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: T.textFainter }}>Cast</p>
                      <div className="flex flex-col gap-2.5">
                        {video.cast.map((c) => (
                          <button key={c.id} type="button" onClick={() => { onClose(); onNavigate?.("personProfile", { personId: c.person.id }); }} className="flex w-fit items-center gap-2 text-left">
                            {c.person.photo_url ? (
                              <img src={c.person.photo_url} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover object-top" />
                            ) : (
                              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs" style={{ color: T.textFainter }}>{c.person.name[0]}</span>
                            )}
                            <span className="text-sm font-medium hover:underline" style={{ color: GOLD }}>
                              {c.person.name}{c.character_role ? <span style={{ color: T.textFainter }}> as {c.character_role}</span> : null}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {video.crew.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: T.textFainter }}>Crew</p>
                      <div className="flex flex-col gap-2.5">
                        {video.crew.map((c) => (
                          <button key={c.id} type="button" onClick={() => { onClose(); onNavigate?.("personProfile", { personId: c.person.id }); }} className="flex w-fit items-center gap-2 text-left">
                            {c.person.photo_url ? (
                              <img src={c.person.photo_url} alt="" className="h-7 w-7 flex-shrink-0 rounded-full object-cover object-top" />
                            ) : (
                              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs" style={{ color: T.textFainter }}>{c.person.name[0]}</span>
                            )}
                            <span className="text-sm">
                              <span style={{ color: T.textFainter }}>{c.role}: </span>
                              <span className="font-medium hover:underline" style={{ color: GOLD }}>{c.person.name}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {moreLikeThis.length > 0 && (
                <div className="mt-6 border-t pt-6" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: T.textFainter }}>More Like This</p>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {moreLikeThis.map((rc) => (
                      <button
                        key={rc.id}
                        type="button"
                        onClick={() => onSelectRelated?.(rc)}
                        className="group overflow-hidden rounded-lg text-left transition-transform hover:-translate-y-1"
                      >
                        <div className="aspect-[2/3] w-full overflow-hidden rounded-lg" style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}>
                          <img src={rc.poster} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        </div>
                        <p className="mt-1.5 truncate text-xs font-medium" style={{ color: T.textMuted }}>{rc.title}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
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
