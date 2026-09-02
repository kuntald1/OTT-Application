import React, { useEffect, useState } from "react";
import { Users, UploadCloud, X, Pencil } from "lucide-react";
import { fetchAdminTicketingPortraits, createAdminTicketingPortrait, updateAdminTicketingPortraitCaption, deleteAdminTicketingPortrait } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};

export default function AdminTicketingPortraitsPage() {
  const [portraits, setPortraits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newCaption, setNewCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [editingId, setEditingId] = useState(null);
  const [editCaption, setEditCaption] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminTicketingPortraits()
      .then(setPortraits)
      .catch((err) => setError(err.message || "Couldn't load portraits."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setError("");
    try {
      await createAdminTicketingPortrait(file, newCaption.trim(), setUploadProgress);
      setNewCaption("");
      load();
    } catch (err) {
      setError(err.message || "Couldn't upload.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const startEdit = (p) => { setEditingId(p.id); setEditCaption(p.caption || ""); };

  const handleSaveCaption = async (portraitId) => {
    setSavingId(portraitId);
    setError("");
    try {
      await updateAdminTicketingPortraitCaption(portraitId, editCaption.trim());
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (portraitId) => {
    setDeletingId(portraitId);
    setError("");
    try {
      await deleteAdminTicketingPortrait(portraitId);
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
        <Users className="h-6 w-6" style={{ color: COLORS.gold }} /> Ticketing Portraits
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        The circular photo strip shown on the Ticketing page — add a photo, optionally give it a caption, remove any time.
      </p>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      <div className="mb-6 max-w-md rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
        <p className="mb-3 text-sm font-semibold" style={{ color: COLORS.cream }}>Add a portrait</p>
        <input
          type="text"
          placeholder="Caption (optional)"
          value={newCaption}
          onChange={(e) => setNewCaption(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        <label
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm font-medium hover:opacity-80"
          style={{ borderColor: "rgba(212,175,55,0.3)", color: uploading ? "rgba(245,235,221,0.4)" : COLORS.gold }}
        >
          <div className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4" />
            {uploading ? `Uploading… ${uploadProgress}%` : "Click to choose a photo"}
          </div>
          {uploading && (
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full" style={{ background: "rgba(245,235,221,0.1)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: COLORS.gold }} />
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            className="hidden"
            onChange={(e) => { handleUpload(e.target.files?.[0]); e.target.value = ""; }}
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : portraits.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No portraits yet.</p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {portraits.map((p) => (
            <div key={p.id} className="flex w-36 flex-col items-center gap-2 rounded-xl p-3" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              <div className="relative">
                <img src={p.image_url} alt="" className="h-20 w-20 rounded-full object-cover" style={{ border: "1px solid rgba(245,235,221,0.15)" }} />
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full disabled:opacity-50"
                  style={{ background: "#f87171", color: "#fff" }}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {editingId === p.id ? (
                <>
                  <input
                    type="text"
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    style={{ ...inputStyle, padding: "6px 8px", fontSize: 12, textAlign: "center" }}
                    placeholder="Caption"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleSaveCaption(p.id)}
                      disabled={savingId === p.id}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {savingId === p.id ? "…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-3 py-1 text-[11px] font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => startEdit(p)} className="flex items-center gap-1 text-xs hover:opacity-80" style={{ color: p.caption ? COLORS.cream : "rgba(245,235,221,0.35)" }}>
                  <Pencil className="h-3 w-3" style={{ color: COLORS.gold }} />
                  <span className="max-w-[6.5rem] truncate">{p.caption || "Add caption"}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
