import React, { useEffect, useState } from "react";
import { HERO_HEIGHT_CLASS } from "../theme";
import { fetchArchiveHeroSlides } from "../api";

// ---------------------------------------------------------------------------
// Archive hero — cycles through slides managed at Admin > Archive Hero
// Slides, each with its own uploaded photo + eyebrow/headline/subtext text
// (same auto-advancing-carousel-with-thumbnail-picker pattern as Ticketing's
// TheaterHero.jsx). Only this page's color theme (sepia-bronze scrim/glow)
// stays hardcoded here — that's Archive's own visual identity, deliberately
// not the shared burgundy background Plays/Community use.
//
// Auto-advances every 5s; clicking a thumbnail jumps there directly and
// restarts the timer from that point. Renders nothing if no slides have
// been added yet, rather than showing stale placeholder content.
// ---------------------------------------------------------------------------

const SLIDE_INTERVAL_MS = 5000;
const ARCHIVE_BG = "#4A2A0A";
const ARCHIVE_GOLD = "#D4A244";

export default function ArchiveHero() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);

  useEffect(() => {
    fetchArchiveHeroSlides()
      .then(setSlides)
      .catch(() => setSlides([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  if (loading || slides.length === 0) return null;
  const slide = slides[active];

  return (
    <section className={`relative w-full overflow-hidden font-[Geist,system-ui,sans-serif] ${HERO_HEIGHT_CLASS}`}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Backgrounds — one per slide, 700ms crossfade, auto-advancing */}
      {slides.map((s, i) => (
        <div
          key={s.id}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out"
          style={{ backgroundImage: `url(${s.image_url})`, opacity: i === active ? 1 : 0 }}
        />
      ))}

      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(74,42,10,0.45) 0%, rgba(74,42,10,0.15) 30%, rgba(74,42,10,0.7) 100%)" }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 15% 100%, #B8792E70 0%, transparent 50%), radial-gradient(ellipse at 100% 0%, #D4A24460 0%, transparent 45%)" }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle, transparent 40%, ${ARCHIVE_BG} 100%)` }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-between px-6 pb-6 pt-20 sm:px-10 sm:pb-8 sm:pt-24 lg:px-16">
        {/* Top zone — the slide currently in view */}
        <div className="flex flex-col gap-3 md:items-end md:text-right">
          {slide.eyebrow && (
            <p key={`${slide.id}-tag`} className="animate-[fadeIn_0.5s_ease] text-sm font-medium tracking-wide" style={{ color: ARCHIVE_GOLD }}>
              {slide.eyebrow}
            </p>
          )}
          <h2 key={`${slide.id}-title`} className="max-w-md animate-[fadeIn_0.5s_ease] text-2xl font-semibold leading-tight sm:text-3xl" style={{ color: "#F5EBDD" }}>
            {slide.headline}
          </h2>
          {slide.subtext && (
            <p
              key={`${slide.id}-desc`}
              className="max-w-xs animate-[fadeIn_0.5s_ease] text-sm font-medium leading-relaxed text-[#F5EBDD]/85 sm:text-base md:max-w-sm"
            >
              {slide.subtext}
            </p>
          )}
        </div>

        {/* Bottom zone — thumbnail picker, one per slide (only if more than one) */}
        {slides.length > 1 && (
          <div className="flex flex-col gap-8">
            <div className="flex items-end gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:gap-3 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={`Slide ${s.headline}`}
                  onClick={() => setActive(i)}
                  className="flex shrink-0 flex-col items-center gap-2"
                >
                  <span
                    className="h-1 w-1 rounded-full transition-opacity duration-300"
                    style={{ background: ARCHIVE_GOLD, opacity: i === active ? 1 : 0 }}
                  />
                  <span className="block h-10 w-10 overflow-hidden rounded-full border border-white/25 sm:h-14 sm:w-14">
                    <img src={s.image_url} alt={s.headline} className="h-full w-full object-cover" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
