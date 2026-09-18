import React, { useEffect, useState } from "react";
import { Sparkles, Plus, Check, EyeOff, Eye, Trash2, X, Pencil, Search } from "lucide-react";
import {
  createAdminSpecialCategory, fetchAdminSpecialCategories, updateAdminSpecialCategory,
  toggleAdminSpecialCategoryDisabled, deleteAdminSpecialCategory,
  addVideoToAdminSpecialCategory, removeVideoFromAdminSpecialCategory,
  fetchAdminVideos, fetchAdminUsers, searchAdminVideosForSpecialCategory,
} from "./adminApi";
import ConfirmDialog from "../shared/ConfirmDialog";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "8px 12px", fontSize: 13, outline: "none",
  colorScheme: "dark",
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
  const [alwaysVisible, setAlwaysVisible] = useState(true);
  const [visibleFrom, setVisibleFrom] = useState("");
  const [visibleTo, setVisibleTo] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [section, setSection] = useState("play");
  const [creating, setCreating] = useState(false);

  const [managingId, setManagingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAlwaysVisible, setEditAlwaysVisible] = useState(true);
  const [editVisibleFrom, setEditVisibleFrom] = useState("");
  const [editVisibleTo, setEditVisibleTo] = useState("");
  const [editDisplayOrder, setEditDisplayOrder] = useState(0);
  const [editSection, setEditSection] = useState("play");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchAdminSpecialCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    if (!alwaysVisible && (!visibleFrom || !visibleTo)) return;
    setError("");
    setCreating(true);
    try {
      await createAdminSpecialCategory({
        title: title.trim(),
        visibleFrom: alwaysVisible ? null : visibleFrom,
        visibleTo: alwaysVisible ? null : visibleTo,
        displayOrder: Number(displayOrder) || 0,
        section,
      });
      setTitle(""); setVisibleFrom(""); setVisibleTo(""); setDisplayOrder(0); setSection("play"); setAlwaysVisible(true);
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

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditTitle(c.title);
    setEditAlwaysVisible(!c.visible_from);
    setEditVisibleFrom(c.visible_from || "");
    setEditVisibleTo(c.visible_to || "");
    setEditDisplayOrder(c.display_order || 0);
    setEditSection(c.section);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    if (!editAlwaysVisible && (!editVisibleFrom || !editVisibleTo)) return;
    setError("");
    setSaving(true);
    try {
      await updateAdminSpecialCategory(editingId, {
        title: editTitle.trim(),
        visible_from: editAlwaysVisible ? null : editVisibleFrom,
        visible_to: editAlwaysVisible ? null : editVisibleTo,
        clear_visible_from: editAlwaysVisible,
        clear_visible_to: editAlwaysVisible,
        display_order: Number(editDisplayOrder) || 0,
        section: editSection,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSaving(false);
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
            A curated row on Play/Archive, hand-picked and ordered by you. Leave it "Always visible" for a
            permanent row (e.g. replacing an auto-generated genre row) — or set dates for a temporary
            banner (e.g. "Sunday Special") that disappears on its own after the end date.
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
              <input type="text" placeholder="e.g. Drama or Sunday Special" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
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
              <label style={labelStyle}>Order (lower shows first)</label>
              <input type="number" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} style={inputStyle} />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "rgba(245,235,221,0.7)" }}>
                <input type="checkbox" checked={alwaysVisible} onChange={(e) => setAlwaysVisible(e.target.checked)} className="h-4 w-4" />
                Always visible (no end date)
              </label>
            </div>
            {!alwaysVisible && (
              <>
                <div>
                  <label style={labelStyle}>Visible From</label>
                  <input type="date" value={visibleFrom} onChange={(e) => setVisibleFrom(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Visible To</label>
                  <input type="date" value={visibleTo} onChange={(e) => setVisibleTo(e.target.value)} style={inputStyle} />
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !title.trim() || (!alwaysVisible && (!visibleFrom || !visibleTo))}
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
              {editingId === c.id ? (
                <div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label style={labelStyle}>Title</label>
                      <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Visible In</label>
                      <select value={editSection} onChange={(e) => setEditSection(e.target.value)} style={inputStyle}>
                        <option value="play" style={{ background: COLORS.panel }}>Play</option>
                        <option value="archive" style={{ background: COLORS.panel }}>Archive</option>
                        <option value="both" style={{ background: COLORS.panel }}>Both</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Order (lower shows first)</label>
                      <input type="number" value={editDisplayOrder} onChange={(e) => setEditDisplayOrder(e.target.value)} style={inputStyle} />
                    </div>
                    <div className="flex items-end pb-1.5">
                      <label className="flex cursor-pointer items-center gap-2 text-xs" style={{ color: "rgba(245,235,221,0.7)" }}>
                        <input type="checkbox" checked={editAlwaysVisible} onChange={(e) => setEditAlwaysVisible(e.target.checked)} className="h-4 w-4" />
                        Always visible (no end date)
                      </label>
                    </div>
                    {!editAlwaysVisible && (
                      <>
                        <div>
                          <label style={labelStyle}>Visible From</label>
                          <input type="date" value={editVisibleFrom} onChange={(e) => setEditVisibleFrom(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                          <label style={labelStyle}>Visible To</label>
                          <input type="date" value={editVisibleTo} onChange={(e) => setEditVisibleTo(e.target.value)} style={inputStyle} />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={saving || !editTitle.trim() || (!editAlwaysVisible && (!editVisibleFrom || !editVisibleTo))}
                      className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-full px-4 py-2 text-xs font-medium"
                      style={{ color: "rgba(245,235,221,0.5)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-semibold" style={{ color: COLORS.cream }}>{c.title}</p>
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                    {c.visible_from ? `${c.visible_from} → ${c.visible_to}` : `Always visible · Order ${c.display_order}`} · {c.section} · {c.video_count} video{c.video_count === 1 ? "" : "s"}
                    {c.is_disabled && <span style={{ color: "#f87171" }}> · Disabled</span>}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)" }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
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
              )}

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

const MATCH_LABELS = { title: "title", cast: "cast", crew: "crew", organiser: "organiser" };

function VideoPicker({ category, onChanged }) {
  const [allVideos, setAllVideos] = useState([]);
  const [creators, setCreators] = useState([]);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  // Free-text search across title/cast/crew/organiser name (see
  // search-videos on the backend) — a curator thinking "that
  // Bohurupee play with the piano" shouldn't need to know in advance
  // whether that's a title, cast, or organiser match. Debounced so it
  // doesn't fire on every keystroke.
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null); // null = not searching, [] = no matches
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAdminVideos("published"), fetchAdminUsers()])
      .then(([videos, users]) => {
        setAllVideos(videos);
        setCreators((users || []).filter((u) => u.role === "content_creator" || u.role === "plays_organiser"));
      })
      .catch(() => { setAllVideos([]); setCreators([]); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchAdminVideosForSpecialCategory(q)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const selectedIds = new Set(category.videos.map((v) => v.id));

  const visibleVideos = creatorFilter
    ? allVideos.filter((v) => v.uploaded_by_name === creatorFilter)
    : allVideos;

  const handleToggle = async (videoId) => {
    setToggling(videoId);
    try {
      if (selectedIds.has(videoId)) {
        await removeVideoFromAdminSpecialCategory(category.id, videoId);
      } else {
        await addVideoToAdminSpecialCategory(category.id, videoId);
      }
      onChanged();
    } catch (err) {
      // best-effort UI; the list refresh via onChanged() will reflect actual state either way
    } finally {
      setToggling(null);
    }
  };

  const isSearchActive = query.trim().length >= 2;

  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(245,235,221,0.08)" }}>
      <div className="mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: "rgba(245,235,221,0.15)" }}>
        <Search className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "rgba(245,235,221,0.4)" }} />
        <input
          type="text"
          placeholder="Search by title, cast, crew, or organiser name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-transparent text-xs outline-none"
          style={{ color: COLORS.cream }}
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="flex-shrink-0">
            <X className="h-3.5 w-3.5" style={{ color: "rgba(245,235,221,0.4)" }} />
          </button>
        )}
      </div>

      {isSearchActive ? (
        searching ? (
          <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Searching…</p>
        ) : searchResults && searchResults.length === 0 ? (
          <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>No matches.</p>
        ) : (
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {(searchResults || []).map((v) => (
              <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={selectedIds.has(v.id)}
                  disabled={toggling === v.id}
                  onChange={() => handleToggle(v.id)}
                  className="h-4 w-4"
                />
                <span className="text-xs" style={{ color: COLORS.cream }}>{v.title}</span>
                <span className="text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
                  — {v.organiser_name || "Unknown"} · matched: {MATCH_LABELS[v.matched_on] || v.matched_on}
                </span>
              </label>
            ))}
          </div>
        )
      ) : (
        <>
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
                    onChange={() => handleToggle(v.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-xs" style={{ color: COLORS.cream }}>{v.title}</span>
                  <span className="text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>— {v.uploaded_by_name}</span>
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
