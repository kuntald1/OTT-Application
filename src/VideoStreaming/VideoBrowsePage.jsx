import React, { useState, useEffect } from "react";
import { ChevronRight, Play, Plus, Check, ThumbsUp, X, Volume2, VolumeX, Star } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, NAV_CLEARANCE_CLASS } from "../theme";
import { useApp } from "../context/AppContext";
import { pickCast, pickCrew } from "../shared/peopleData";
import { useAnimatedModal } from "../shared/useAnimatedModal";
import { fetchPublishedVideos, fetchVideoById } from "../api";

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
  "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
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
        {realVideos.length > 0 && (
          <GenreRow category="Recently Uploaded" cards={realVideos} onSelect={handleSelectCard} />
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
        <RealDetailModal card={modal.item} closing={modal.closing} onClose={modal.close} onNavigate={onNavigate} />
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

function RealDetailModal({ card, closing, onClose, onNavigate }) {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const { isInList, toggleListItem } = useApp();
  const saved = isInList(card.id);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const shown = entered && !closing;

  useEffect(() => {
    fetchVideoById(card.videoId)
      .then(setVideo)
      .catch(() => setVideo(null))
      .finally(() => setLoading(false));
  }, [card.videoId]);

  const isPayPerVideo = video?.monetization_type === "pay_per_video";
  const canPlay = video?.has_file && !isPayPerVideo;

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
            <iframe
              src={video.embed_url}
              loading="lazy"
              style={{ border: "none", position: "absolute", inset: 0, width: "100%", height: "100%" }}
              allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
              allowFullScreen
            />
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
              <div className="mb-4 flex items-center gap-3">
                {!video.has_file ? (
                  <p className="text-sm" style={{ color: T.textFaint }}>This video is still processing — check back soon.</p>
                ) : isPayPerVideo ? (
                  <div className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)", color: T.textMuted }}>
                    Pay-Per-Video — ₹{video.pricing?.price_inr} / ${video.pricing?.price_usd}. Purchase flow coming soon.
                  </div>
                ) : !playing ? (
                  <button
                    type="button"
                    onClick={() => setPlaying(true)}
                    className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                  >
                    <Play className="h-4 w-4" style={{ fill: CTA_TEXT_COLOR }} /> Play
                  </button>
                ) : null}

                {/* Real "Add to My List" — same toggleListItem/isInList
                    mechanism the demo cards already use, genuinely
                    functional, not decorative. Thumbs-up stays decorative
                    on purpose, matching the demo modal's own thumbs-up,
                    which has no real "liked" state either. */}
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
                <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white hover:bg-white/10">
                  <ThumbsUp className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: T.textMuted }}>
                <span>{video.release_year}</span>
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
