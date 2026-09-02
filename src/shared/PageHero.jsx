import React, { useEffect, useState } from "react";
import { COLORS, HERO_HEIGHT_CLASS } from "../theme";
import { fetchPageHero } from "../api";

// ---------------------------------------------------------------------------
// PageHero — one shared, admin-managed hero banner component used by Plays
// (MovixHero.jsx), Archive (ArchiveHero.jsx), Community, and Ticketing.
// Content (image/video/text, headline, eyebrow, subtext, and a slideshow of
// one or more media files) comes from GET /api/page-heroes/{pageKey} —
// editable at Admin > Page Heroes — instead of being hardcoded/bundled into
// the frontend build. Only the color THEME (scrim, glow, vignette, fallback
// background) stays per-page, passed in via the `theme` prop, since that's
// each page's own visual identity rather than admin-editable content.
//
// Multiple images cross-fade on a timer; multiple videos play one after
// another (advancing on each video's onEnded) and loop back to the first —
// matches the old file-drop behavior where several files in
// src/assets/HeroVideo/ all played in sequence.
// ---------------------------------------------------------------------------

const IMAGE_SLIDE_INTERVAL_MS = 5000;

export default function PageHero({ pageKey, theme }) {
  const [hero, setHero] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetchPageHero(pageKey)
      .then((h) => { setHero(h); setSlideIndex(0); })
      .catch(() => setHero(null))
      .finally(() => setLoading(false));
  }, [pageKey]);

  const media = hero?.media || [];
  const isImageSlideshow = hero?.content_type === "image" && media.length > 0;
  const isVideoSequence = hero?.content_type === "video" && media.length > 0;

  useEffect(() => {
    if (!isImageSlideshow || media.length < 2) return;
    const id = setInterval(() => setSlideIndex((i) => (i + 1) % media.length), IMAGE_SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isImageSlideshow, media.length]);

  if (loading) {
    return <section className={`w-full ${HERO_HEIGHT_CLASS}`} style={{ background: theme.fallbackBg }} />;
  }
  if (!hero) return null;

  return (
    <section
      className={`relative w-full overflow-hidden ${HERO_HEIGHT_CLASS}`}
      style={{ fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {isVideoSequence && (
        <video
          key={media[slideIndex].id} // remount on source change so the new file actually loads/plays
          className="absolute inset-0 h-full w-full object-cover object-top"
          src={media[slideIndex].media_url}
          autoPlay
          muted
          playsInline
          onEnded={() => setSlideIndex((i) => (i + 1) % media.length)}
        />
      )}
      {isImageSlideshow && (
        media.map((m, i) => (
          <img
            key={m.id}
            src={m.media_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-1000 ease-in-out"
            style={{ opacity: i === slideIndex ? 1 : 0 }}
          />
        ))
      )}
      {!isVideoSequence && !isImageSlideshow && (
        <div className="absolute inset-0" style={{ background: theme.fallbackBg }} />
      )}

      {/* Scrim, glow, and vignette layers — page-specific, matches the
          treatment each page already had before this became dynamic. */}
      <div className="absolute inset-0" style={{ background: theme.scrim }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: theme.glow }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: theme.vignette }} />

      <div className="relative z-10 flex h-full w-full flex-col">
        <main className="mt-auto flex flex-col gap-6 px-5 pb-8 sm:gap-8 sm:px-8 sm:pb-12 lg:px-12 lg:pb-16">
          <div className="max-w-2xl">
            {hero.eyebrow && (
              <p className="mb-2 text-sm font-medium tracking-wide" style={{ color: COLORS.gold }}>{hero.eyebrow}</p>
            )}
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.5rem]" style={{ color: COLORS.cream }}>
              {hero.headline}
            </h1>
            {hero.subtext && (
              <p className="mt-4 max-w-xl text-base leading-relaxed" style={{ color: "rgba(245,235,221,0.75)" }}>
                {hero.subtext}
              </p>
            )}
          </div>
        </main>
      </div>
    </section>
  );
}
