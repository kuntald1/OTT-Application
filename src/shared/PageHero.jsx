import React, { useEffect, useState } from "react";
import { COLORS, HERO_HEIGHT_CLASS } from "../theme";
import { fetchPageHero } from "../api";

// ---------------------------------------------------------------------------
// PageHero — one shared, admin-managed hero banner component used by Plays
// (MovixHero.jsx), Archive (ArchiveHero.jsx), Community, and Ticketing.
// Content (image/video/text, headline, eyebrow, subtext) comes from
// GET /api/page-heroes/{pageKey} — editable at Admin > Page Heroes — instead
// of being hardcoded/bundled into the frontend build. Only the color THEME
// (scrim, glow, vignette, fallback background) stays per-page, passed in via
// the `theme` prop, since that's each page's own visual identity rather than
// admin-editable content.
// ---------------------------------------------------------------------------

export default function PageHero({ pageKey, theme }) {
  const [hero, setHero] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchPageHero(pageKey)
      .then(setHero)
      .catch(() => setHero(null))
      .finally(() => setLoading(false));
  }, [pageKey]);

  if (loading) {
    return <section className={`w-full ${HERO_HEIGHT_CLASS}`} style={{ background: theme.fallbackBg }} />;
  }
  if (!hero) return null;

  const hasMedia = (hero.content_type === "image" || hero.content_type === "video") && hero.media_url;

  return (
    <section
      className={`relative w-full overflow-hidden ${HERO_HEIGHT_CLASS}`}
      style={{ fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {hasMedia && hero.content_type === "video" && (
        <video
          className="absolute inset-0 h-full w-full object-cover object-top"
          src={hero.media_url}
          autoPlay
          muted
          loop
          playsInline
        />
      )}
      {hasMedia && hero.content_type === "image" && (
        <img src={hero.media_url} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
      {!hasMedia && (
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
