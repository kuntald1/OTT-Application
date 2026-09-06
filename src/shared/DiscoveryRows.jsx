import React, { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { fetchVideoLanguages, fetchVideoStudios } from "../api";

// ---------------------------------------------------------------------------
// "Popular Languages" and "Studios" rows shown right before the footer on
// Plays and Archive — both dynamic, both scoped to whichever section is
// currently being browsed (see App.jsx/videos.py's section filtering).
//
// Rows larger than 4 tiles auto-scroll right-to-left continuously (pausing
// on hover so a tile can actually be clicked) — 4 tiles or fewer just sit
// still, since there's nothing meaningful to scroll.
// ---------------------------------------------------------------------------

// Native-script display name for a handful of common languages — English
// stays as "English" (it's already in its own script); anything not in
// this list falls back to whatever name the video was tagged with.
const NATIVE_LANGUAGE_NAMES = {
  Bengali: "বাংলা",
  Hindi: "हिंदी",
  English: "English",
  Tamil: "தமிழ்",
  Telugu: "తెలుగు",
  Kannada: "ಕನ್ನಡ",
  Malayalam: "മലയാളം",
  Marathi: "मराठी",
  Gujarati: "ગુજરાતી",
  Punjabi: "ਪੰਜਾਬੀ",
  Urdu: "اردو",
  Odia: "ଓଡ଼ିଆ",
  Assamese: "অসমীয়া",
};

function Tile({ imageUrl, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-48 w-64 flex-shrink-0 overflow-hidden rounded-lg text-left sm:h-56 sm:w-72"
      style={{ background: "#1a1a1a" }}
    >
      {imageUrl && (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 transition-opacity group-hover:opacity-40" />
      )}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.75) 100%)" }} />
      <span className="absolute inset-x-4 bottom-4 text-xl font-semibold sm:text-2xl" style={{ color: COLORS.cream }}>
        {label}
      </span>
    </button>
  );
}

// A row that auto-scrolls right-to-left when it has enough items to be
// worth scrolling (more than fit in one screen), by duplicating the tile
// list once and animating the doubled track by exactly -50% in a seamless
// loop. 4 or fewer tiles render as a plain static row instead.
function ScrollingRow({ items, keyOf, renderItem }) {
  const shouldScroll = items.length > 4;
  const trackItems = shouldScroll ? [...items, ...items] : items;
  // Roughly constant visual speed regardless of how many tiles there are.
  const durationSeconds = Math.max(15, items.length * 4);

  return (
    <div className="overflow-hidden">
      <div
        className={shouldScroll ? "discovery-marquee-track flex gap-3" : "flex gap-3 overflow-x-auto pb-1"}
        style={shouldScroll ? { width: "max-content", animationDuration: `${durationSeconds}s` } : undefined}
      >
        {trackItems.map((item, i) => renderItem(item, i, keyOf(item, i)))}
      </div>
      {shouldScroll && (
        <style>{`
          @keyframes discovery-marquee-scroll {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
          .discovery-marquee-track {
            animation-name: discovery-marquee-scroll;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
          }
          .discovery-marquee-track:hover {
            animation-play-state: paused;
          }
        `}</style>
      )}
    </div>
  );
}

export default function DiscoveryRows({ section, onNavigate }) {
  const [languages, setLanguages] = useState([]);
  const [studios, setStudios] = useState([]);

  useEffect(() => {
    fetchVideoLanguages(section).then(setLanguages).catch(() => setLanguages([]));
    fetchVideoStudios(section).then(setStudios).catch(() => setStudios([]));
  }, [section]);

  if (languages.length === 0 && studios.length === 0) return null;

  return (
    <div className="flex flex-col gap-8 px-6 py-8 sm:px-10">
      {languages.length > 0 && (
        <div>
          <h2 className="mb-4 text-2xl font-semibold sm:text-3xl" style={{ color: COLORS.cream }}>Popular Languages</h2>
          <ScrollingRow
            items={languages}
            keyOf={(l, i) => `${l.language}-${i}`}
            renderItem={(l, i, key) => (
              <Tile
                key={key}
                imageUrl={l.poster_image_url}
                label={NATIVE_LANGUAGE_NAMES[l.language] || l.language}
                onClick={() => onNavigate?.("videosByLanguage", { section, language: l.language })}
              />
            )}
          />
        </div>
      )}

      {studios.length > 0 && (
        <div>
          <h2 className="mb-4 text-2xl font-semibold sm:text-3xl" style={{ color: COLORS.cream }}>Studios</h2>
          <ScrollingRow
            items={studios}
            keyOf={(s, i) => `${s.user_id}-${i}`}
            renderItem={(s, i, key) => (
              <Tile
                key={key}
                imageUrl={s.poster_image_url}
                label={s.name}
                onClick={() => onNavigate?.("videosByStudio", { section, uploadedBy: s.user_id, studioName: s.name })}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}
