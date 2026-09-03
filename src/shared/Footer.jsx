import React from "react";
import { COLORS } from "../theme";

// ---------------------------------------------------------------------------
// Shared site footer — Company / Support / Watch / Legal columns + the
// theomy mark/tagline row. Used by every page (Plays, Archive, and the
// static content pages — About/Contact/FAQs/Privacy/Terms/Cookies) so the
// footer, and its real links, stay consistent everywhere instead of each
// page keeping its own copy. onNavigate is optional — pages that don't pass
// one (there shouldn't be any left) just render the Company/Legal links as
// plain, non-clickable text instead of crashing.
// ---------------------------------------------------------------------------

const T = {
  border: "rgba(255,255,255,0.08)",
  text: "#FFFFFF",
  textFaint: "rgba(255,255,255,0.5)",
  textFainter: "rgba(255,255,255,0.4)",
};

const COLUMNS = [
  { heading: "Company", links: [
    { label: "About Us", view: "about" },
    { label: "Contact Us", view: "contact" },
    { label: "FAQs", view: "faqs" },
  ] },
  { heading: "Support", links: [{ label: "Help Center" }, { label: "Account" }, { label: "Devices" }] },
  { heading: "Watch", links: [{ label: "Films" }, { label: "Series" }, { label: "New & Popular" }] },
  { heading: "Legal", links: [
    { label: "Privacy", view: "privacy" },
    { label: "Terms", view: "terms" },
    { label: "Cookie Preferences", view: "cookies" },
  ] },
];

function MovixMark({ className, style }) {
  return (
    <svg viewBox="0 0 256 256" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M 128 128 C 128 198.692 70.692 256 0 256 C 0 185.308 57.308 128 128 128 Z M 128 128 C 198.692 128 256 185.308 256 256 C 185.308 256 128 198.692 128 128 Z M 0 0 C 70.692 0 128 57.308 128 128 C 57.308 128 0 70.692 0 0 Z M 256 0 C 256 70.692 198.692 128 128 128 C 128 57.308 185.308 0 256 0 Z" />
    </svg>
  );
}

export default function Footer({ onNavigate }) {
  return (
    <footer className="px-6 py-12 sm:px-10" style={{ borderTop: `1px solid ${T.border}` }}>
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <p className="mb-3 text-sm font-semibold" style={{ color: T.text }}>{col.heading}</p>
            <div className="flex flex-col gap-2">
              {col.links.map((link) => (
                <span
                  key={link.label}
                  onClick={link.view ? () => onNavigate?.(link.view) : undefined}
                  className="text-sm"
                  style={{ color: T.textFaint, cursor: link.view ? "pointer" : "default" }}
                >
                  {link.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10 flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between" style={{ borderTop: `1px solid ${T.border}` }}>
        <div className="flex items-center gap-2" style={{ color: T.text }}>
          <MovixMark className="h-5 w-5" style={{ fill: COLORS.gold }} />
          <div>
            <p className="text-sm font-semibold">theomy</p>
            <p className="text-xs" style={{ color: T.textFaint }}>Stream stories, beautifully.</p>
          </div>
        </div>
        <p className="text-xs" style={{ color: T.textFainter }}>English</p>
      </div>
      <p className="mt-4 text-xs" style={{ color: T.textFainter }}>
        theomy is a demo streaming concept. Titles and descriptions are fictional; thumbnail art is originally generated, not licensed photography.
      </p>
    </footer>
  );
}
