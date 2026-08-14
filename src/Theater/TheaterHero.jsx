import React, { useEffect, useState } from "react";
import { COLORS, HERO_HEIGHT_CLASS } from "../theme";
import { SHOWS } from "./showsData";

// ---------------------------------------------------------------------------
// Theater hero — cycles through the same 8 shows listed in the Browse
// section below (src/Theater/showsData.js is the single shared source), so
// every image shown here is a real, ticketable show, not a placeholder.
//
// Auto-advances every 5s; clicking a thumbnail jumps there directly and
// restarts the timer from that point.
// ---------------------------------------------------------------------------

const SLIDE_INTERVAL_MS = 5000;

export default function TheaterHero() {
  const [active, setActive] = useState(0);
  const show = SHOWS[active];

  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % SHOWS.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <section className={`relative w-full overflow-hidden font-[Geist,system-ui,sans-serif] ${HERO_HEIGHT_CLASS}`}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Backgrounds — one per show, 700ms crossfade, auto-advancing */}
      {SHOWS.map((s, i) => (
        <div
          key={s.id}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out"
          style={{ backgroundImage: `url(${s.posterLarge})`, opacity: i === active ? 1 : 0 }}
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
        {/* Top zone — the show currently in view */}
        <div className="flex flex-col gap-3 md:items-end md:text-right">
          <p key={`${show.id}-tag`} className="animate-[fadeIn_0.5s_ease] text-sm font-medium tracking-wide" style={{ color: COLORS.gold }}>
            {show.category.toUpperCase()} · {show.venue}
          </p>
          <h2 key={`${show.id}-title`} className="max-w-md animate-[fadeIn_0.5s_ease] text-2xl font-semibold leading-tight sm:text-3xl" style={{ color: COLORS.cream }}>
            {show.title}
          </h2>
          <p
            key={`${show.id}-desc`}
            className="max-w-xs animate-[fadeIn_0.5s_ease] text-sm font-medium leading-relaxed text-[#F5EBDD]/85 sm:text-base md:max-w-sm"
          >
            {show.synopsis}
          </p>
        </div>

        {/* Bottom zone — thumbnail picker, one per show */}
        <div className="flex flex-col gap-8">
          <div className="flex items-end gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:gap-3 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
            {SHOWS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Show ${s.title}`}
                onClick={() => setActive(i)}
                className="flex shrink-0 flex-col items-center gap-2"
              >
                <span
                  className="h-1 w-1 rounded-full bg-[#D4AF37] transition-opacity duration-300"
                  style={{ opacity: i === active ? 1 : 0 }}
                />
                <span className="block h-10 w-10 overflow-hidden rounded-full border border-white/25 sm:h-14 sm:w-14">
                  <img src={s.posterSmall} alt={s.title} className="h-full w-full object-cover" />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
