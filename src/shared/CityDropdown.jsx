import React, { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { COLORS } from "../theme";
import { INDIA_CITIES_FLAT } from "./indiaCities";

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
  const isOther = value !== "" && !INDIA_CITIES_FLAT.some((c) => c.city === value);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? INDIA_CITIES_FLAT.filter((c) => c.city.toLowerCase().includes(q)) : INDIA_CITIES_FLAT;
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
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
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
            className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl"
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
