import React from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS } from "../theme";
import { getPerson } from "../shared/peopleData";

// ---------------------------------------------------------------------------
// Person profile — reached by clicking a cast or crew name anywhere a movie
// detail modal shows one. Data comes from shared/peopleData.js so the same
// person always resolves to the same profile regardless of which card
// linked to them.
// ---------------------------------------------------------------------------

export default function ActorProfilePage({ personId, onBack }) {
  const person = getPerson(personId);

  if (!person) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.7)" }}>Profile not found.</p>
      </div>
    );
  }

  const sections = [
    ["About", person.about],
    ["Early Life", person.earlyLife],
    ["Personal Life", person.personalLife],
    ["Debut & Initial Years", person.debut],
    ["Breakthrough & Beyond", person.breakthrough],
    ["Recent Projects", person.recentProjects],
  ];

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      {/* Header block */}
      <div className="px-6 pb-8 pt-24 sm:px-10 sm:pt-28" style={{ background: COLORS.blackSoft }}>
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <img
            src={person.photo}
            alt={person.name}
            className="h-28 w-28 flex-shrink-0 rounded-full object-cover object-top"
            style={{ border: `2px solid ${COLORS.gold}` }}
          />
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl" style={{ color: COLORS.cream }}>{person.name}</h1>
            <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
              <div className="flex gap-2">
                <dt style={{ color: "rgba(245,235,221,0.5)" }}>Occupation:</dt>
                <dd style={{ color: COLORS.gold }}>{person.occupation}</dd>
              </div>
              <div className="flex gap-2">
                <dt style={{ color: "rgba(245,235,221,0.5)" }}>Born:</dt>
                <dd style={{ color: "rgba(245,235,221,0.85)" }}>{person.born}</dd>
              </div>
              <div className="flex gap-2">
                <dt style={{ color: "rgba(245,235,221,0.5)" }}>Birthplace:</dt>
                <dd style={{ color: "rgba(245,235,221,0.85)" }}>{person.birthplace}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Body sections */}
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        {sections.map(([title, text]) => (
          <div key={title} className="mb-8">
            <h2 className="mb-2 text-lg font-semibold" style={{ color: COLORS.cream }}>{title}</h2>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.72)" }}>{text}</p>
          </div>
        ))}
        <p className="text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
          This is a fictional profile created for the theomy demo — not a real person.
        </p>
      </div>
    </div>
  );
}
