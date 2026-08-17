import { useEffect, useState } from "react";
import { COLORS, HERO_HEIGHT_CLASS } from "../theme";

// Archive-only background tone — same aged sepia-bronze used in
// ArchiveBrowsePage.jsx, deliberately not the shared burgundy background.
// Accent colors (gold text, burgundy edge-glow) are left as COLORS.* since
// only the background itself was asked to change.
const ARCHIVE_BG = "#4A2A0A";

// ---------------------------------------------------------------------------
// Archive hero — same structure as Video Streaming's MovixHero (full-bleed
// video/poster background, bottom-anchored headline), but deliberately
// pointed at its OWN separate asset folders:
//   src/Archive/assets/ArchiveVideo/   — old theatre recordings go here
//   src/Archive/assets/posters/        — fallback art, shown until videos exist
// Nothing here is shared with src/VideoStreaming/'s assets, so uploading
// old footage to one never touches the other.
// ---------------------------------------------------------------------------

import archive1 from "../Archive/assets/posters/archive-1.jpg";
import archive2 from "../Archive/assets/posters/archive-2.jpg";
import archive3 from "../Archive/assets/posters/archive-3.jpg";
import archive4 from "../Archive/assets/posters/archive-4.jpg";

// Any video dropped into src/Archive/assets/ArchiveVideo/ is picked up
// automatically — no import to add per file. Vite resolves this at build
// time, so a video added after `npm run build` needs a rebuild to appear,
// but no code change is required.
const heroVideoModules = import.meta.glob("../Archive/assets/ArchiveVideo/*.{mp4,webm,mov,MP4,WEBM,MOV}", {
  eager: true,
  query: "?url",
  import: "default",
});
const HERO_VIDEOS = Object.keys(heroVideoModules)
  .sort()
  .map((key) => heroVideoModules[key]);

// Poster fallback, used only if ArchiveVideo/ is empty (e.g. before any old
// footage has been uploaded yet) — so the hero never breaks or shows nothing.
const HERO_SLIDES = [archive1, archive2, archive3, archive4];
const SLIDE_INTERVAL_MS = 5000;

export default function ArchiveHero() {
  const [slideIndex, setSlideIndex] = useState(0);
  const hasVideos = HERO_VIDEOS.length > 0;

  useEffect(() => {
    if (hasVideos) return;
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % HERO_SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasVideos]);

  return (
    <section
      className={`w-full overflow-hidden relative ${HERO_HEIGHT_CLASS}`}
      style={{ fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      {hasVideos ? (
        <video
          key={HERO_VIDEOS[slideIndex]}
          className="absolute inset-0 h-full w-full object-cover"
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
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out"
            style={{ opacity: i === slideIndex ? 1 : 0 }}
          />
        ))
      )}

      {/* Slightly heavier, sepia-leaning scrim — a small "old footage" cue,
          distinct from the crisper scrim on the main Video Streaming hero */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(74,42,10,0.45) 0%, rgba(74,42,10,0.15) 30%, rgba(74,42,10,0.7) 100%)" }}
      />
      {/* Amber/bronze sheen — the same warm metallic glow used across the
          Archive browse feed below, so hero and browse read as one surface */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at 15% 100%, #B8792E70 0%, transparent 50%), radial-gradient(ellipse at 100% 0%, #D4A24460 0%, transparent 45%)` }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle, transparent 40%, ${ARCHIVE_BG} 100%)` }}
      />

      <div className="relative z-10 flex h-full w-full flex-col">
        <main className="mt-auto flex flex-col gap-6 px-5 pb-8 sm:gap-8 sm:px-8 sm:pb-12 lg:px-12 lg:pb-16">
          <div className="max-w-xl">
            <p className="mb-2 text-sm font-medium tracking-wide" style={{ color: COLORS.gold }}>MOVIX ARCHIVE</p>
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl lg:text-[3.5rem]" style={{ color: COLORS.cream }}>
              Old stages, kept alive
            </h1>
          </div>
        </main>
      </div>
    </section>
  );
}
