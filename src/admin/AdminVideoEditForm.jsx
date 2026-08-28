import React, { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ImagePlus, Upload } from "lucide-react";
import { editVideo, fetchAdminAds, fetchAdminVideoCuePoints, addAdminVideoCuePoint, deleteAdminVideoCuePoint, uploadAdminVideoFile, uploadAdminVideoPoster, uploadAdminVideoTrailer, addAdminVideoSubtitle, deleteAdminVideoSubtitle } from "./adminApi";
import { fetchCategoryOptions } from "../api";
import SubtitleManager from "../shared/SubtitleManager";
import FilePreview from "../shared/FilePreview";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const FALLBACK_CATEGORIES = [
  "Bengali Theatre", "Drama", "Comedy", "Musical Theatre",
  "Classical Theatre", "Experimental Theatre", "Popular Shows",
];
const AGE_RATINGS = ["U", "UA7+", "UA13+", "UA16+"];

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

function Dropdown({ label, value, options, onChange, capitalizeOptions }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div className="relative">
        <button
          type="button" onClick={() => setOpen((v) => !v)}
          className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${capitalizeOptions ? "capitalize" : ""}`}
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        >
          {value}
          <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className={`absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg ${capitalizeOptions ? "capitalize" : ""}`} style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }}>
              {options.map((opt) => (
                <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-white/10" style={{ color: value === opt ? COLORS.gold : "rgba(245,235,221,0.85)" }}>
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function tierRowsFromVideo(video) {
  return video.revenue_tiers.length > 0
    ? video.revenue_tiers.map((t) => ({ key: t.id, min_minutes: String(t.min_minutes), max_minutes: t.max_minutes === null ? "" : String(t.max_minutes), rate_per_minute_inr: String(t.rate_per_minute_inr) }))
    : [{ key: "new", min_minutes: "", max_minutes: "", rate_per_minute_inr: "" }];
}
function castRowsFromVideo(video) {
  return video.cast.map((c) => ({
    key: c.id, person_id: c.person.id, name: c.person.name, character_role: c.character_role || "", showBio: false,
    occupation: c.person.occupation || "", date_of_birth: c.person.date_of_birth ? c.person.date_of_birth.slice(0, 10) : "",
    birthplace: c.person.birthplace || "", about: c.person.about || "", early_life: c.person.early_life || "",
    personal_life: c.person.personal_life || "", debut_initial_years: c.person.debut_initial_years || "",
    breakthrough_beyond: c.person.breakthrough_beyond || "", recent_projects: c.person.recent_projects || "",
  }));
}
function crewRowsFromVideo(video) {
  return video.crew.map((c) => ({
    key: c.id, person_id: c.person.id, role: c.role, name: c.person.name, showBio: false,
    occupation: c.person.occupation || "", date_of_birth: c.person.date_of_birth ? c.person.date_of_birth.slice(0, 10) : "",
    birthplace: c.person.birthplace || "", about: c.person.about || "", early_life: c.person.early_life || "",
    personal_life: c.person.personal_life || "", debut_initial_years: c.person.debut_initial_years || "",
    breakthrough_beyond: c.person.breakthrough_beyond || "", recent_projects: c.person.recent_projects || "",
  }));
}
function makeEmptyCast() {
  return {
    key: Math.random().toString(36).slice(2), person_id: null, name: "", character_role: "", showBio: false,
    occupation: "", date_of_birth: "", birthplace: "", about: "",
    early_life: "", personal_life: "", debut_initial_years: "", breakthrough_beyond: "", recent_projects: "",
  };
}
function makeEmptyCrew() {
  return {
    key: Math.random().toString(36).slice(2), person_id: null, role: "", name: "", showBio: false,
    occupation: "", date_of_birth: "", birthplace: "", about: "",
    early_life: "", personal_life: "", debut_initial_years: "", breakthrough_beyond: "", recent_projects: "",
  };
}

export default function AdminVideoEditForm({ video, onSave, onCancel, onFileUpdated }) {
  const [CATEGORIES, setCategories] = useState(FALLBACK_CATEGORIES);

  useEffect(() => {
    fetchCategoryOptions().then((cats) => {
      if (cats.length > 0) setCategories(cats);
    }).catch(() => {});
  }, []);

  // File uploads (video, poster, trailer, subtitles) — admin can
  // replace any of these regardless of the video's current status
  // (pending, published, disabled, rejected), unlike the text-field
  // edits below which go through Save changes. Each upload propagates
  // immediately via onFileUpdated so the rest of the page (and this
  // form's own preview) reflects it without needing Save changes.
  const [uploadingVideoFile, setUploadingVideoFile] = useState(false);
  const [videoFileProgress, setVideoFileProgress] = useState(0);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [uploadingTrailer, setUploadingTrailer] = useState(false);
  const [trailerProgress, setTrailerProgress] = useState(0);
  const [fileError, setFileError] = useState("");

  const handleVideoFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    setVideoFileProgress(0);
    setUploadingVideoFile(true);
    try {
      const updated = await uploadAdminVideoFile(video.id, file, (pct) => setVideoFileProgress(pct));
      onFileUpdated?.(updated);
    } catch (err) {
      setFileError(err.message || "Couldn't upload video file. Please try again.");
    } finally {
      setUploadingVideoFile(false);
      setVideoFileProgress(0);
    }
  };

  const handlePosterSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    setUploadingPoster(true);
    try {
      const updated = await uploadAdminVideoPoster(video.id, file);
      onFileUpdated?.(updated);
    } catch (err) {
      setFileError(err.message || "Couldn't upload poster. Please try again.");
    } finally {
      setUploadingPoster(false);
    }
  };

  const handleTrailerSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    setTrailerProgress(0);
    setUploadingTrailer(true);
    try {
      const updated = await uploadAdminVideoTrailer(video.id, file, (pct) => setTrailerProgress(pct));
      onFileUpdated?.(updated);
    } catch (err) {
      setFileError(err.message || "Couldn't upload trailer. Please try again.");
    } finally {
      setUploadingTrailer(false);
      setTrailerProgress(0);
    }
  };

  const [form, setForm] = useState({
    title: video.title, description: video.description || "", section: video.section,
    categories: video.categories, release_year: String(video.release_year), age_rating: video.age_rating,
    languages: video.languages.join(", "), has_ads: video.has_ads, monetization_type: video.monetization_type,
    price_inr: video.pricing ? String(video.pricing.price_inr) : "", price_usd: video.pricing ? String(video.pricing.price_usd) : "",
  });
  const [tiers, setTiers] = useState(tierRowsFromVideo(video));
  const [cast, setCast] = useState(castRowsFromVideo(video));
  const [crew, setCrew] = useState(crewRowsFromVideo(video));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const toggleCategory = (cat) => setForm((f) => {
    const has = f.categories.includes(cat);
    if (has) return { ...f, categories: f.categories.filter((c) => c !== cat) };
    if (f.categories.length >= 3) return f;
    return { ...f, categories: [...f.categories, cat] };
  });

  const updateTier = (key, field, value) => setTiers((list) => list.map((t) => (t.key === key ? { ...t, [field]: value } : t)));
  const addTier = () => tiers.length < 5 && setTiers((list) => [...list, { key: Math.random().toString(36).slice(2), min_minutes: "", max_minutes: "", rate_per_minute_inr: "" }]);
  const removeTier = (key) => setTiers((list) => (list.length > 1 ? list.filter((t) => t.key !== key) : list));

  const updateCast = (key, field, value) => setCast((list) => list.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  const addCast = () => cast.length < 10 && setCast((list) => [...list, makeEmptyCast()]);
  const removeCast = (key) => setCast((list) => list.filter((c) => c.key !== key));

  const updateCrew = (key, field, value) => setCrew((list) => list.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  const addCrew = () => crew.length < 5 && setCrew((list) => [...list, makeEmptyCrew()]);
  const removeCrew = (key) => setCrew((list) => list.filter((c) => c.key !== key));

  const isPayPerVideo = form.monetization_type === "pay_per_video";
  const tiersValid = tiers.every((t) => t.min_minutes !== "" && Number(t.rate_per_minute_inr) > 0);
  const pricingValid = !isPayPerVideo || (Number(form.price_inr) > 0 && Number(form.price_usd) > 0);
  const canSubmit = form.title.trim() && form.categories.length > 0 && form.release_year && form.age_rating && tiersValid && pricingValid;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(), description: form.description.trim() || null, section: form.section,
        categories: form.categories, release_year: Number(form.release_year), age_rating: form.age_rating,
        languages: form.languages.trim() ? form.languages.split(",").map((l) => l.trim()).filter(Boolean) : null,
        has_ads: form.has_ads, monetization_type: form.monetization_type,
        price_inr: isPayPerVideo ? Number(form.price_inr) : null, price_usd: isPayPerVideo ? Number(form.price_usd) : null,
        revenue_tiers: tiers.map((t) => ({ min_minutes: Number(t.min_minutes), max_minutes: t.max_minutes === "" ? null : Number(t.max_minutes), rate_per_minute_inr: Number(t.rate_per_minute_inr) })),
        cast: cast.filter((c) => c.name.trim()).map((c) => ({
          person_id: c.person_id || null,
          name: c.name.trim(), character_role: c.character_role.trim() || null,
          occupation: c.occupation.trim() || null, date_of_birth: c.date_of_birth || null, birthplace: c.birthplace.trim() || null,
          about: c.about.trim() || null, early_life: c.early_life.trim() || null, personal_life: c.personal_life.trim() || null,
          debut_initial_years: c.debut_initial_years.trim() || null, breakthrough_beyond: c.breakthrough_beyond.trim() || null,
          recent_projects: c.recent_projects.trim() || null,
        })),
        crew: crew.filter((c) => c.role.trim() && c.name.trim()).map((c) => ({
          person_id: c.person_id || null,
          role: c.role.trim(), name: c.name.trim(),
          occupation: c.occupation.trim() || null, date_of_birth: c.date_of_birth || null, birthplace: c.birthplace.trim() || null,
          about: c.about.trim() || null, early_life: c.early_life.trim() || null, personal_life: c.personal_life.trim() || null,
          debut_initial_years: c.debut_initial_years.trim() || null, breakthrough_beyond: c.breakthrough_beyond.trim() || null,
          recent_projects: c.recent_projects.trim() || null,
        })),
      };
      const updated = await editVideo(video.id, payload);
      onSave(updated);
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg p-3" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(212,175,55,0.2)" }}>
      <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(245,235,221,0.1)" }}>
        <p className="text-xs font-semibold uppercase" style={{ color: "rgba(245,235,221,0.5)" }}>Files</p>

        <div className="flex flex-wrap items-start gap-4">
          <div>
            {uploadingVideoFile ? (
              <div className="w-48">
                <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "rgba(245,235,221,0.6)" }}>
                  <span>{videoFileProgress >= 100 ? "Finalizing…" : "Uploading…"}</span>
                  <span>{videoFileProgress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${videoFileProgress}%`, background: COLORS.gold }} />
                </div>
              </div>
            ) : (
              <label
                className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
              >
                <Upload className="h-3.5 w-3.5" />
                {video.has_file ? "Replace video file" : "Upload video file"}
                <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo" className="hidden" onChange={handleVideoFileSelect} />
              </label>
            )}
            <FilePreview type="video" src={video.playback_url} label="Main video" />
          </div>

          <div>
            <label
              className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
              style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {uploadingPoster ? "Uploading poster…" : video.poster_image_url ? "Change poster" : "Upload poster"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingPoster} onChange={handlePosterSelect} />
            </label>
            <FilePreview type="image" src={video.poster_image_url} label="Poster" />
          </div>

          <div>
            {uploadingTrailer ? (
              <div className="w-48">
                <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "rgba(245,235,221,0.6)" }}>
                  <span>{trailerProgress >= 100 ? "Finalizing…" : "Uploading trailer…"}</span>
                  <span>{trailerProgress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${trailerProgress}%`, background: COLORS.gold }} />
                </div>
              </div>
            ) : (
              <label
                className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
                style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
              >
                <Upload className="h-3.5 w-3.5" />
                {video.trailer_playback_url ? "Replace trailer (hover preview)" : "Upload trailer (hover preview)"}
                <input type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/x-msvideo" className="hidden" onChange={handleTrailerSelect} />
              </label>
            )}
            <FilePreview type="video" src={video.trailer_playback_url} label="Trailer" />
          </div>
        </div>
        {fileError && <p className="text-xs font-medium" style={{ color: "#f87171" }}>{fileError}</p>}

        <SubtitleManager video={video} addFn={addAdminVideoSubtitle} deleteFn={deleteAdminVideoSubtitle} onUpdated={(updated) => onFileUpdated?.(updated)} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Title</label>
          <input type="text" value={form.title} onChange={update("title")} style={inputStyle} />
        </div>
        <Dropdown label="Section" value={form.section} options={["play", "archive"]} onChange={(v) => setForm((f) => ({ ...f, section: v }))} capitalizeOptions />
      </div>
      <div>
        <label style={labelStyle}>Description</label>
        <textarea rows={2} value={form.description} onChange={update("description")} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Release Year</label>
          <input type="number" value={form.release_year} onChange={update("release_year")} style={inputStyle} />
        </div>
        <Dropdown label="Age Rating" value={form.age_rating} options={AGE_RATINGS} onChange={(v) => setForm((f) => ({ ...f, age_rating: v }))} />
      </div>
      <div>
        <label style={labelStyle}>Categories (up to 3)</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => {
            const selected = form.categories.includes(cat);
            return (
              <button key={cat} type="button" onClick={() => toggleCategory(cat)} disabled={!selected && form.categories.length >= 3}
                className="rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-30"
                style={{ borderColor: selected ? COLORS.gold : "rgba(245,235,221,0.15)", background: selected ? "rgba(212,175,55,0.14)" : "transparent", color: selected ? COLORS.gold : "rgba(245,235,221,0.7)" }}>
                {cat}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label style={labelStyle}>Languages</label>
          <input type="text" placeholder="e.g. Bengali, English" value={form.languages} onChange={update("languages")} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Ads</label>
          <button type="button" onClick={() => setForm((f) => ({ ...f, has_ads: !f.has_ads }))} className="w-full rounded-lg border px-3 py-2 text-left text-sm" style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}>
            {form.has_ads ? "Ad Present" : "Ad Free"}
          </button>
        </div>
      </div>

      {form.has_ads && <AdCuePointManager videoId={video.id} />}
      <div>
        <label style={labelStyle}>Monetization</label>
        <div className="flex gap-2">
          {[["subscription_only", "Subscription Only"], ["pay_per_video", "Pay Per Video"]].map(([val, lbl]) => (
            <button key={val} type="button" onClick={() => setForm((f) => ({ ...f, monetization_type: val }))} className="rounded-full border px-2.5 py-1 text-xs font-medium"
              style={{ borderColor: form.monetization_type === val ? COLORS.gold : "rgba(245,235,221,0.15)", background: form.monetization_type === val ? "rgba(212,175,55,0.14)" : "transparent", color: form.monetization_type === val ? COLORS.gold : "rgba(245,235,221,0.7)" }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      {isPayPerVideo && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div><label style={labelStyle}>Price (₹)</label><input type="number" value={form.price_inr} onChange={update("price_inr")} style={inputStyle} /></div>
          <div><label style={labelStyle}>Price ($)</label><input type="number" value={form.price_usd} onChange={update("price_usd")} style={inputStyle} /></div>
        </div>
      )}
      <div>
        <label style={labelStyle}>Revenue-Share Tiers</label>
        <div className="flex flex-col gap-1.5">
          {tiers.map((t) => (
            <div key={t.key} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-1.5">
              <input type="number" placeholder="Min" value={t.min_minutes} onChange={(e) => updateTier(t.key, "min_minutes", e.target.value)} style={inputStyle} />
              <input type="number" placeholder="Max" value={t.max_minutes} onChange={(e) => updateTier(t.key, "max_minutes", e.target.value)} style={inputStyle} />
              <input type="number" step="0.01" placeholder="Rate" value={t.rate_per_minute_inr} onChange={(e) => updateTier(t.key, "rate_per_minute_inr", e.target.value)} style={inputStyle} />
              <button type="button" onClick={() => removeTier(t.key)} disabled={tiers.length === 1} className="flex h-8 w-8 items-center justify-center disabled:opacity-30" style={{ color: "#f87171" }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        {tiers.length < 5 && <button type="button" onClick={addTier} className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.gold }}><Plus className="h-3 w-3" /> Add tier</button>}
      </div>
      <div>
        <label style={labelStyle}>Cast</label>
        <div className="flex flex-col gap-2">
          {cast.map((c) => (
            <div key={c.key} className="rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="grid grid-cols-[1fr_1fr_28px] items-center gap-1.5 p-1">
                <input type="text" placeholder="Name" value={c.name} onChange={(e) => updateCast(c.key, "name", e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Character" value={c.character_role} onChange={(e) => updateCast(c.key, "character_role", e.target.value)} style={inputStyle} />
                <button type="button" onClick={() => removeCast(c.key)} className="flex h-8 w-8 items-center justify-center" style={{ color: "#f87171" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <button type="button" onClick={() => updateCast(c.key, "showBio", !c.showBio)} className="px-1 pb-1.5 text-[11px] font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                {c.showBio ? "− Hide biography details" : "+ Add biography details"}
              </button>
              {c.showBio && (
                <div className="grid gap-1.5 p-1 pt-0 sm:grid-cols-2">
                  <input type="text" placeholder="Occupation (e.g. Actor, Writer)" value={c.occupation} onChange={(e) => updateCast(c.key, "occupation", e.target.value)} style={inputStyle} />
                  <input type="date" value={c.date_of_birth} onChange={(e) => updateCast(c.key, "date_of_birth", e.target.value)} style={inputStyle} />
                  <input type="text" placeholder="Birthplace" value={c.birthplace} onChange={(e) => updateCast(c.key, "birthplace", e.target.value)} className="sm:col-span-2" style={inputStyle} />
                  <textarea rows={2} placeholder="About" value={c.about} onChange={(e) => updateCast(c.key, "about", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Early Life" value={c.early_life} onChange={(e) => updateCast(c.key, "early_life", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Personal Life" value={c.personal_life} onChange={(e) => updateCast(c.key, "personal_life", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Debut & Initial Years" value={c.debut_initial_years} onChange={(e) => updateCast(c.key, "debut_initial_years", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Breakthrough & Beyond" value={c.breakthrough_beyond} onChange={(e) => updateCast(c.key, "breakthrough_beyond", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Recent Projects" value={c.recent_projects} onChange={(e) => updateCast(c.key, "recent_projects", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              )}
            </div>
          ))}
        </div>
        {cast.length < 10 && <button type="button" onClick={addCast} className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.gold }}><Plus className="h-3 w-3" /> Add cast</button>}
      </div>
      <div>
        <label style={labelStyle}>Crew</label>
        <div className="flex flex-col gap-2">
          {crew.map((c) => (
            <div key={c.key} className="rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="grid grid-cols-[1fr_1fr_28px] items-center gap-1.5 p-1">
                <input type="text" placeholder="Role" value={c.role} onChange={(e) => updateCrew(c.key, "role", e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Name" value={c.name} onChange={(e) => updateCrew(c.key, "name", e.target.value)} style={inputStyle} />
                <button type="button" onClick={() => removeCrew(c.key)} className="flex h-8 w-8 items-center justify-center" style={{ color: "#f87171" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <button type="button" onClick={() => updateCrew(c.key, "showBio", !c.showBio)} className="px-1 pb-1.5 text-[11px] font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
                {c.showBio ? "− Hide biography details" : "+ Add biography details"}
              </button>
              {c.showBio && (
                <div className="grid gap-1.5 p-1 pt-0 sm:grid-cols-2">
                  <input type="text" placeholder="Occupation (e.g. Director)" value={c.occupation} onChange={(e) => updateCrew(c.key, "occupation", e.target.value)} style={inputStyle} />
                  <input type="date" value={c.date_of_birth} onChange={(e) => updateCrew(c.key, "date_of_birth", e.target.value)} style={inputStyle} />
                  <input type="text" placeholder="Birthplace" value={c.birthplace} onChange={(e) => updateCrew(c.key, "birthplace", e.target.value)} className="sm:col-span-2" style={inputStyle} />
                  <textarea rows={2} placeholder="About" value={c.about} onChange={(e) => updateCrew(c.key, "about", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Early Life" value={c.early_life} onChange={(e) => updateCrew(c.key, "early_life", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Personal Life" value={c.personal_life} onChange={(e) => updateCrew(c.key, "personal_life", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Debut & Initial Years" value={c.debut_initial_years} onChange={(e) => updateCrew(c.key, "debut_initial_years", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Breakthrough & Beyond" value={c.breakthrough_beyond} onChange={(e) => updateCrew(c.key, "breakthrough_beyond", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                  <textarea rows={2} placeholder="Recent Projects" value={c.recent_projects} onChange={(e) => updateCrew(c.key, "recent_projects", e.target.value)} className="sm:col-span-2" style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              )}
            </div>
          ))}
        </div>
        {crew.length < 5 && <button type="button" onClick={addCrew} className="mt-1 flex items-center gap-1 text-xs" style={{ color: COLORS.gold }}><Plus className="h-3 w-3" /> Add crew</button>}
      </div>

      {error && <p className="text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      <div className="flex items-center gap-2">
        <button type="button" disabled={!canSubmit || submitting} onClick={handleSubmit} className="rounded-full px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40" style={{ background: COLORS.gold }}>
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
      </div>
    </div>
  );
}

// Ad schedule for THIS video — which Ad (from the shared library, see
// Admin > Ad Library) plays at which offset. offset_seconds=0 is a
// pre-roll; anything higher is a mid-roll at that second in the
// content. Only ever takes effect in the player while this video's
// "Ad Present" toggle above is on.
function AdCuePointManager({ videoId }) {
  const [ads, setAds] = useState([]);
  const [cuePoints, setCuePoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedAdId, setSelectedAdId] = useState("");
  const [offsetInput, setOffsetInput] = useState("0");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchAdminAds(), fetchAdminVideoCuePoints(videoId)])
      .then(([allAds, cues]) => {
        setAds(allAds.filter((a) => a.is_active));
        setCuePoints(cues);
      })
      .catch(() => {
        setAds([]);
        setCuePoints([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [videoId]);

  const handleAddCue = async () => {
    if (!selectedAdId) return;
    const offset = Number(offsetInput);
    if (Number.isNaN(offset) || offset < 0) return;
    setError("");
    setAdding(true);
    try {
      await addAdminVideoCuePoint(videoId, selectedAdId, offset);
      setOffsetInput("0");
      load();
    } catch (err) {
      setError(err.message || "Couldn't add cue point.");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteCue = async (cueId) => {
    setBusyId(cueId);
    setError("");
    try {
      await deleteAdminVideoCuePoint(videoId, cueId);
      load();
    } catch (err) {
      setError(err.message || "Couldn't remove cue point.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.2)" }}>
      <p style={labelStyle}>Ad schedule</p>
      <p className="mb-2 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
        0 seconds = pre-roll (plays before the video starts). Any other value = mid-roll at that point.
      </p>

      {loading ? (
        <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : (
        <>
          {cuePoints.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              {cuePoints.map((cue) => (
                <div key={cue.id} className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs" style={{ background: "rgba(245,235,221,0.05)" }}>
                  <span style={{ color: COLORS.cream }}>
                    <strong style={{ color: COLORS.gold }}>{cue.offset_seconds === 0 ? "Pre-roll" : `${cue.offset_seconds}s`}</strong> — {cue.ad_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCue(cue.id)}
                    disabled={busyId === cue.id}
                    className="text-red-400 disabled:opacity-50"
                    aria-label="Remove cue point"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {ads.length === 0 ? (
            <p className="text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
              No ads in the library yet — add one under Admin &gt; Ad Library first.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedAdId}
                onChange={(e) => setSelectedAdId(e.target.value)}
                className="rounded-md border px-2 py-1.5 text-xs"
                style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              >
                <option value="" style={{ background: COLORS.panel, color: COLORS.cream }}>Select ad…</option>
                {ads.map((ad) => (
                  <option key={ad.id} value={ad.id} style={{ background: COLORS.panel, color: COLORS.cream }}>{ad.name}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={offsetInput}
                onChange={(e) => setOffsetInput(e.target.value)}
                placeholder="Seconds (0 = start)"
                className="w-32 rounded-md border px-2 py-1.5 text-xs"
                style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              />
              <button
                type="button"
                onClick={handleAddCue}
                disabled={adding || !selectedAdId}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-xs" style={{ color: "#f87171" }}>{error}</p>}
        </>
      )}
    </div>
  );
}
