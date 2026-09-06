import React, { useEffect, useState } from "react";
import { COLORS } from "../theme";
import { fetchVideoLanguages, fetchVideoStudios } from "../api";

// ---------------------------------------------------------------------------
// "Popular Languages" and "Studios" rows shown right before the footer on
// Plays and Archive — both dynamic, both scoped to whichever section is
// currently being browsed:
//
// - Languages: every distinct language that has at least one published
//   video IN THIS SECTION (Video.languages, comma-separated free text).
// - Studios: every Plays Organiser with at least one published video IN
//   THIS SECTION. Clicking a studio shows that organiser's uploads.
//
// A language/studio present only in Archive never shows on Plays, and
// vice versa — each row simply renders nothing if empty, no placeholder
// section left dangling.
// ---------------------------------------------------------------------------

function Tile({ imageUrl, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative h-28 w-44 flex-shrink-0 overflow-hidden rounded-lg text-left sm:h-32 sm:w-52"
      style={{ background: "#1a1a1a" }}
    >
      {imageUrl && (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 transition-opacity group-hover:opacity-40" />
      )}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)" }} />
      <span className="absolute inset-x-3 bottom-3 text-base font-semibold" style={{ color: COLORS.cream }}>
        {label}
      </span>
    </button>
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
          <h2 className="mb-3 text-lg font-semibold" style={{ color: COLORS.cream }}>Popular Languages</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {languages.map((l) => (
              <Tile
                key={l.language}
                imageUrl={l.poster_image_url}
                label={l.language}
                onClick={() => onNavigate?.("videosByLanguage", { section, language: l.language })}
              />
            ))}
          </div>
        </div>
      )}

      {studios.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold" style={{ color: COLORS.cream }}>Studios</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {studios.map((s) => (
              <Tile
                key={s.user_id}
                imageUrl={s.poster_image_url}
                label={s.name}
                onClick={() => onNavigate?.("videosByStudio", { section, uploadedBy: s.user_id, studioName: s.name })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
