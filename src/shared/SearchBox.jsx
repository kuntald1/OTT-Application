import React from "react";
import { Search, X } from "lucide-react";
import { COLORS } from "../theme";

// The search box that sits above a list: on the Community page's Blog
// and Community Room sections, and again at the top of the full-list
// pages their "View all" opens. One component so the two can't drift
// apart — somebody who learns the box in one place meets the same box
// in the other.
//
// Deliberately uncontrolled about WHAT it searches: the caller owns the
// filtering, so the same box narrows posts, rooms or anything else.
export default function SearchBox({ value, onChange, placeholder, className = "" }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-4 ${className}`}
      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(212,175,55,0.3)" }}
    >
      <Search className="h-4 w-4 flex-shrink-0" style={{ color: "rgba(245,235,221,0.45)" }} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-transparent py-2.5 text-sm outline-none placeholder-white/30"
        style={{ color: COLORS.cream }}
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="flex-shrink-0 hover:opacity-80"
        >
          <X className="h-3.5 w-3.5" style={{ color: "rgba(245,235,221,0.6)" }} />
        </button>
      )}
    </div>
  );
}
