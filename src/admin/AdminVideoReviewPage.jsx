import React, { useEffect, useState } from "react";
import { fetchAdminVideos, approveVideo, rejectVideo, disableVideo, enableVideo, deleteVideo } from "./adminApi";

const COLORS = {
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

const VIDEO_STATUS_TABS = ["pending", "published", "disabled", "rejected", "all"];

const VIDEO_STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  published: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  disabled: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

export default function AdminVideoReviewPage() {
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videoStatusFilter, setVideoStatusFilter] = useState("pending");
  const [rejectingVideoId, setRejectingVideoId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [videoActionError, setVideoActionError] = useState("");
  const [expandedPreviewId, setExpandedPreviewId] = useState(null);

  const loadVideos = (statusFilter) => {
    setVideosLoading(true);
    fetchAdminVideos(statusFilter)
      .then(setVideos)
      .catch(() => setVideos([]))
      .finally(() => setVideosLoading(false));
  };

  useEffect(() => {
    loadVideos(videoStatusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoStatusFilter]);

  const handleApprove = async (videoId) => {
    setVideoActionError("");
    try {
      await approveVideo(videoId);
      loadVideos(videoStatusFilter);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't approve this video.");
    }
  };

  const handleReject = async (videoId) => {
    if (!rejectNote.trim()) return;
    setVideoActionError("");
    try {
      await rejectVideo(videoId, rejectNote.trim());
      setRejectingVideoId(null);
      setRejectNote("");
      loadVideos(videoStatusFilter);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't reject this video.");
    }
  };

  const handleDisable = async (videoId) => {
    setVideoActionError("");
    try {
      await disableVideo(videoId);
      loadVideos(videoStatusFilter);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't disable this video.");
    }
  };

  const handleEnable = async (videoId) => {
    setVideoActionError("");
    try {
      await enableVideo(videoId);
      loadVideos(videoStatusFilter);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't re-enable this video.");
    }
  };

  const handleDelete = async (videoId, title) => {
    const confirmed = window.confirm(
      `Permanently delete "${title}"?\n\nThis removes it from theomy AND deletes the actual video file from Bunny Stream. This cannot be undone.`
    );
    if (!confirmed) return;
    setVideoActionError("");
    try {
      await deleteVideo(videoId);
      loadVideos(videoStatusFilter);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't delete this video.");
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold" style={{ color: COLORS.cream }}>Video review</h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Watch before you approve. Disable hides a video without deleting it; Delete is permanent and removes the file from Bunny Stream too.</p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {VIDEO_STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setVideoStatusFilter(s)}
            className="rounded-full px-3 py-1 text-xs font-medium capitalize"
            style={{
              background: videoStatusFilter === s ? "rgba(212,175,55,0.14)" : "transparent",
              border: `1px solid ${videoStatusFilter === s ? COLORS.gold : "rgba(245,235,221,0.15)"}`,
              color: videoStatusFilter === s ? COLORS.gold : "rgba(245,235,221,0.6)",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {videoActionError && (
        <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>{videoActionError}</p>
      )}

      {videosLoading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : videos.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No {videoStatusFilter !== "all" ? videoStatusFilter : ""} videos.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {videos.map((v) => {
            const st = VIDEO_STATUS_STYLES[v.status] || VIDEO_STATUS_STYLES.pending;
            const isPreviewOpen = expandedPreviewId === v.id;
            return (
              <div key={v.id} className="rounded-xl px-4 py-3" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{v.title}</p>
                    <p className="mt-0.5 text-xs capitalize" style={{ color: "rgba(245,235,221,0.5)" }}>
                      By {v.uploaded_by_name} · {v.section} · {v.categories.join(", ")} · {v.release_year} · {v.age_rating} · {v.monetization_type.replace(/_/g, " ")} · {v.has_ads ? "Ad Present" : "Ad Free"} · Submitted {formatDate(v.created_at)}
                    </p>
                    {v.description && (
                      <p className="mt-1.5 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>{v.description}</p>
                    )}
                    {v.pricing && (
                      <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>Pay-Per-Video: ₹{v.pricing.price_inr} / ${v.pricing.price_usd}</p>
                    )}
                    {v.revenue_tiers.length > 0 && (
                      <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                        {v.revenue_tiers.map((t) => `${t.min_minutes}-${t.max_minutes ?? "unlimited"}min: ₹${t.rate_per_minute_inr}/min`).join(" · ")}
                      </p>
                    )}
                    {v.cast.length > 0 && (
                      <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                        Cast: {v.cast.map((c) => c.character_role ? `${c.person.name} as ${c.character_role}` : c.person.name).join(", ")}
                      </p>
                    )}
                    {v.crew.length > 0 && (
                      <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                        Crew: {v.crew.map((c) => `${c.role}: ${c.person.name}`).join(" · ")}
                      </p>
                    )}
                    {v.admin_note && (
                      <p className="mt-1 text-xs" style={{ color: "#f87171" }}>Note: {v.admin_note}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ background: st.bg, color: st.color }}>{v.status}</span>
                </div>

                {/* Watch before approving — real embedded preview */}
                {v.has_file ? (
                  <div className="mt-3">
                    <button
                      onClick={() => setExpandedPreviewId(isPreviewOpen ? null : v.id)}
                      className="text-xs font-medium hover:opacity-80"
                      style={{ color: COLORS.gold }}
                    >
                      {isPreviewOpen ? "Hide preview ▲" : "▶ Watch before deciding"}
                    </button>
                    {isPreviewOpen && (
                      <div className="mt-2 overflow-hidden rounded-lg" style={{ position: "relative", paddingTop: "56.25%", background: "#000" }}>
                        <iframe
                          src={v.embed_url}
                          loading="lazy"
                          style={{ border: "none", position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                          allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
                          allowFullScreen
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>No video file uploaded yet — nothing to preview.</p>
                )}

                {/* Actions — different per status, exactly as specified */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {v.status === "pending" && (
                    <>
                      <button
                        onClick={() => handleApprove(v.id)}
                        className="rounded-full px-4 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                        style={{ background: "#6FCF97" }}
                      >
                        Approve
                      </button>
                      {rejectingVideoId === v.id ? (
                        <>
                          <input
                            type="text"
                            autoFocus
                            placeholder="Reason for rejection…"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleReject(v.id)}
                            className="flex-1 rounded-full border px-3 py-1.5 text-xs outline-none"
                            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                          />
                          <button
                            onClick={() => handleReject(v.id)}
                            disabled={!rejectNote.trim()}
                            className="rounded-full px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                            style={{ background: "#f87171" }}
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => { setRejectingVideoId(null); setRejectNote(""); }}
                            className="text-xs hover:opacity-80"
                            style={{ color: "rgba(245,235,221,0.5)" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setRejectingVideoId(v.id)}
                          className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                          style={{ borderColor: "#f87171", color: "#f87171" }}
                        >
                          Reject
                        </button>
                      )}
                    </>
                  )}

                  {v.status === "published" && (
                    <>
                      <button
                        onClick={() => handleDisable(v.id)}
                        className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                        style={{ borderColor: "#94a3b8", color: "#94a3b8" }}
                      >
                        Disable
                      </button>
                      <button
                        onClick={() => handleDelete(v.id, v.title)}
                        className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                        style={{ borderColor: "#f87171", color: "#f87171" }}
                      >
                        Delete
                      </button>
                    </>
                  )}

                  {v.status === "disabled" && (
                    <>
                      <button
                        onClick={() => handleEnable(v.id)}
                        className="rounded-full px-4 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                        style={{ background: "#6FCF97" }}
                      >
                        Enable
                      </button>
                      <button
                        onClick={() => handleDelete(v.id, v.title)}
                        className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                        style={{ borderColor: "#f87171", color: "#f87171" }}
                      >
                        Delete
                      </button>
                    </>
                  )}

                  {v.status === "rejected" && (
                    <button
                      onClick={() => handleDelete(v.id, v.title)}
                      className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                      style={{ borderColor: "#f87171", color: "#f87171" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
