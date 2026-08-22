import React, { useEffect, useState } from "react";
import { ArrowLeft, Video, Plus, Trash2, ChevronDown, Upload, CheckCircle2 } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { uploadVideo, uploadVideoFile, fetchMyVideos } from "../api";

// ---------------------------------------------------------------------------
// My Video List — Phase 1: metadata, pricing, and revenue tiers only. No
// actual video FILE upload yet — that's Phase 2, once Bunny Stream is
// wired in. A video submitted here starts "pending" and only becomes
// visible on Play/Archive once an admin approves it (currently via
// direct SQL, until the Admin Module grows an approval UI).
// ---------------------------------------------------------------------------

const inputStyle = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)",
  color: COLORS.cream,
  padding: "10px 14px",
  fontSize: 14,
  outline: "none",
};

const labelStyle = {
  marginBottom: 6,
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  color: "rgba(245,235,221,0.5)",
};

const STATUS_STYLES = {
  pending: { bg: "rgba(212,175,55,0.15)", color: "#D4AF37" },
  published: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  rejected: { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

function makeEmptyTier() {
  return { key: Math.random().toString(36).slice(2), min_minutes: "", max_minutes: "", rate_per_minute_inr: "" };
}

export default function MyVideoListPage({ onBack }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const [form, setForm] = useState({
    title: "", description: "", section: "play", has_ads: true, monetization_type: "subscription_only",
    price_inr: "", price_usd: "",
  });
  const [sectionOpen, setSectionOpen] = useState(false);
  const [tiers, setTiers] = useState([makeEmptyTier()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploadingFileFor, setUploadingFileFor] = useState(null);
  const [fileUploadError, setFileUploadError] = useState("");

  const loadVideos = () => {
    setLoading(true);
    fetchMyVideos().then(setVideos).catch(() => setVideos([])).finally(() => setLoading(false));
  };

  useEffect(() => { loadVideos(); }, []);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const updateTier = (key, field, value) => setTiers((list) => list.map((t) => (t.key === key ? { ...t, [field]: value } : t)));
  const addTier = () => tiers.length < 5 && setTiers((list) => [...list, makeEmptyTier()]);
  const removeTier = (key) => setTiers((list) => (list.length > 1 ? list.filter((t) => t.key !== key) : list));

  const isPayPerVideo = form.monetization_type === "pay_per_video";
  const tiersValid = tiers.every((t) => t.min_minutes !== "" && Number(t.rate_per_minute_inr) > 0);
  const pricingValid = !isPayPerVideo || (Number(form.price_inr) > 0 && Number(form.price_usd) > 0);
  const canSubmit = form.title.trim() && tiersValid && pricingValid;

  const resetForm = () => {
    setForm({ title: "", description: "", section: "play", has_ads: true, monetization_type: "subscription_only", price_inr: "", price_usd: "" });
    setTiers([makeEmptyTier()]);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        section: form.section,
        has_ads: form.has_ads,
        monetization_type: form.monetization_type,
        price_inr: isPayPerVideo ? Number(form.price_inr) : null,
        price_usd: isPayPerVideo ? Number(form.price_usd) : null,
        revenue_tiers: tiers.map((t) => ({
          min_minutes: Number(t.min_minutes),
          max_minutes: t.max_minutes === "" ? null : Number(t.max_minutes),
          rate_per_minute_inr: Number(t.rate_per_minute_inr),
        })),
      };
      await uploadVideo(payload);
      resetForm();
      setShowUpload(false);
      loadVideos();
    } catch (err) {
      setError(err.message || "Couldn't submit video. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  const handleFileSelect = async (videoId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploadError("");
    setUploadingFileFor(videoId);
    try {
      await uploadVideoFile(videoId, file);
      loadVideos();
    } catch (err) {
      setFileUploadError(err.message || "Couldn't upload video file. Please try again.");
    } finally {
      setUploadingFileFor(null);
    }
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-2xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button type="button" onClick={onBack} className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold" style={{ color: COLORS.cream }}>My Video List</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>Submit video details for admin review. Actual video file upload is coming in the next phase.</p>
          </div>
          <button
            type="button"
            onClick={() => { setShowUpload((v) => !v); setError(""); }}
            className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold hover:opacity-90"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            <Video className="h-4 w-4" /> {showUpload ? "Cancel" : "Add video"}
          </button>
        </div>

        {showUpload && (
          <div className="mb-8 flex flex-col gap-4 rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}>
            <div>
              <label style={labelStyle}>Title *</label>
              <input type="text" value={form.title} onChange={update("title")} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea rows={3} value={form.description} onChange={update("description")} style={{ ...inputStyle, resize: "vertical" }} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label style={labelStyle}>Section *</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setSectionOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm capitalize"
                    style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                  >
                    {form.section}
                    <ChevronDown className={`h-4 w-4 transition-transform ${sectionOpen ? "rotate-180" : ""}`} />
                  </button>
                  {sectionOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setSectionOpen(false)} />
                      <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.25)" }}>
                        {["play", "archive"].map((s) => (
                          <button key={s} type="button" onClick={() => { setForm((f) => ({ ...f, section: s })); setSectionOpen(false); }} className="block w-full px-4 py-2.5 text-left text-sm capitalize hover:bg-white/10" style={{ color: form.section === s ? COLORS.gold : "rgba(245,235,221,0.85)" }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Ads</label>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, has_ads: !f.has_ads }))}
                  className="flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm"
                  style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                >
                  {form.has_ads ? "Ad Present" : "Ad Free"}
                  <div className="flex h-5 w-9 flex-shrink-0 items-center rounded-full p-0.5" style={{ background: form.has_ads ? CTA_GRADIENT : "rgba(255,255,255,0.15)" }}>
                    <div className="h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: form.has_ads ? "translateX(16px)" : "translateX(0)" }} />
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Monetization</label>
              <div className="flex gap-2">
                {[["subscription_only", "Subscription Only"], ["pay_per_video", "Pay Per Video"]].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, monetization_type: val }))}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium"
                    style={{
                      borderColor: form.monetization_type === val ? COLORS.gold : "rgba(245,235,221,0.15)",
                      background: form.monetization_type === val ? "rgba(212,175,55,0.14)" : "transparent",
                      color: form.monetization_type === val ? COLORS.gold : "rgba(245,235,221,0.7)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {isPayPerVideo && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label style={labelStyle}>Price (₹) *</label>
                  <input type="number" min="0" value={form.price_inr} onChange={update("price_inr")} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Price ($) *</label>
                  <input type="number" min="0" value={form.price_usd} onChange={update("price_usd")} style={inputStyle} />
                </div>
              </div>
            )}

            <div>
              <label style={labelStyle}>Revenue-Share Tiers * (up to 5)</label>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 px-1 text-xs font-medium" style={{ color: "rgba(245,235,221,0.4)" }}>
                  <span>Min (min)</span><span>Max (min)</span><span>Rate ₹/min</span><span></span>
                </div>
                {tiers.map((t) => (
                  <div key={t.key} className="grid grid-cols-[1fr_1fr_1fr_32px] items-center gap-2">
                    <input type="number" min="1" placeholder="1" value={t.min_minutes} onChange={(e) => updateTier(t.key, "min_minutes", e.target.value)} style={inputStyle} />
                    <input type="number" min="1" placeholder="unlimited" value={t.max_minutes} onChange={(e) => updateTier(t.key, "max_minutes", e.target.value)} style={inputStyle} />
                    <input type="number" min="0" step="0.01" placeholder="1.20" value={t.rate_per_minute_inr} onChange={(e) => updateTier(t.key, "rate_per_minute_inr", e.target.value)} style={inputStyle} />
                    <button type="button" onClick={() => removeTier(t.key)} disabled={tiers.length === 1} className="flex h-9 w-9 items-center justify-center rounded-lg disabled:opacity-30" style={{ color: "#f87171" }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {tiers.length < 5 && (
                <button type="button" onClick={addTier} className="mt-2 flex items-center gap-1 text-xs font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                  <Plus className="h-3.5 w-3.5" /> Add tier
                </button>
              )}
            </div>

            {error && <p className="text-sm font-medium" style={{ color: "#f87171" }}>{error}</p>}

            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
              className="rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          </div>
        )}

        <h3 className="mb-3 text-sm font-semibold" style={{ color: "rgba(245,235,221,0.7)" }}>Your videos</h3>
        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-16 text-center" style={{ background: COLORS.blackSoft, border: "1px dashed rgba(212,175,55,0.25)" }}>
            <Video className="h-8 w-8" style={{ color: "rgba(212,175,55,0.5)" }} />
            <p className="text-sm font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>No videos yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {videos.map((v) => {
              const st = STATUS_STYLES[v.status] || STATUS_STYLES.pending;
              return (
                <div key={v.id} className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{v.title}</p>
                      <p className="mt-0.5 text-xs capitalize" style={{ color: "rgba(245,235,221,0.5)" }}>
                        {v.section} · {v.monetization_type.replace(/_/g, " ")} · {v.has_ads ? "Ad Present" : "Ad Free"} · Submitted {formatDate(v.created_at)}
                        {v.admin_note && ` · ${v.admin_note}`}
                      </p>
                    </div>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ background: st.bg, color: st.color }}>{v.status}</span>
                  </div>
                  {v.pricing && (
                    <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
                      Pay-Per-Video: ₹{v.pricing.price_inr} / ${v.pricing.price_usd}
                    </p>
                  )}

                  {/* Phase 2 — actual video file upload */}
                  {v.has_file ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: "#6FCF97" }}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Video file uploaded — processing may take a few minutes before it's playable.
                    </p>
                  ) : (
                    <div className="mt-3">
                      <label
                        className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                        style={{ borderColor: "rgba(212,175,55,0.3)", color: COLORS.gold }}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingFileFor === v.id ? "Uploading…" : "Upload video file"}
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo"
                          className="hidden"
                          disabled={uploadingFileFor === v.id}
                          onChange={(e) => handleFileSelect(v.id, e)}
                        />
                      </label>
                      {fileUploadError && uploadingFileFor === null && (
                        <p className="mt-1.5 text-xs font-medium" style={{ color: "#f87171" }}>{fileUploadError}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
