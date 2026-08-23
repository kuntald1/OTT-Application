import React, { useEffect, useState } from "react";
import { Tag, Plus, Trash2, Pencil, Check, X, EyeOff, Eye } from "lucide-react";
import { fetchAdminCategories, createAdminCategory, updateAdminCategory, deleteAdminCategory } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    fetchAdminCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setError("");
    setAdding(true);
    try {
      await createAdminCategory(label);
      setNewLabel("");
      load();
    } catch (err) {
      setError(err.message || "Couldn't add category.");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (cat) => {
    setEditingId(cat.id);
    setEditLabel(cat.label);
    setError("");
  };

  const handleSaveEdit = async (id) => {
    const label = editLabel.trim();
    if (!label) return;
    setBusyId(id);
    setError("");
    try {
      await updateAdminCategory(id, { label });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't rename category.");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (cat) => {
    setBusyId(cat.id);
    setError("");
    try {
      await updateAdminCategory(cat.id, { is_active: !cat.is_active });
      load();
    } catch (err) {
      setError(err.message || "Couldn't update category.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete "${cat.label}"? Videos already tagged with it keep the tag, but it won't be selectable for new uploads or show in the nav anymore.`)) return;
    setBusyId(cat.id);
    setError("");
    try {
      await deleteAdminCategory(cat.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete category.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold" style={{ color: COLORS.cream }}>Categories</h2>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Changes here update the site's Category nav dropdown and the video upload form's category checkboxes immediately — no redeploy needed.
      </p>

      <div className="mb-6 flex gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="New category name"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newLabel.trim()}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {error && <p className="mb-4 text-sm" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No categories yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{
                background: COLORS.panel,
                border: "1px solid rgba(255,255,255,0.08)",
                opacity: cat.is_active === false ? 0.5 : 1,
              }}
            >
              {editingId === cat.id ? (
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(cat.id)}
                  autoFocus
                  className="flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none"
                  style={{ borderColor: COLORS.gold, background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                />
              ) : (
                <span className="flex items-center gap-2 text-sm font-medium" style={{ color: COLORS.cream }}>
                  <Tag className="h-3.5 w-3.5" style={{ color: "rgba(212,175,55,0.6)" }} />
                  {cat.label}
                  {cat.is_active === false && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(245,235,221,0.5)" }}>
                      Hidden
                    </span>
                  )}
                </span>
              )}

              <div className="flex items-center gap-1.5">
                {editingId === cat.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(cat.id)}
                      disabled={busyId === cat.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-50"
                      style={{ color: "#6FCF97" }}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{ color: "rgba(245,235,221,0.5)" }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5"
                      style={{ color: "rgba(245,235,221,0.6)" }}
                      aria-label="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(cat)}
                      disabled={busyId === cat.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5 disabled:opacity-50"
                      style={{ color: "rgba(245,235,221,0.6)" }}
                      aria-label={cat.is_active === false ? "Show in nav/upload form" : "Hide from nav/upload form"}
                    >
                      {cat.is_active === false ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cat)}
                      disabled={busyId === cat.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5 disabled:opacity-50"
                      style={{ color: "#f87171" }}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
