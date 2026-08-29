import React, { useState, useEffect, useRef } from "react";
import { searchPeople } from "../api";

// ---------------------------------------------------------------------------
// PersonAutocomplete — a plain-looking text input that shows a dropdown
// of matching existing Person profiles as you type (debounced). Picking
// a suggestion calls onSelect(person) — the caller is responsible for
// storing both the typed name AND the selected person's id, so the
// video-save payload can send person_id to reuse them instead of
// creating a duplicate (see routers/videos.py's _sync_cast_and_crew).
// Full bio editing happens on the separate Cast/Crew Master page, not
// here — this is name entry + reuse only.
// ---------------------------------------------------------------------------
export default function PersonAutocomplete({ value, onChange, onSelect, placeholder, style }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const blurTimerRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchPeople(value.trim())
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [value]);

  const handlePick = (person) => {
    clearTimeout(blurTimerRef.current);
    onSelect(person);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimerRef.current = setTimeout(() => setOpen(false), 150); }}
        style={style}
      />
      {open && suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg"
          style={{ background: "#150307", border: "1px solid rgba(212,175,55,0.3)" }}
        >
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // keeps the input's onBlur from firing before this click registers
              onClick={() => handlePick(p)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
              style={{ color: "#f5ebdd" }}
            >
              {p.photo_url && <img src={p.photo_url} alt="" className="h-6 w-6 rounded-full object-cover" />}
              <span className="truncate">{p.name}</span>
              {p.occupation && <span className="ml-auto flex-shrink-0 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>{p.occupation}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
