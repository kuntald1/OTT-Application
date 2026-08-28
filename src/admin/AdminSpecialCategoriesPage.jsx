import React, { useEffect, useState } from "react";
import { Sparkles, Plus, Check, EyeOff, Eye, Trash2, X } from "lucide-react";
import {
  createAdminSpecialCategory, fetchAdminSpecialCategories, updateAdminSpecialCategory,
  toggleAdminSpecialCategoryDisabled, deleteAdminSpecialCategory,
  addVideoToAdminSpecialCategory, removeVideoFromAdminSpecialCategory,
  fetchAdminVideos, fetchAdminUsers,
} from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

export default function AdminSpecialCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [visibleFrom, setVisibleFrom] = useState("");
  const [visibleTo, setVisibleTo] = useState("");
  const [section, setSection] = useState("play");
  const [creating, setCreating] = useState(false);

  const [managingId, setManagingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = () => {
    setLoading(true);
    fetchAdminSpecialCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!title.trim() || !visibleFrom || !visibleTo) return;
    setError("");
    setCreating(true);
    try {
      await createAdminSpecialCategory(title.trim(), visibleFrom, visibleTo, section);
      setTitle(""); setVisibleFrom(""); setVisibleTo(""); setSection("play");
      setShowCreateForm(false);
      load();
    } catch (err) {
      setError(err.message || "Couldn't create special category.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleDisabled = async (id) => {
    setBusyId(id);
    setError("");
    try {
      await toggleAdminSpecialCategoryDisabled(id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't update.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    setBusyId(confirmDelete.id);
    setError("");
    try {
      await deleteAdminSpecialCategory(confirmDelete.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete.");
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold" style={{ color: COLORS.cream }}>
            <Sparkles className="h-5 w-5" style={{ color: COLORS.gold }} /> Special Categories
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            A curated row (e.g. "Sunday Special") that shows above every other row on Play/Archive, only
            between the dates you set — it disappears on its own after the end date, no cleanup needed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Plus className="h-4 w-4" /> New Special Category
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>
          {error}
        </div>
      )}

      {showCreateForm && (
        <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label style={labelStyle}>Title</label>
              <input type="text" placeholder="e.g. Sunday Special" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Visible In</label>
              <select value={section} onChange={(e) => setSection(e.target.value)} style={inputStyle}>
                <option value="play" style={{ background: COLORS.panel }}>Play</option>
                <option value="archive" style={{ background: COLORS.panel }}>Archive</option>
                <option value="both" style={{ background: COLORS.panel }}>Both</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Visible From</label>
              <input type="date" value={visibleFrom} onChange={(e) => setVisibleFrom(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Visible To</label>
              <input type="date" value={visibleTo} onChange={(e) => setVisibleTo(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !title.trim() || !visibleFrom || !visibleTo}
            className="mt-3 rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: COLORS.gold, color: "#0a0104" }}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : categories.length === 0 ? (
        <p style={{ color: "rgba(245,235,221,0.5)" }}>No special categories yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {categories.map((c) => (
            <div key={c.id} className="rounded-xl p-4" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(245,235,221,0.1)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-semibold" style={{ color: COLORS.cream }}>{c.title}</p>
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                    {c.visible_from} → {c.visible_to} · {c.section} · {c.video_count} video{c.video_count === 1 ? "" : "s"}
                    {c.is_disabled && <span style={{ color: "#f87171" }}> · Disabled</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setManagingId(managingId === c.id ? null : c.id)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}
                  >
                    {managingId === c.id ? "Close" : "Manage videos"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleDisabled(c.id)}
                    disabled={busyId === c.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                  >
                    {c.is_disabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {c.is_disabled ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(c)}
                    disabled={busyId === c.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>

              {managingId === c.id && (
                <VideoPicker category={c} onChanged={load} />
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete special category"
        message={`Permanently delete "${confirmDelete?.title}"? Its video selections go with it. This can't be undone.`}
        confirmLabel="Delete"
        danger
        busy={busyId === confirmDelete?.id}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}

function VideoPicker({ category, onChanged }) {
  const [allVideos, setAllVideos] = useState([]);
  const [creators, setCreators] = useState([]);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAdminVideos("published"), fetchAdminUsers()])
      .then(([videos, users]) => {
        setAllVideos(videos);
        setCreators((users || []).filter((u) => u.role === "Content Creator" || u.role === "Plays Organiser"));
      })
      .catch(() => { setAllVideos([]); setCreators([]); })
      .finally(() => setLoading(false));
  }, []);

  const selectedIds = new Set(category.videos.map((v) => v.id));

  const visibleVideos = creatorFilter
    ? allVideos.filter((v) => v.uploaded_by_name === creatorFilter)
    : allVideos;

  const handleToggle = async (video) => {
    setToggling(video.id);
    try {
      if (selectedIds.has(video.id)) {
        await removeVideoFromAdminSpecialCategory(category.id, video.id);
      } else {
        await addVideoToAdminSpecialCategory(category.id, video.id);
      }
      onChanged();
    } catch (err) {
      // best-effort UI; the list refresh via onChanged() will reflect actual state either way
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(245,235,221,0.08)" }}>
      <div className="mb-2 flex items-center gap-2">
        <label className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Filter by creator:</label>
        <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)} className="rounded-lg border bg-transparent px-2 py-1 text-xs" style={{ borderColor: "rgba(245,235,221,0.15)", color: COLORS.cream }}>
          <option value="" style={{ background: COLORS.panel }}>All creators</option>
          {creators.map((c) => (
            <option key={c.id} value={c.name} style={{ background: COLORS.panel }}>{c.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Loading videos…</p>
      ) : visibleVideos.length === 0 ? (
        <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>No published videos found.</p>
      ) : (
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {visibleVideos.map((v) => (
            <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
              <input
                type="checkbox"
                checked={selectedIds.has(v.id)}
                disabled={toggling === v.id}
                onChange={() => handleToggle(v)}
                className="h-4 w-4"
              />
              <span className="text-xs" style={{ color: COLORS.cream }}>{v.title}</span>
              <span className="text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>— {v.uploaded_by_name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
