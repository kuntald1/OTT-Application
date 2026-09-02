import React, { useEffect, useState } from "react";
import { COLORS, HERO_HEIGHT_CLASS } from "../theme";
import { fetchTheaterHeroSlides } from "../api";

// ---------------------------------------------------------------------------
// Theater hero — cycles through slides managed at Admin > Ticketing Hero
// Slides, instead of the old hardcoded SHOWS array (src/Theater/showsData.js,
// which paired a "large" and "small" copy of the same 8 demo photos). Each
// slide is now one uploaded image, resized by CSS for both the full-bleed
// background and the small circular thumbnail — no separate files needed.
//
// Auto-advances every 5s; clicking a thumbnail jumps there directly and
// restarts the timer from that point. Renders nothing if no slides have
// been added yet, rather than showing stale placeholder content.
// ---------------------------------------------------------------------------

const SLIDE_INTERVAL_MS = 5000;

export default function TheaterHero() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);

  useEffect(() => {
    fetchTheaterHeroSlides()
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

      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/10 to-black/75" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 15% 100%, ${COLORS.burgundy}55 0%, transparent 45%), radial-gradient(ellipse at 100% 0%, ${COLORS.burgundy}40 0%, transparent 40%)` }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle, transparent 40%, ${COLORS.black} 100%)` }}
      />

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col justify-between px-6 pb-6 pt-20 sm:px-10 sm:pb-8 sm:pt-24 lg:px-16">
        {/* Top zone — the slide currently in view */}
        <div className="flex flex-col gap-3 md:items-end md:text-right">
          {(slide.category || slide.venue) && (
            <p key={`${slide.id}-tag`} className="animate-[fadeIn_0.5s_ease] text-sm font-medium tracking-wide" style={{ color: COLORS.gold }}>
              {[slide.category?.toUpperCase(), slide.venue].filter(Boolean).join(" · ")}
            </p>
          )}
          <h2 key={`${slide.id}-title`} className="max-w-md animate-[fadeIn_0.5s_ease] text-2xl font-semibold leading-tight sm:text-3xl" style={{ color: COLORS.cream }}>
            {slide.title}
          </h2>
          {slide.synopsis && (
            <p
              key={`${slide.id}-desc`}
              className="max-w-xs animate-[fadeIn_0.5s_ease] text-sm font-medium leading-relaxed text-[#F5EBDD]/85 sm:text-base md:max-w-sm"
            >
              {slide.synopsis}
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
                  aria-label={`Slide ${s.title}`}
                  onClick={() => setActive(i)}
                  className="flex shrink-0 flex-col items-center gap-2"
                >
                  <span
                    className="h-1 w-1 rounded-full bg-[#D4AF37] transition-opacity duration-300"
                    style={{ opacity: i === active ? 1 : 0 }}
                  />
                  <span className="block h-10 w-10 overflow-hidden rounded-full border border-white/25 sm:h-14 sm:w-14">
                    <img src={s.image_url} alt={s.title} className="h-full w-full object-cover" />
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
