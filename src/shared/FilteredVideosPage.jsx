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
// A studio view (uploadedBy set) gets the premium treatment: the
// organiser's own cover image as a full-width banner up top (falls back
// to a plain title if they haven't uploaded one), then the video grid,
// then their public "About" sections in a styled card. A language view
// just gets the plain title + grid — there's no organiser to bannerize.
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

  return (
    <div style={{ background: COLORS.black, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}>
      {/* ---------------- Cover banner (studio view, when uploaded) ---------------- */}
      {uploadedBy && coverImageUrl ? (
        <div className="relative w-full pt-16 sm:pt-20" style={{ aspectRatio: "16 / 5", maxHeight: 420 }}>
          <img src={coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.92) 100%)" }} />
          <div className="relative flex h-full flex-col justify-end px-6 pb-8 sm:px-10 sm:pb-10">
            <button
              type="button"
              onClick={onBack}
              className="mb-auto mt-2 flex w-fit items-center gap-2 text-sm font-medium hover:opacity-80"
              style={{ color: "rgba(245,235,221,0.75)" }}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: COLORS.gold }}>{sectionLabel}</p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: COLORS.cream, textShadow: "0 2px 24px rgba(0,0,0,0.5)" }}>
              {heading}
            </h1>
          </div>
        </div>
      ) : null}

      <main className={uploadedBy && coverImageUrl ? "px-6 pb-16 pt-10 sm:px-10" : "px-6 pb-16 pt-24 sm:px-10 sm:pt-28"}>
        {!(uploadedBy && coverImageUrl) && (
          <>
            <button
              type="button"
              onClick={onBack}
              className="mb-6 flex items-center gap-2 text-sm font-medium hover:opacity-80"
              style={{ color: "rgba(245,235,221,0.6)" }}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <h1 className="mb-8 text-2xl font-semibold sm:text-3xl" style={{ color: COLORS.cream }}>{title}</h1>
          </>
        )}

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
                  <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)", boxShadow: `0 12px 32px -8px rgba(0,0,0,0.6)` }} />
                </div>
                <p className="truncate text-sm font-medium" style={{ color: COLORS.cream }}>{v.title}</p>
                <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{v.release_year}</p>
              </button>
            ))}
          </div>
        )}

        {aboutSections.length > 0 && (
          <div className="mt-16 rounded-2xl p-6 sm:p-8" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "linear-gradient(to right, rgba(212,175,55,0.4), transparent)" }} />
              <h2 className="text-xl font-semibold sm:text-2xl" style={{ color: COLORS.cream }}>About {heading}</h2>
              <div className="h-px flex-1" style={{ background: "linear-gradient(to left, rgba(212,175,55,0.4), transparent)" }} />
            </div>
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {aboutSections.map((s) => (
                <div key={s.id}>
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: COLORS.gold }}>{s.title}</p>
                  <div
                    className="text-sm leading-relaxed sm:text-[15px]"
                    style={{ color: "rgba(245,235,221,0.8)" }}
                    dangerouslySetInnerHTML={{ __html: s.content_html }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
