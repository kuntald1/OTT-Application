import React, { useEffect, useState } from "react";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { COLORS } from "../theme";
import { fetchPublishedVideos, fetchOrganiserProfileSections, fetchStudioCoverImage } from "../api";

// ---------------------------------------------------------------------------
// The page shown after clicking a tile in DiscoveryRows — either every
// published video in a language, or every published video from one studio
// (Plays Organiser), always scoped to the section (Play/Archive) the tile
// was clicked from.
//
// A studio view (uploadedBy set) leads with the organiser's own profile —
// cover image on the left, name + "About" sections on the right, side by
// side — with the video grid below that. A language view just gets the
// plain title + grid — there's no organiser profile to lead with.
// ---------------------------------------------------------------------------

export default function FilteredVideosPage({ section, language, uploadedBy, studioName, title, onBack, onOpenVideo }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aboutSections, setAboutSections] = useState([]);
  const [coverImageUrl, setCoverImageUrl] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetchPublishedVideos(section, { language, uploadedBy })
      .then(setVideos)
      .catch(() => setVideos([]))
      .finally(() => setLoading(false));
  }, [section, language, uploadedBy]);

  useEffect(() => {
    if (!uploadedBy) { setAboutSections([]); setCoverImageUrl(null); return; }
    fetchOrganiserProfileSections(uploadedBy).then(setAboutSections).catch(() => setAboutSections([]));
    fetchStudioCoverImage(uploadedBy).then((r) => setCoverImageUrl(r.cover_image_url)).catch(() => setCoverImageUrl(null));
  }, [uploadedBy]);

  const sectionLabel = section === "archive" ? "Archive" : "Plays";
  const heading = uploadedBy ? (studioName || title) : title;
  const isStudioView = Boolean(uploadedBy);

  return (
    <div style={{ background: COLORS.black, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}>
      <main className="px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-sm font-medium hover:opacity-80"
          style={{ color: "rgba(245,235,221,0.6)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* ---------------- Studio profile — image left, About right ---------------- */}
        {isStudioView ? (
          <div className="mb-12 grid gap-8 md:grid-cols-[320px_1fr] md:gap-10">
            <div>
              <div
                className="overflow-hidden rounded-2xl"
                style={{ aspectRatio: "4 / 5", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {coverImageUrl && <img src={coverImageUrl} alt="" className="h-full w-full object-cover" />}
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: COLORS.gold }}>{sectionLabel}</p>
              <h1 className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: COLORS.cream }}>{heading}</h1>
              {aboutSections.length > 0 ? (
                <div className="flex flex-col gap-5">
                  {aboutSections.map((s) => (
                    <div key={s.id}>
                      <p className="mb-1.5 text-sm font-semibold uppercase tracking-wide" style={{ color: COLORS.gold }}>{s.title}</p>
                      <div
                        className="text-sm leading-relaxed sm:text-[15px]"
                        style={{ color: "rgba(245,235,221,0.8)" }}
                        dangerouslySetInnerHTML={{ __html: s.content_html }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: "rgba(245,235,221,0.4)" }}>No About page yet.</p>
              )}
            </div>
          </div>
        ) : (
          <h1 className="mb-8 text-2xl font-semibold sm:text-3xl" style={{ color: COLORS.cream }}>{title}</h1>
        )}

        {/* ---------------- Video grid ---------------- */}
        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Clapperboard className="h-8 w-8" style={{ color: "rgba(245,235,221,0.25)" }} />
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No videos found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {videos.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => onOpenVideo?.(v.id)}
                className="group text-left"
              >
                <div
                  className="relative mb-2.5 aspect-[2/3] overflow-hidden rounded-xl transition-transform duration-300 ease-out group-hover:-translate-y-1"
                  style={{ background: "#1a1a1a", boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}
                >
                  {v.poster_image_url && (
                    <img src={v.poster_image_url} alt="" className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" />
                  )}
                  <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)" }} />
                </div>
                <p className="truncate text-sm font-medium" style={{ color: COLORS.cream }}>{v.title}</p>
                <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{v.release_year}</p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
