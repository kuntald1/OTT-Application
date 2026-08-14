import { useEffect, useState } from "react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, HERO_HEIGHT_CLASS } from "../theme";

// ---------------------------------------------------------------------------
// MOVIX — Video Streaming hero
//
// Nav, search, login and the mobile drawer now all live in the shared
// <TopNav /> (rendered once at the App level), so this component is just
// the full-bleed video background + bottom-anchored headline. The old
// stat ("12,400+...") and testimonial ("CineWeekly...") glass cards have
// been removed per request. Height is shrunk from full-viewport so the
// Browse feed underneath is visible peeking above the fold.
// ---------------------------------------------------------------------------

import filmsPoster from "../assets/posters/films.jpg";
import seriesPoster from "../assets/posters/series.jpg";
import familyPoster from "../assets/posters/family.jpg";
import originalsPoster from "../assets/posters/originals.jpg";

// Any video dropped into src/assets/HeroVideo/ is picked up automatically —
// no import to add per file. Vite resolves this at build time, so a video
// added after `npm run build` needs a rebuild to appear (same as any other
// asset), but no code change is required.
const heroVideoModules = import.meta.glob("../assets/HeroVideo/*.{mp4,webm,mov,MP4,WEBM,MOV}", {
  eager: true,
  query: "?url",
  import: "default",
});
const HERO_VIDEOS = Object.keys(heroVideoModules)
  .sort() // stable, predictable play order (alphabetical by filename)
  .map((key) => heroVideoModules[key]);

// Poster-image fallback, used only if HeroVideo/ is empty (e.g. before any
// video has been uploaded yet) — so the hero never breaks or shows nothing.
const HERO_SLIDES = [filmsPoster, seriesPoster, familyPoster, originalsPoster];
const SLIDE_INTERVAL_MS = 5000;

export default function MovixHero() {
  const [slideIndex, setSlideIndex] = useState(0);
  const hasVideos = HERO_VIDEOS.length > 0;

  useEffect(() => {
    if (hasVideos) return; // videos advance themselves via onEnded instead
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % HERO_SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasVideos]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Silkscreen:wght@400;700&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  return (
    <section
      className={`w-full overflow-hidden relative ${HERO_HEIGHT_CLASS}`}
      style={{
        fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "grayscale",
      }}
    >
      {/* Full-bleed background — plays whatever's in src/assets/HeroVideo/,
          one file after another; falls back to the poster slideshow if
          that folder is empty */}
      {hasVideos ? (
        <video
          key={HERO_VIDEOS[slideIndex]} // remount on source change so the new file actually loads/plays
          className="absolute inset-0 h-full w-full object-cover object-top"
          src={HERO_VIDEOS[slideIndex]}
          autoPlay
          muted
          playsInline
          onEnded={() => setSlideIndex((i) => (i + 1) % HERO_VIDEOS.length)}
        />
      ) : (
        HERO_SLIDES.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-1000 ease-in-out"
            style={{ opacity: i === slideIndex ? 1 : 0 }}
          />
        ))
      )}

      {/* Dark scrim so the headline stays legible under the fixed TopNav
          and against varied video content */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(61,0,13,0.35) 0%, rgba(61,0,13,0.05) 30%, rgba(61,0,13,0.55) 100%)" }} />
      {/* Red edge glow — echoes the curtain lighting seen on the Browse
          cards below, so the hero doesn't read as a cold, disconnected
          black band above a warm red page */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 15% 100%, ${COLORS.burgundy}55 0%, transparent 45%), radial-gradient(ellipse at 100% 0%, ${COLORS.burgundy}40 0%, transparent 40%)` }}
      />
      {/* Dark maroon vignette — darkens the edges so the black behind the
          content carries the same undertone as the poster cards, instead
          of reading as neutral black */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle, transparent 40%, ${COLORS.black} 100%)` }}
      />

      <div className="relative z-10 flex h-full w-full flex-col">
        {/* ---------------- Bottom-anchored headline ---------------- */}
        <main className="mt-auto flex flex-col gap-6 px-5 pb-8 sm:gap-8 sm:px-8 sm:pb-12 lg:px-12 lg:pb-16">
          <div className="max-w-xl">
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.5rem]" style={{ color: COLORS.cream }}>
              Stream stories worth staying up for
            </h1>
          </div>
        </main>
      </div>
    </section>
  );
}
