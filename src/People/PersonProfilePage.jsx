import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS } from "../theme";
import { fetchPerson } from "../api";

// ---------------------------------------------------------------------------
// Real Person profile — reached via GET /api/people/{id}. Same visual
// structure as the site's existing demo cast/crew pages (Occupation,
// Born, Birthplace, About, Early Life, Personal Life, Debut & Initial
// Years, Breakthrough & Beyond, Recent Projects), but every field here is
// real data a Creator entered, not fictional demo content — so no
// "not a real person" disclaimer.
//
// Any section left blank at upload time simply doesn't render — this
// page never fabricates placeholder biography text.
// ---------------------------------------------------------------------------

const SECTIONS = [
  ["about", "About"],
  ["early_life", "Early Life"],
  ["personal_life", "Personal Life"],
  ["debut_initial_years", "Debut & Initial Years"],
  ["breakthrough_beyond", "Breakthrough & Beyond"],
  ["recent_projects", "Recent Projects"],
];

export default function PersonProfilePage({ personId, onBack }) {
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchPerson(personId)
      .then((data) => { setPerson(data); setNotFound(false); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [personId]);

  const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : null;

  if (loading) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (notFound || !person) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.7)" }}>Profile not found.</p>
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button type="button" onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-8 flex flex-wrap items-center gap-5">
          <div
            className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border"
            style={{ borderColor: "rgba(212,175,55,0.3)", background: "rgba(212,175,55,0.08)" }}
          >
            {person.photo_url ? (
              <img src={person.photo_url} alt={person.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl font-semibold" style={{ color: COLORS.gold }}>{person.name[0]?.toUpperCase()}</span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: COLORS.cream }}>{person.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
              {person.occupation && (
                <span>Occupation: <span className="font-medium" style={{ color: COLORS.gold }}>{person.occupation}</span></span>
              )}
              {person.date_of_birth && (
                <span>Born: <span className="font-medium" style={{ color: COLORS.cream }}>{formatDate(person.date_of_birth)}</span></span>
              )}
              {person.birthplace && (
                <span>Birthplace: <span className="font-medium" style={{ color: COLORS.cream }}>{person.birthplace}</span></span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {SECTIONS.filter(([key]) => person[key]).map(([key, label]) => (
            <div key={key}>
              <h2 className="mb-1.5 text-base font-semibold" style={{ color: COLORS.cream }}>{label}</h2>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.7)" }}>{person[key]}</p>
            </div>
          ))}
          {SECTIONS.every(([key]) => !person[key]) && (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.4)" }}>No additional biography details have been added yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
