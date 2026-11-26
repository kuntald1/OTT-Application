import React, { useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COLORS } from "../theme";
import { INDIA_CITIES_FLAT } from "./indiaCities";

// Roughly what the open panel needs: search row plus the scroll area.
const PANEL_HEIGHT_PX = 260;

// ---------------------------------------------------------------------------
// CityDropdown — searchable India-city picker used in registration and the
// "Complete your profile" prompt. Selecting "Other" reveals a free-text box:
// that typed value is stored as-is (see UserDemographics.city on the
// backend), so a city missing from the starter list still gets recorded.
// ---------------------------------------------------------------------------

const OTHER = "__other__";

export default function CityDropdown({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // City is the last field on the registration form, so on a laptop the
  // button often sits near the bottom of the window and a panel opening
  // downward ran straight off the screen — the list was there, just
  // unreachable. Measure once on open and put it above instead when
  // there isn't room below.
  const [dropUp, setDropUp] = useState(false);
  const buttonRef = useRef(null);
  const isOther = value !== "" && !INDIA_CITIES_FLAT.some((c) => c.city === value);

  const toggleOpen = () => {
    setOpen((wasOpen) => {
      if (!wasOpen && buttonRef.current) {
        const { top, bottom } = buttonRef.current.getBoundingClientRect();
        const roomBelow = window.innerHeight - bottom;
        // Only flip when going up is genuinely better, so a button near
        // the top of a short window doesn't end up with a clipped panel
        // above it instead of a clipped one below.
        setDropUp(roomBelow < PANEL_HEIGHT_PX && top > roomBelow);
      }
      return !wasOpen;
    });
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Matching the state too, so "bengal" finds Kolkata and the rest —
    // people who can't recall how a town is spelt nearly always know
    // which state it is in.
    const list = q
      ? INDIA_CITIES_FLAT.filter(
          (c) => c.city.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
        )
      : INDIA_CITIES_FLAT;
    return list.slice(0, 50); // keep the open list short and fast to scroll
  }, [query]);

  const pick = (city) => {
    onChange(city);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-label="City"
        className="flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm disabled:opacity-50"
        style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: value ? COLORS.cream : "rgba(245,235,221,0.4)" }}
      >
        {value && value !== OTHER ? value : value === OTHER ? "Other" : "City"}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute left-0 z-20 w-full overflow-hidden rounded-xl ${dropUp ? "bottom-full mb-1" : "top-full mt-1"}`}
            style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.25)" }}
          >
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "rgba(245,235,221,0.1)" }}>
              <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "rgba(245,235,221,0.4)" }} />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search city…"
                aria-label="Search city"
                className="w-full bg-transparent text-sm outline-none placeholder-white/30"
                style={{ color: COLORS.cream }}
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {results.map((c) => (
                <button
                  key={`${c.state}-${c.city}`}
                  type="button"
                  onClick={() => pick(c.city)}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-white/10"
                  style={{ color: value === c.city ? COLORS.gold : "rgba(245,235,221,0.85)" }}
                >
                  {c.city}
                  <span className="text-[10px]" style={{ color: "rgba(245,235,221,0.35)" }}>{c.state}</span>
                </button>
              ))}
              {results.length === 0 && (
                <p className="px-4 py-3 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>No matches — pick "Other" below.</p>
              )}
              <button
                type="button"
                onClick={() => pick(OTHER)}
                className="block w-full border-t px-4 py-2 text-left text-sm hover:bg-white/10"
                style={{ borderColor: "rgba(245,235,221,0.1)", color: isOther ? COLORS.gold : "rgba(245,235,221,0.7)" }}
              >
                Other (type your city)
              </button>
            </div>
          </div>
        </>
      )}

      {(value === OTHER || isOther) && (
        <input
          type="text"
          autoFocus={value === OTHER}
          value={value === OTHER ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Type your city"
          aria-label="Type your city"
          className="mt-2 w-full rounded-lg border px-4 py-2.5 text-sm outline-none disabled:opacity-50"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />
      )}
    </div>
  );
}
