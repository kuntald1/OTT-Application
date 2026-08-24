import React, { useEffect, useState } from "react";
import { Megaphone, Plus, Trash2, Pencil, Check, X, EyeOff, Eye } from "lucide-react";
import { fetchAdminAds, createAdminAd, updateAdminAd, deleteAdminAd } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

export default function AdminAdsPage() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newVastUrl, setNewVastUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editVastUrl, setEditVastUrl] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    fetchAdminAds()
      .then(setAds)
      .catch(() => setAds([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!newName.trim() || !newVastUrl.trim()) return;
    setError("");
    setAdding(true);
    try {
      await createAdminAd(newName.trim(), newVastUrl.trim());
      setNewName("");
      setNewVastUrl("");
      load();
    } catch (err) {
      setError(err.message || "Couldn't add ad.");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (ad) => {
    setEditingId(ad.id);
    setEditName(ad.name);
    setEditVastUrl(ad.vast_tag_url);
    setError("");
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim() || !editVastUrl.trim()) return;
    setBusyId(id);
    setError("");
    try {
      await updateAdminAd(id, { name: editName.trim(), vast_tag_url: editVastUrl.trim() });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = async (ad) => {
    setBusyId(ad.id);
    setError("");
    try {
      await updateAdminAd(ad.id, { is_active: !ad.is_active });
      load();
    } catch (err) {
      setError(err.message || "Couldn't update ad.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (ad) => {
    if (!window.confirm(`Delete "${ad.name}"? This also removes it from every video's ad schedule.`)) return;
    setBusyId(ad.id);
    setError("");
    try {
      await deleteAdminAd(ad.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete ad.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold" style={{ color: COLORS.cream }}>Ad Library</h2>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        VAST tag URLs from Google Ad Manager or any VAST-compliant network. theomy doesn't validate the tag itself —
        that only happens live, when the player actually requests it during playback. Attach an ad to a video's
        schedule from that video's edit form.
      </p>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ad name (e.g. Pre-roll — Q3 campaign)"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />
        <input
          type="text"
          value={newVastUrl}
          onChange={(e) => setNewVastUrl(e.target.value)}
          placeholder="VAST tag URL"
          className="flex-[2] rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newName.trim() || !newVastUrl.trim()}
          className="flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {error && <p className="mb-4 text-sm" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : ads.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No ads yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className="rounded-xl p-4"
              style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)", opacity: ad.is_active ? 1 : 0.5 }}
            >
              {editingId === ad.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded-lg border px-3 py-1.5 text-sm outline-none"
                    style={{ borderColor: COLORS.gold, background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                  />
                  <input
                    type="text"
                    value={editVastUrl}
                    onChange={(e) => setEditVastUrl(e.target.value)}
                    className="rounded-lg border px-3 py-1.5 text-sm outline-none"
                    style={{ borderColor: COLORS.gold, background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(ad.id)}
                      disabled={busyId === ad.id}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{ background: "rgba(111,207,151,0.15)", color: "#6FCF97" }}
                    >
                      <Check className="h-3.5 w-3.5" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{ color: "rgba(245,235,221,0.5)" }}
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: COLORS.cream }}>
                      <Megaphone className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "rgba(212,175,55,0.6)" }} />
                      {ad.name}
                      {!ad.is_active && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(245,235,221,0.5)" }}>
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="mt-1 truncate text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>{ad.vast_tag_url}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(ad)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5"
                      style={{ color: "rgba(245,235,221,0.6)" }}
                      aria-label="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(ad)}
                      disabled={busyId === ad.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5 disabled:opacity-50"
                      style={{ color: "rgba(245,235,221,0.6)" }}
                      aria-label={ad.is_active ? "Deactivate" : "Activate"}
                    >
                      {ad.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(ad)}
                      disabled={busyId === ad.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/5 disabled:opacity-50"
                      style={{ color: "#f87171" }}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
