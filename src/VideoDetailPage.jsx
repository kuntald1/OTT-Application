import React, { useEffect, useState } from "react";
import { ArrowLeft, Play, Users, Film, Megaphone, VolumeX, IndianRupee } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "./theme";
import { fetchVideoById, getToken } from "./api";

// ---------------------------------------------------------------------------
// Real video detail + player page. Reached with a video's id — wire a
// link/onClick from wherever the Play/Archive browse grids render real
// published videos, passing that video's id here.
//
// IMPORTANT, HONEST LIMITATION: this checks that the viewer is LOGGED IN
// before showing the player for subscription_only videos — it does NOT
// yet verify they hold an ACTIVE subscription scoped to the right
// section (Play/Archive). That enforcement is a clearly flagged
// follow-up, not silently skipped. Pay-Per-Video videos always show a
// "coming soon" message instead of a player, since the purchase flow
// (Phase 4) doesn't exist yet — nobody can watch a pay-per-video video
// for free here, that part IS safe.
// ---------------------------------------------------------------------------

export default function VideoDetailPage({ videoId, onBack, onViewPerson }) {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchVideoById(videoId)
      .then((data) => { setVideo(data); setNotFound(false); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [videoId]);

  if (loading) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex items-center justify-center px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (notFound || !video) {
    return (
      <div style={{ background: COLORS.black, minHeight: "100vh" }} className="flex flex-col items-center justify-center gap-3 px-6 pt-24">
        <p style={{ color: "rgba(245,235,221,0.7)" }}>Video not found.</p>
        <button onClick={onBack} className="text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>Go back</button>
      </div>
    );
  }

  const isLoggedIn = !!getToken();
  const isPayPerVideo = video.monetization_type === "pay_per_video";
  const canAttemptPlay = video.has_file && !isPayPerVideo && isLoggedIn;

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      {/* Hero / poster area */}
      <div className="relative w-full" style={{ aspectRatio: "16/7", background: "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(0,0,0,0.6))" }}>
        {playing && canAttemptPlay ? (
          <iframe
            src={video.embed_url}
            loading="lazy"
            style={{ border: "none", position: "absolute", inset: 0, width: "100%", height: "100%" }}
            allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
            allowFullScreen
          />
        ) : (
          <>
            {(video.poster_image_url || video.thumbnail_url) && (
              <img src={video.poster_image_url || video.thumbnail_url} alt={video.title} className="h-full w-full object-cover" style={{ opacity: 0.55 }} />
            )}
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(10,1,4,1), rgba(10,1,4,0.2))" }} />
          </>
        )}

        {!playing && (
          <div className="absolute inset-x-0 bottom-0 px-6 pb-8 sm:px-10">
            <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl" style={{ color: COLORS.cream }}>{video.title}</h1>
          </div>
        )}

        {playing && (
          <button
            onClick={() => setPlaying(false)}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
            style={{ background: "rgba(0,0,0,0.6)", color: COLORS.cream }}
          >
            ✕
          </button>
        )}
      </div>

      <main className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
        {/* Play action / access state */}
        <div className="mb-6">
          {!video.has_file ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>This video is still processing — check back soon.</p>
          ) : isPayPerVideo ? (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.2)" }}>
              <IndianRupee className="h-4 w-4 flex-shrink-0" style={{ color: COLORS.gold }} />
              <p className="text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
                Pay-Per-Video — ₹{video.pricing?.price_inr} / ${video.pricing?.price_usd}. Purchase flow coming soon.
              </p>
            </div>
          ) : !isLoggedIn ? (
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Log in to watch this video.</p>
          ) : !playing ? (
            <button
              onClick={() => setPlaying(true)}
              className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              <Play className="h-4 w-4" fill="currentColor" /> Play
            </button>
          ) : null}
        </div>

        {/* Meta row */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>{video.release_year}</span>
          <span className="rounded border px-1.5 py-0.5 text-xs font-medium" style={{ borderColor: "rgba(212,175,55,0.4)", color: COLORS.gold }}>{video.age_rating}</span>
          {video.categories.map((cat) => (
            <span key={cat} className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: "rgba(212,175,55,0.1)", color: COLORS.gold }}>{cat}</span>
          ))}
          <span className="flex items-center gap-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            {video.has_ads ? <Megaphone className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />} {video.has_ads ? "Ad Present" : "Ad Free"}
          </span>
        </div>

        {video.description && (
          <p className="mb-6 max-w-2xl text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.75)" }}>{video.description}</p>
        )}

        {video.languages.length > 0 && (
          <p className="mb-6 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
            <span style={{ color: "rgba(245,235,221,0.6)" }}>Available in:</span> {video.languages.join(", ")}
          </p>
        )}

        <div className="grid gap-8 sm:grid-cols-2">
          {video.cast.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                <Users className="h-3.5 w-3.5" /> Cast
              </h3>
              <div className="flex flex-col gap-1.5">
                {video.cast.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onViewPerson && onViewPerson(c.person.id)}
                    className="w-fit text-left text-sm font-medium hover:underline"
                    style={{ color: COLORS.gold }}
                  >
                    {c.person.name}{c.character_role ? <span style={{ color: "rgba(245,235,221,0.5)" }}> as {c.character_role}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )}
          {video.crew.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>
                <Film className="h-3.5 w-3.5" /> Crew
              </h3>
              <div className="flex flex-col gap-1.5">
                {video.crew.map((c) => (
                  <div key={c.id} className="text-sm" style={{ color: "rgba(245,235,221,0.75)" }}>
                    <span style={{ color: "rgba(245,235,221,0.5)" }}>{c.role}: </span>
                    <button onClick={() => onViewPerson && onViewPerson(c.person.id)} className="font-medium hover:underline" style={{ color: COLORS.gold }}>
                      {c.person.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
