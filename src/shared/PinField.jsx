import React from "react";
import { COLORS } from "../theme";

// ---------------------------------------------------------------------------
// PinField — the 4-digit Family PIN box (Who's watching?, Manage Profile).
//
// Only ever holds up to 4 ASCII digits. The backend accepts exactly [0-9]{4},
// so digits typed on a Bengali (০-৯) or Arabic-Indic (٠-٩ / ۰-۹) keyboard are
// converted to 0-9 here instead of being rejected or — worse — accepted as a
// different string that would never match later. Masked like a password.
// ---------------------------------------------------------------------------

const NON_ASCII_DIGIT_SETS = ["০১২৩৪৫৬৭৮৯", "٠١٢٣٤٥٦٧٨٩", "۰۱۲۳۴۵۶۷۸۹"];

export function normalizePin(raw) {
  return String(raw ?? "")
    .split("")
    .map((ch) => {
      for (const set of NON_ASCII_DIGIT_SETS) {
        const i = set.indexOf(ch);
        if (i >= 0) return String(i);
      }
      return ch;
    })
    .join("")
    .replace(/[^0-9]/g, "")
    .slice(0, 4);
}

export const isCompletePin = (value) => /^[0-9]{4}$/.test(value);

export default function PinField({ value, onChange, onEnter, autoFocus = false, disabled = false, ariaLabel = "PIN", placeholder = "••••" }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      // "one-time-code" keeps browsers from offering to save this as a password.
      autoComplete="one-time-code"
      maxLength={4}
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(normalizePin(e.target.value))}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
      className="w-full rounded-lg text-center outline-none disabled:opacity-50"
      style={{
        border: "1px solid rgba(245,235,221,0.2)",
        background: "rgba(245,235,221,0.06)",
        color: COLORS.cream,
        padding: "12px 14px",
        fontSize: 22,
        letterSpacing: "0.6em",
        paddingLeft: "calc(14px + 0.6em)",
      }}
    />
  );
}
