import React, { useEffect, useState } from "react";
import { Clapperboard, UploadCloud, X, Pencil } from "lucide-react";
import { fetchAdminTheaterHeroSlides, createAdminTheaterHeroSlide, updateAdminTheaterHeroSlideText, deleteAdminTheaterHeroSlide } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

const EMPTY_FORM = { category: "", venue: "", title: "", synopsis: "" };

export default function AdminTheaterHeroSlidesPage() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newForm, setNewForm] = useState(EMPTY_FORM);
  const [newImage, setNewImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminTheaterHeroSlides()
      .then(setSlides)
      .catch((err) => setError(err.message || "Couldn't load slides."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newImage || !newForm.title.trim()) return;
    setUploading(true);
    setUploadProgress(0);
    setError("");
    try {
      await createAdminTheaterHeroSlide(newImage, newForm, setUploadProgress);
      setNewForm(EMPTY_FORM);
      setNewImage(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't upload.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditForm({ category: s.category || "", venue: s.venue || "", title: s.title, synopsis: s.synopsis || "" });
  };

  const handleSaveEdit = async () => {
    if (!editForm.title.trim()) return;
    setSavingId(editingId);
    setError("");
    try {
      await updateAdminTheaterHeroSlideText(editingId, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (slideId) => {
    setDeletingId(slideId);
    setError("");
    try {
      await deleteAdminTheaterHeroSlide(slideId);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <Clapperboard className="h-6 w-6" style={{ color: COLORS.gold }} /> Ticketing Hero Slides
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        The auto-advancing carousel at the top of Ticketing — one uploaded photo per slide, shown both as the large background and the small circular thumbnail below it.
      </p>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {/* ---------------- Add new slide ---------------- */}
      <div className="mb-8 max-w-xl rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
        <p className="mb-3 text-sm font-semibold" style={{ color: COLORS.cream }}>Add a slide</p>

        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Category</label>
            <input type="text" placeholder="e.g. Bengali Theatre" value={newForm.category} onChange={(e) => setNewForm((f) => ({ ...f, category: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Venue</label>
            <input type="text" placeholder="e.g. Academy of Fine Arts" value={newForm.venue} onChange={(e) => setNewForm((f) => ({ ...f, venue: e.target.value }))} style={inputStyle} />
          </div>
        </div>
        <div className="mb-3">
          <label style={labelStyle}>Title *</label>
          <input type="text" value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} style={inputStyle} />
        </div>
        <div className="mb-4">
          <label style={labelStyle}>Synopsis</label>
          <textarea rows={2} value={newForm.synopsis} onChange={(e) => setNewForm((f) => ({ ...f, synopsis: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} />
        </div>

        <label
          className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm font-medium hover:opacity-80"
          style={{ borderColor: "rgba(212,175,55,0.3)", color: uploading ? "rgba(245,235,221,0.4)" : COLORS.gold }}
        >
          <div className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4" />
            {newImage ? newImage.name : "Click to choose a photo"}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            className="hidden"
            onChange={(e) => setNewImage(e.target.files?.[0] || null)}
          />
        </label>

        {uploading && (
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(245,235,221,0.1)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: COLORS.gold }} />
          </div>
        )}

        <button
          type="button"
          onClick={handleCreate}
          disabled={uploading || !newImage || !newForm.title.trim()}
          className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          {uploading ? `Uploading… ${uploadProgress}%` : "Add slide"}
        </button>
      </div>

      {/* ---------------- Existing slides ---------------- */}
      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : slides.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No slides yet — the carousel won't show until at least one is added.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {slides.map((s) => (
            <div key={s.id} className="flex gap-4 rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              <img src={s.image_url} alt="" className="h-20 w-20 flex-shrink-0 rounded-lg object-cover" style={{ border: "1px solid rgba(245,235,221,0.15)" }} />

              {editingId === s.id ? (
                <div className="flex-1">
                  <div className="mb-2 grid gap-2 sm:grid-cols-2">
                    <input type="text" placeholder="Category" value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))} style={inputStyle} />
                    <input type="text" placeholder="Venue" value={editForm.venue} onChange={(e) => setEditForm((f) => ({ ...f, venue: e.target.value }))} style={inputStyle} />
                  </div>
                  <input type="text" placeholder="Title" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} style={{ ...inputStyle, marginBottom: 8 }} />
                  <textarea rows={2} placeholder="Synopsis" value={editForm.synopsis} onChange={(e) => setEditForm((f) => ({ ...f, synopsis: e.target.value }))} style={{ ...inputStyle, resize: "vertical", marginBottom: 8 }} />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={savingId === s.id || !editForm.title.trim()}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {savingId === s.id ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-4 py-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide" style={{ color: COLORS.gold }}>
                      {[s.category, s.venue].filter(Boolean).join(" · ") || "No category/venue"}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{s.title}</p>
                    {s.synopsis && <p className="mt-1 line-clamp-2 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{s.synopsis}</p>}
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                      style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      disabled={deletingId === s.id}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                    >
                      <X className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
