import React, { useEffect, useState } from "react";
import { Radio, Plus, Copy, Check, Square, Trash2, Eye, EyeOff, Pencil, X } from "lucide-react";
import { createAdminLiveStream, fetchAdminLiveStreams, endAdminLiveStream, deleteAdminLiveStream, updateAdminLiveStream } from "./adminApi";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

const STATUS_STYLES = {
  idle: { bg: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.6)" },
  active: { bg: "rgba(111,207,151,0.15)", color: "#6FCF97" },
  ended: { bg: "rgba(255,255,255,0.05)", color: "rgba(245,235,221,0.4)" },
};

function CopyableField({ label, value, secret }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!secret);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="mb-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>{label}</p>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(245,235,221,0.05)", border: "1px solid rgba(245,235,221,0.1)" }}>
        <code className="flex-1 truncate text-xs" style={{ color: COLORS.cream }}>
          {revealed ? value : "•".repeat(24)}
        </code>
        {secret && (
          <button type="button" onClick={() => setRevealed((r) => !r)} style={{ color: "rgba(245,235,221,0.5)" }}>
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
        <button type="button" onClick={handleCopy} style={{ color: copied ? "#6FCF97" : COLORS.gold }}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function AdminLiveStreamsPage() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [section, setSection] = useState("play");
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState(null);

  const [editingStream, setEditingStream] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSection, setEditSection] = useState("play");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    setLoading(true);
    fetchAdminLiveStreams()
      .then(setStreams)
      .catch(() => setStreams([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setError("");
    setCreating(true);
    try {
      const result = await createAdminLiveStream(title.trim(), description.trim(), section);
      setJustCreated(result);
      setTitle("");
      setDescription("");
      setShowCreateForm(false);
      load();
    } catch (err) {
      setError(err.message || "Couldn't create live stream.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (stream) => {
    setEditingStream(stream);
    setEditTitle(stream.title);
    setEditDescription(stream.description || "");
    setEditSection(stream.section || "play");
    setError("");
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    setSavingEdit(true);
    setError("");
    try {
      await updateAdminLiveStream(editingStream.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        section: editSection,
      });
      setEditingStream(null);
      load();
    } catch (err) {
      setError(err.message || "Couldn't save changes.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEnd = async (stream) => {
    if (!window.confirm(`End "${stream.title}"? This disconnects the broadcast and can't be undone.`)) return;
    setBusyId(stream.id);
    setError("");
    try {
      await endAdminLiveStream(stream.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't end live stream.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (stream) => {
    if (!window.confirm(`Delete "${stream.title}" permanently?`)) return;
    setBusyId(stream.id);
    setError("");
    try {
      await deleteAdminLiveStream(stream.id);
      load();
    } catch (err) {
      setError(err.message || "Couldn't delete live stream.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold" style={{ color: COLORS.cream }}>
            <Radio className="h-5 w-5" style={{ color: COLORS.gold }} /> Live Streaming
          </h2>
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
            Powered by Mux — RTMP ingest, HLS playback. Point OBS or similar at the RTMP URL + Stream Key to go live.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((s) => !s)}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Plus className="h-4 w-4" /> New Live Event
        </button>
      </div>

      {showCreateForm && (
        <div className="mb-6 rounded-xl p-5" style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.2)" }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
          />
          <select
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="mb-3 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
          >
            <option value="play" style={{ background: COLORS.panel }}>Play</option>
            <option value="archive" style={{ background: COLORS.panel }}>Archive</option>
            <option value="both" style={{ background: COLORS.panel }}>Both</option>
          </select>
          <div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="rounded-full px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: COLORS.gold, color: "#0a0104" }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {justCreated && (
        <div className="mb-6 rounded-xl p-5" style={{ background: "rgba(111,207,151,0.08)", border: "1px solid rgba(111,207,151,0.3)" }}>
          <p className="mb-3 text-sm font-semibold" style={{ color: "#6FCF97" }}>
            "{justCreated.title}" created — broadcast details below (also viewable anytime in the list).
          </p>
          <CopyableField label="RTMP URL" value={justCreated.rtmp_url} />
          <CopyableField label="Stream Key" value={justCreated.stream_key} secret />
          <button type="button" onClick={() => setJustCreated(null)} className="mt-2 text-xs underline" style={{ color: "rgba(245,235,221,0.5)" }}>
            Dismiss
          </button>
        </div>
      )}

      {error && <p className="mb-4 text-sm" style={{ color: "#f87171" }}>{error}</p>}

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
      ) : streams.length === 0 ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No live streams yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {streams.map((s) => {
            const style = STATUS_STYLES[s.status] || STATUS_STYLES.idle;
            return (
              <div key={s.id} className="rounded-xl p-4" style={{ background: COLORS.panel, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{s.title}</p>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-medium capitalize" style={{ background: style.bg, color: style.color }}>
                    {s.status}
                  </span>
                </div>
                <CopyableField label="RTMP URL" value={s.rtmp_url} />
                <CopyableField label="Stream Key" value={s.stream_key} secret />
                <CopyableField label="Playback URL" value={s.playback_url} />

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  {s.status !== "ended" && (
                    <button
                      type="button"
                      onClick={() => handleEnd(s)}
                      disabled={busyId === s.id}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                    >
                      <Square className="h-3.5 w-3.5" /> End
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    disabled={busyId === s.id}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.6)" }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingStream && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setEditingStream(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold" style={{ color: COLORS.cream }}>Edit live event</h3>
              <button type="button" onClick={() => setEditingStream(null)} style={{ color: "rgba(245,235,221,0.5)" }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title"
              className="mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="mb-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <select
              value={editSection}
              onChange={(e) => setEditSection(e.target.value)}
              className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            >
              <option value="play" style={{ background: COLORS.panel }}>Play</option>
              <option value="archive" style={{ background: COLORS.panel }}>Archive</option>
              <option value="both" style={{ background: COLORS.panel }}>Both</option>
            </select>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditingStream(null)} className="rounded-full px-4 py-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.6)" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editTitle.trim()}
                className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: COLORS.gold, color: "#0a0104" }}
              >
                {savingEdit ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
