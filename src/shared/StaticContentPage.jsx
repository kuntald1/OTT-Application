import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { COLORS, NAV_CLEARANCE_CLASS } from "../theme";
import { fetchSitePage } from "../api";

// ---------------------------------------------------------------------------
// Generic renderer for the site's static content pages — About Us, Contact
// Us, Privacy Policy, Terms of Service, Cookie Policy. Content is entirely
// admin-editable (Admin > Content & Policy Management); this component just
// fetches by slug and displays title + content as plain paragraphs (one per
// blank-line-separated block, so an admin can format with line breaks).
// ---------------------------------------------------------------------------

export default function StaticContentPage({ slug, onBack }) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchSitePage(slug)
      .then(setPage)
      .catch(() => setError("This page hasn't been set up yet."))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <div style={{ background: COLORS.black, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}>
      <div className={`mx-auto max-w-2xl px-6 py-8 sm:px-10 ${NAV_CLEARANCE_CLASS}`}>
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-sm font-medium hover:opacity-80"
          style={{ color: "rgba(245,235,221,0.6)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : error ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>{error}</p>
        ) : (
          <>
            <h1 className="mb-6 text-3xl font-semibold" style={{ color: COLORS.cream }}>{page.title}</h1>
            <div className="flex flex-col gap-4">
              {page.content.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="text-sm leading-relaxed sm:text-base" style={{ color: "rgba(245,235,221,0.75)", whiteSpace: "pre-line" }}>
                  {para}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
