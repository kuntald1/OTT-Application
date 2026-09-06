import React, { useEffect, useState } from "react";
import { Megaphone, UploadCloud, X, Pencil, Power } from "lucide-react";
import { fetchAdminAdBanners, createAdminAdBanner, updateAdminAdBanner, deleteAdminAdBanner, toggleAdminAdBanner } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

const PAGE_OPTIONS = [
  { key: "plays", label: "Plays" },
  { key: "archive", label: "Archive" },
  { key: "mylist", label: "My List" },
  { key: "community", label: "Community" },
  { key: "ticketing", label: "Ticketing" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = { redirectUrl: "", startDate: todayISO(), endDate: todayISO(), pages: [] };

function PageCheckboxes({ pages, onChange }) {
  const allSelected = PAGE_OPTIONS.every((p) => pages.includes(p.key));
  return (
    <div>
      <label style={labelStyle}>Show on</label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : PAGE_OPTIONS.map((p) => p.key))}
          className="rounded-full px-3 py-1.5 text-xs font-semibold"
          style={allSelected ? { background: COLORS.gold, color: "#0a0104" } : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
        >
          ALL
        </button>
        {PAGE_OPTIONS.map((p) => {
          const checked = pages.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(checked ? pages.filter((k) => k !== p.key) : [...pages, p.key])}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={checked ? { background: "rgba(212,175,55,0.18)", color: COLORS.gold, border: "1px solid rgba(212,175,55,0.4)" } : { background: "rgba(245,235,221,0.04)", color: "rgba(245,235,221,0.6)", border: "1px solid transparent" }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminAdBannersPage() {
  const [banners, setBanners] = useState([]);
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
  const [togglingId, setTogglingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError("");
    fetchAdminAdBanners()
      .then(setBanners)
      .catch((err) => setError(err.message || "Couldn't load banners."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newImage || !newForm.redirectUrl.trim() || newForm.pages.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setError("");
    try {
      await createAdminAdBanner(newImage, newForm, setUploadProgress);
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

  const startEdit = (b) => {
    setEditingId(b.id);
    setEditForm({ redirectUrl: b.redirect_url, startDate: b.start_date, endDate: b.end_date, pages: b.pages });
  };

  const handleSaveEdit = async () => {
    if (!editForm.redirectUrl.trim() || editForm.pages.length === 0) return;
    setSavingId(editingId);
    setError("");
    try {
      await updateAdminAdBanner(editingId, editForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSavingId(null);
    }
  };

  const handleToggle = async (bannerId) => {
    setTogglingId(bannerId);
    setError("");
    try {
      await toggleAdminAdBanner(bannerId);
      load();
    } catch (err) {
      setError(err.message || "Couldn't toggle.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (bannerId) => {
    setDeletingId(bannerId);
    setError("");
    try {
      await deleteAdminAdBanner(bannerId);
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
        <Megaphone className="h-6 w-6" style={{ color: COLORS.gold }} /> Ad Banners
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        The auto-sliding promo banner at the top of Plays, Archive, My List, Community, and Ticketing — image, redirect link (opens in a new tab), an active date range, and which page(s) it shows on.
      </p>

      {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

      {/* ---------------- Add new banner ---------------- */}
      <div className="mb-8 max-w-xl rounded-xl p-5" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
        <p className="mb-3 text-sm font-semibold" style={{ color: COLORS.cream }}>Add a banner</p>

        <div className="mb-3">
          <label style={labelStyle}>Redirect URL *</label>
          <input type="text" placeholder="https://…" value={newForm.redirectUrl} onChange={(e) => setNewForm((f) => ({ ...f, redirectUrl: e.target.value }))} style={inputStyle} />
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label style={labelStyle}>Start Date *</label>
            <input type="date" value={newForm.startDate} onChange={(e) => setNewForm((f) => ({ ...f, startDate: e.target.value }))} style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
          <div>
            <label style={labelStyle}>End Date *</label>
            <input type="date" value={newForm.endDate} min={newForm.startDate} onChange={(e) => setNewForm((f) => ({ ...f, endDate: e.target.value }))} style={{ ...inputStyle, colorScheme: "dark" }} />
          </div>
        </div>
        <div className="mb-4">
          <PageCheckboxes pages={newForm.pages} onChange={(pages) => setNewForm((f) => ({ ...f, pages }))} />
        </div>

        <label
          className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm font-medium hover:opacity-80"
          style={{ borderColor: "rgba(212,175,55,0.3)", color: uploading ? "rgba(245,235,221,0.4)" : COLORS.gold }}
        >
          <div className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4" />
            {newImage ? newImage.name : "Click to choose a banner image"}
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
          disabled={uploading || !newImage || !newForm.redirectUrl.trim() || newForm.pages.length === 0}
          className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          {uploading ? `Uploading… ${uploadProgress}%` : "Add banner"}
        </button>
      </div>

      {/* ---------------- Existing banners ---------------- */}
      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : banners.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No banners yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {banners.map((b) => (
            <div key={b.id} className="flex gap-4 rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              <img src={b.image_url} alt="" className="h-20 w-32 flex-shrink-0 rounded-lg object-cover" style={{ border: "1px solid rgba(245,235,221,0.15)" }} />

              {editingId === b.id ? (
                <div className="flex-1">
                  <input type="text" placeholder="Redirect URL" value={editForm.redirectUrl} onChange={(e) => setEditForm((f) => ({ ...f, redirectUrl: e.target.value }))} style={{ ...inputStyle, marginBottom: 8 }} />
                  <div className="mb-2 grid gap-2 sm:grid-cols-2">
                    <input type="date" value={editForm.startDate} onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))} style={{ ...inputStyle, colorScheme: "dark" }} />
                    <input type="date" value={editForm.endDate} min={editForm.startDate} onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))} style={{ ...inputStyle, colorScheme: "dark" }} />
                  </div>
                  <div className="mb-3">
                    <PageCheckboxes pages={editForm.pages} onChange={(pages) => setEditForm((f) => ({ ...f, pages }))} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={savingId === b.id}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {savingId === b.id ? "Saving…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-full px-4 py-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.cream }}>
                      <span className="truncate">{b.redirect_url}</span>
                      <span
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                        style={b.is_active ? { background: "rgba(111,207,151,0.15)", color: "#6FCF97" } : { background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)" }}
                      >
                        {b.is_active ? "Active" : "Disabled"}
                      </span>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{b.start_date} → {b.end_date}</p>
                    <p className="mt-1 text-xs" style={{ color: COLORS.gold }}>
                      {b.pages.map((p) => PAGE_OPTIONS.find((o) => o.key === p)?.label || p).join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggle(b.id)}
                      disabled={togglingId === b.id}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={b.is_active ? { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" } : { background: "rgba(111,207,151,0.12)", color: "#6FCF97" }}
                    >
                      <Power className="h-3 w-3" /> {b.is_active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(b)}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                      style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(b.id)}
                      disabled={deletingId === b.id}
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
