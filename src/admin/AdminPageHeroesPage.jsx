import React, { useEffect, useState } from "react";
import { Image as ImageIcon, Video as VideoIcon, Type, Clapperboard, UploadCloud, X } from "lucide-react";
import { fetchAdminPageHeroes, updateAdminPageHeroDetails, addAdminPageHeroMedia, deleteAdminPageHeroMedia } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

const PAGES = [
  { key: "plays", label: "Plays" },
  { key: "archive", label: "Archive" },
  { key: "community", label: "Community" },
  { key: "ticketing", label: "Ticketing" },
];

const CONTENT_TYPES = [
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "video", label: "Video", icon: VideoIcon },
  { id: "text", label: "Text only", icon: Type },
];

export default function AdminPageHeroesPage() {
  const [pageKey, setPageKey] = useState("plays");
  const [heroesByKey, setHeroesByKey] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState({ content_type: "text", eyebrow: "", headline: "", subtext: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const hero = heroesByKey[pageKey];

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminPageHeroes()
      .then((rows) => {
        const map = {};
        rows.forEach((r) => { map[r.page_key] = r; });
        setHeroesByKey(map);
      })
      .catch((err) => setError(err.message || "Couldn't load page heroes."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    setForm({
      content_type: hero?.content_type || "text",
      eyebrow: hero?.eyebrow || "",
      headline: hero?.headline || "",
      subtext: hero?.subtext || "",
    });
    setSaved(false);
  }, [pageKey, hero]);

  const handleSaveDetails = async () => {
    if (!form.headline.trim()) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await updateAdminPageHeroDetails(pageKey, form);
      setHeroesByKey((m) => ({ ...m, [pageKey]: updated }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const updated = await addAdminPageHeroMedia(pageKey, fileList);
      setHeroesByKey((m) => ({ ...m, [pageKey]: updated }));
    } catch (err) {
      setError(err.message || "Couldn't upload.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMedia = async (mediaId) => {
    setDeletingId(mediaId);
    setError("");
    try {
      const updated = await deleteAdminPageHeroMedia(pageKey, mediaId);
      setHeroesByKey((m) => ({ ...m, [pageKey]: updated }));
    } catch (err) {
      setError(err.message || "Couldn't remove that file.");
    } finally {
      setDeletingId(null);
    }
  };

  const mediaAccept = form.content_type === "image" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/webm,video/quicktime";
  const showMediaSection = form.content_type === "image" || form.content_type === "video";

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <Clapperboard className="h-6 w-6" style={{ color: COLORS.gold }} /> Page Heroes
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Manage the banner shown at the top of Plays, Archive, Community, and Ticketing — image, video, or text only.
        A hero can hold several images or videos, which rotate automatically like a slideshow.
      </p>

      <div className="mb-6 flex gap-2">
        {PAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPageKey(p.key)}
            className="rounded-full px-4 py-1.5 text-xs font-semibold"
            style={pageKey === p.key ? { background: COLORS.gold, color: "#0a0104" } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : (
        <div className="flex max-w-2xl flex-col gap-6">

          {/* ---------------- Step 1: Content Type ---------------- */}
          <div className="rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
            <p className="mb-1 text-sm font-semibold" style={{ color: COLORS.cream }}>1. What should this hero show?</p>
            <p className="mb-3 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>Choose one — this decides whether the section below asks for images, videos, or nothing.</p>
            <div className="flex gap-2">
              {CONTENT_TYPES.map((t) => {
                const Icon = t.icon;
                const active = form.content_type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, content_type: t.id }))}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium"
                    style={active ? { background: "rgba(212,175,55,0.15)", color: COLORS.gold, border: "1px solid rgba(212,175,55,0.4)" } : { background: "rgba(245,235,221,0.04)", color: "rgba(245,235,221,0.6)", border: "1px solid transparent" }}
                  >
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------------- Step 2: Media (only if Image/Video) ---------------- */}
          {showMediaSection && (
            <div className="rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              <p className="mb-1 text-sm font-semibold" style={{ color: COLORS.cream }}>
                2. {form.content_type === "image" ? "Images" : "Videos"} for this hero
              </p>
              <p className="mb-3 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                {form.content_type === "image"
                  ? "Add one or more photos — with more than one, they'll cross-fade in a slideshow."
                  : "Add one or more video clips — with more than one, they'll play one after another in a loop."}
                {" "}Changes here save immediately, no need to click Save below.
              </p>

              {hero?.media?.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-3">
                  {hero.media.map((m, i) => (
                    <div key={m.id} className="relative">
                      {form.content_type === "image" ? (
                        <img src={m.media_url} alt="" className="h-20 w-32 rounded-lg object-cover" style={{ border: "1px solid rgba(245,235,221,0.15)" }} />
                      ) : (
                        <video src={m.media_url} className="h-20 w-32 rounded-lg object-cover" style={{ border: "1px solid rgba(245,235,221,0.15)" }} muted />
                      )}
                      <span className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(0,0,0,0.6)", color: COLORS.cream }}>
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteMedia(m.id)}
                        disabled={deletingId === m.id}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full disabled:opacity-50"
                        style={{ background: "#f87171", color: "#fff" }}
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <label
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm font-medium hover:opacity-80"
                style={{ borderColor: "rgba(212,175,55,0.3)", color: uploading ? "rgba(245,235,221,0.4)" : COLORS.gold }}
              >
                <UploadCloud className="h-4 w-4" />
                {uploading ? "Uploading…" : `Click to add ${form.content_type === "image" ? "image(s)" : "video(s)"} — you can select more than one`}
                <input
                  type="file"
                  accept={mediaAccept}
                  multiple
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }}
                />
              </label>
            </div>
          )}

          {/* ---------------- Step 3: Text ---------------- */}
          <div className="rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
            <p className="mb-3 text-sm font-semibold" style={{ color: COLORS.cream }}>
              {showMediaSection ? "3." : "2."} Headline text
            </p>

            <div className="mb-3">
              <label style={labelStyle}>Eyebrow (small text above headline, optional)</label>
              <input type="text" value={form.eyebrow} onChange={(e) => setForm((f) => ({ ...f, eyebrow: e.target.value }))} style={inputStyle} placeholder="e.g. MOVIX ARCHIVE" />
            </div>
            <div className="mb-3">
              <label style={labelStyle}>Headline *</label>
              <input type="text" value={form.headline} onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} style={inputStyle} />
            </div>
            <div className="mb-4">
              <label style={labelStyle}>Subtext (optional)</label>
              <textarea rows={2} value={form.subtext} onChange={(e) => setForm((f) => ({ ...f, subtext: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
            </div>

            {saved && <p className="mb-3 text-xs font-medium" style={{ color: "#6FCF97" }}>Saved.</p>}

            <button
              type="button"
              onClick={handleSaveDetails}
              disabled={saving || !form.headline.trim()}
              className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
