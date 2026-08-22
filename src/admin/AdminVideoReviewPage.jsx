import React, { useEffect, useState } from "react";
import { fetchAdminVideos, approveVideo, rejectVideo } from "./adminApi";

const COLORS = {
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

const VIDEO_STATUS_TABS = ["pending", "published", "rejected", "all"];

const VIDEO_STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  published: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

export default function AdminVideoReviewPage() {
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videoStatusFilter, setVideoStatusFilter] = useState("pending");
  const [rejectingVideoId, setRejectingVideoId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [videoActionError, setVideoActionError] = useState("");

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

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold" style={{ color: COLORS.cream }}>Video review</h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Approve or reject videos submitted by Content Creators and Plays Organisers.</p>

      <div className="mb-4 flex gap-1.5">
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
            return (
              <div key={v.id} className="rounded-xl px-4 py-3" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{v.title}</p>
                    <p className="mt-0.5 text-xs capitalize" style={{ color: "rgba(245,235,221,0.5)" }}>
                      By {v.uploaded_by_name} · {v.section} · {v.category} · {v.monetization_type.replace(/_/g, " ")} · {v.has_ads ? "Ad Present" : "Ad Free"} · Submitted {formatDate(v.created_at)}
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
                    <p className="mt-1 text-xs" style={{ color: v.has_file ? "#6FCF97" : "rgba(245,235,221,0.4)" }}>
                      {v.has_file ? "Video file uploaded" : "No video file uploaded yet"}
                    </p>
                    {v.admin_note && (
                      <p className="mt-1 text-xs" style={{ color: "#f87171" }}>Note: {v.admin_note}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ background: st.bg, color: st.color }}>{v.status}</span>
                </div>

                {v.status === "pending" && (
                  <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
