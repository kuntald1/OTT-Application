import React, { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { fetchAdminVideos, approveVideo, rejectVideo, disableVideo, enableVideo, deleteVideo, uploadAdminPersonPhoto, scheduleVideo, cancelVideoSchedule } from "./adminApi";
import AdminVideoEditForm from "./AdminVideoEditForm";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = {
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

const VIDEO_STATUS_TABS = ["pending", "scheduled", "published", "disabled", "rejected", "all"];

const VIDEO_STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: COLORS.gold },
  scheduled: { bg: "rgba(91,155,213,0.15)", color: "#5B9BD5" },
  published: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  disabled: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

// Search box — a video matches when EVERY word typed appears somewhere in
// what the review card shows: title, uploader, section, categories, year,
// description, and cast/crew names and roles (case-insensitive "contains",
// so "guards taj" finds "The Guards at the Taj"). The list for each status
// tab is already loaded in full, so this is just a filter on that list —
// no extra requests, and the text stays put when switching tabs.
function videoMatchesSearch(v, terms) {
  if (terms.length === 0) return true;
  const haystack = [
    v.title, v.uploaded_by_name, v.section, v.description, v.release_year,
    ...(v.categories || []),
    ...(v.cast || []).flatMap((c) => [c.person?.name, c.character_role]),
    ...(v.crew || []).flatMap((c) => [c.person?.name, c.role]),
  ].filter(Boolean).join(" ").toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

export default function AdminVideoReviewPage() {
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videoStatusFilter, setVideoStatusFilter] = useState("pending");
  const [videoSearch, setVideoSearch] = useState("");
  const [rejectingVideoId, setRejectingVideoId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [videoActionError, setVideoActionError] = useState("");
  const [expandedPreviewId, setExpandedPreviewId] = useState(null);
  const [editingVideoId, setEditingVideoId] = useState(null);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null);
  const [schedulingVideoId, setSchedulingVideoId] = useState(null);
  const [scheduleDateTime, setScheduleDateTime] = useState("");
  const [schedulingBusy, setSchedulingBusy] = useState(false);

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

  const handleSchedule = async (videoId) => {
    if (!scheduleDateTime) return;
    // The <input type="datetime-local"> value has no timezone info of
    // its own — `new Date(...)` on it is interpreted in the ADMIN'S
    // OWN BROWSER's local timezone (exactly what we want: the admin
    // picks "13 Sept, 11pm" meaning their own local 11pm). scheduleVideo()
    // then converts that to an absolute UTC instant via .toISOString()
    // before sending it, so the server's own timezone never matters.
    const localDate = new Date(scheduleDateTime);
    if (Number.isNaN(localDate.getTime())) return;
    setSchedulingBusy(true);
    setVideoActionError("");
    try {
      await scheduleVideo(videoId, localDate);
      setSchedulingVideoId(null);
      setScheduleDateTime("");
      loadVideos(videoStatusFilter);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't schedule this video.");
    } finally {
      setSchedulingBusy(false);
    }
  };

  const handleCancelSchedule = async (videoId) => {
    setVideoActionError("");
    try {
      await cancelVideoSchedule(videoId);
      loadVideos(videoStatusFilter);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't cancel the schedule.");
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

  const [confirmDeleteVideo, setConfirmDeleteVideo] = useState(null); // { id, title }
  const [deletingVideo, setDeletingVideo] = useState(false);

  const handleDeleteConfirmed = async () => {
    setDeletingVideo(true);
    setVideoActionError("");
    try {
      await deleteVideo(confirmDeleteVideo.id);
      loadVideos(videoStatusFilter);
      setConfirmDeleteVideo(null);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't delete this video.");
    } finally {
      setDeletingVideo(false);
    }
  };

  const handlePersonPhotoSelect = async (personId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhotoFor(personId);
    try {
      await uploadAdminPersonPhoto(personId, file);
      loadVideos(videoStatusFilter);
    } catch (err) {
      setVideoActionError(err.message || "Couldn't upload photo. Please try again.");
    } finally {
      setUploadingPhotoFor(null);
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const searchTerms = videoSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleVideos = videos.filter((v) => videoMatchesSearch(v, searchTerms));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold" style={{ color: COLORS.cream }}>Video review</h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Watch before you approve. Disable hides a video without deleting it; Delete is permanent and removes the file from Bunny Stream too.</p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "rgba(245,235,221,0.45)" }} />
          <input
            type="text"
            value={videoSearch}
            onChange={(e) => setVideoSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setVideoSearch(""); }}
            placeholder="Search title, uploader, category, cast, crew…"
            aria-label="Search videos"
            className="w-full rounded-lg border py-2 pl-9 pr-9 text-sm outline-none"
            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
          />
          {videoSearch && (
            <button
              type="button"
              onClick={() => setVideoSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:opacity-80"
              style={{ color: "rgba(245,235,221,0.6)" }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {searchTerms.length > 0 && !videosLoading && (
          <span className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            Showing {visibleVideos.length} of {videos.length}{videoStatusFilter !== "all" ? ` ${videoStatusFilter}` : ""} videos
          </span>
        )}
      </div>

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
      ) : visibleVideos.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
          No {videoStatusFilter !== "all" ? videoStatusFilter : ""} videos match "{videoSearch.trim()}".
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visibleVideos.map((v) => {
            const st = VIDEO_STATUS_STYLES[v.status] || VIDEO_STATUS_STYLES.pending;
            const isPreviewOpen = expandedPreviewId === v.id;
            return (
              <div key={v.id} className="rounded-xl px-4 py-3" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{v.title}</p>
                    <p className="mt-0.5 text-xs capitalize" style={{ color: "rgba(245,235,221,0.5)" }}>
                      By {v.uploaded_by_name} · {v.section} · {v.categories.join(", ")} · {v.release_year}{v.duration_seconds > 0 ? ` · ${Math.floor(v.duration_seconds / 3600)}h ${String(Math.round((v.duration_seconds % 3600) / 60)).padStart(2, "0")}m` : ""} · {v.age_rating} · {v.monetization_type.replace(/_/g, " ")} · {v.has_ads ? "Ad Present" : "Ad Free"} · Submitted {formatDate(v.created_at)}
                    </p>
                    {v.description && (
                      <p className="mt-1.5 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>{v.description}</p>
                    )}
                    {(v.cast.length > 0 || v.crew.length > 0) && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {v.cast.map((c) => (
                          <div key={c.id} className="flex items-center gap-2">
                            {c.person.photo_url ? (
                              <img src={c.person.photo_url} alt="" className="h-5 w-5 flex-shrink-0 rounded-full object-cover" />
                            ) : (
                              <span className="h-5 w-5 flex-shrink-0 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
                            )}
                            <span className="text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
                              {c.person.name}{c.character_role ? ` as ${c.character_role}` : ""}
                            </span>
                            {!c.person.photo_url && (
                              <label className="cursor-pointer text-[11px] font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                                {uploadingPhotoFor === c.person.id ? "Uploading…" : "+ Photo"}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingPhotoFor === c.person.id} onChange={(e) => handlePersonPhotoSelect(c.person.id, e)} />
                              </label>
                            )}
                          </div>
                        ))}
                        {v.crew.map((c) => (
                          <div key={c.id} className="flex items-center gap-2">
                            {c.person.photo_url ? (
                              <img src={c.person.photo_url} alt="" className="h-5 w-5 flex-shrink-0 rounded-full object-cover" />
                            ) : (
                              <span className="h-5 w-5 flex-shrink-0 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
                            )}
                            <span className="text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
                              {c.role}: {c.person.name}
                            </span>
                            {!c.person.photo_url && (
                              <label className="cursor-pointer text-[11px] font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                                {uploadingPhotoFor === c.person.id ? "Uploading…" : "+ Photo"}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingPhotoFor === c.person.id} onChange={(e) => handlePersonPhotoSelect(c.person.id, e)} />
                              </label>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {v.pricing && (
                      <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>Pay-Per-Video: ₹{v.pricing.price_inr} / ${v.pricing.price_usd}</p>
                    )}
                    {v.revenue_tiers.length > 0 && (
                      <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                        {v.revenue_tiers.map((t) => `${t.min_minutes}–${t.max_minutes ?? "unlimited"} min: ₹${t.rate_per_minute_inr}/min`).join(" · ")}
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

                {/* Edit — works regardless of status, exactly as requested */}
                <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <button
                    onClick={() => setEditingVideoId(editingVideoId === v.id ? null : v.id)}
                    className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                    style={{ borderColor: "rgba(212,175,55,0.4)", color: COLORS.gold }}
                  >
                    {editingVideoId === v.id ? "Close editor" : "Edit"}
                  </button>
                </div>

                {editingVideoId === v.id && (
                  <AdminVideoEditForm
                    video={v}
                    onCancel={() => setEditingVideoId(null)}
                    onFileUpdated={(updated) => setVideos((list) => list.map((item) => (item.id === updated.id ? updated : item)))}
                    onSave={(updated) => {
                      setVideos((list) => list.map((item) => (item.id === updated.id ? updated : item)));
                      setEditingVideoId(null);
                    }}
                  />
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
                      {schedulingVideoId === v.id ? (
                        <>
                          <input
                            type="datetime-local"
                            autoFocus
                            value={scheduleDateTime}
                            onChange={(e) => setScheduleDateTime(e.target.value)}
                            className="rounded-full border px-3 py-1.5 text-xs outline-none"
                            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream, colorScheme: "dark" }}
                          />
                          <button
                            onClick={() => handleSchedule(v.id)}
                            disabled={!scheduleDateTime || schedulingBusy}
                            className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
                            style={{ background: "#5B9BD5", color: "#0a0104" }}
                          >
                            {schedulingBusy ? "Scheduling…" : "Confirm"}
                          </button>
                          <button
                            onClick={() => { setSchedulingVideoId(null); setScheduleDateTime(""); }}
                            className="text-xs hover:opacity-80"
                            style={{ color: "rgba(245,235,221,0.5)" }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setSchedulingVideoId(v.id)}
                          className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                          style={{ borderColor: "#5B9BD5", color: "#5B9BD5" }}
                        >
                          Schedule
                        </button>
                      )}
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

                  {v.status === "scheduled" && (
                    <>
                      <span className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(91,155,213,0.12)", color: "#5B9BD5" }}>
                        Scheduled for {v.scheduled_publish_at ? new Date(v.scheduled_publish_at).toLocaleString() : "—"}
                      </span>
                      <button
                        onClick={() => handleApprove(v.id)}
                        className="rounded-full px-4 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                        style={{ background: "#6FCF97" }}
                      >
                        Publish Now
                      </button>
                      <button
                        onClick={() => handleCancelSchedule(v.id)}
                        className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                        style={{ borderColor: "#f87171", color: "#f87171" }}
                      >
                        Cancel Schedule
                      </button>
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
                        onClick={() => setConfirmDeleteVideo({ id: v.id, title: v.title })}
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
                        onClick={() => setConfirmDeleteVideo({ id: v.id, title: v.title })}
                        className="rounded-full border px-4 py-1.5 text-xs font-semibold hover:bg-white/5"
                        style={{ borderColor: "#f87171", color: "#f87171" }}
                      >
                        Delete
                      </button>
                    </>
                  )}

                  {v.status === "rejected" && (
                    <button
                      onClick={() => setConfirmDeleteVideo({ id: v.id, title: v.title })}
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

      <ConfirmDialog
        open={!!confirmDeleteVideo}
        title="Delete video"
        message={`Permanently delete "${confirmDeleteVideo?.title}"? This removes it from theomy AND deletes the actual video file from Bunny Stream. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={deletingVideo}
        onCancel={() => setConfirmDeleteVideo(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
